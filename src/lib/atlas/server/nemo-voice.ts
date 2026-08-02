import "server-only";

import { resolveModelForDomain } from "@/lib/atlas/server/model-registry";
import { listCredentials } from "@/lib/atlas/server/model-registry";

const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_STT_MODEL = "whisper-large-v3";

interface OmniModel {
  id: string;
  apiKey: string;
  baseUrl: string;
}

async function resolveGroqApiKey(): Promise<string> {
  // 1) Explicit env override.
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;

  // 2) A stored credential whose key looks like a Groq key, or that points at
  //    Groq's endpoint (e.g. the "STT Key" credential added in Admin).
  const credentials = await listCredentials();
  const groq = credentials.find(
    (entry) =>
      entry.apiKey.startsWith("gsk_") ||
      (entry.baseUrl ?? "").toLowerCase().includes("groq.com")
  );

  return groq?.apiKey ?? "";
}

async function resolveOmniModel(): Promise<OmniModel | null> {
  const { readRegistry } = await import("@/lib/atlas/server/model-registry");
  const registry = await readRegistry();

  // Voice requires a real NVIDIA omni-capable model. Prefer an explicit omni
  // model, then any enabled NVIDIA model. We do NOT fall back to non-NVIDIA
  // text models, which cannot do speech I/O.
  const models = registry.models.filter((entry) => entry.enabled && entry.provider === "nvidia");
  const omni = models.find((entry) => entry.id.toLowerCase().includes("omni")) ?? models[0];

  if (!omni) return null;

  const apiKey = process.env.NVIDIA_API_KEY || omni.apiKey;
  if (!apiKey) return null;

  const baseUrl = omni.baseUrl || NVIDIA_DEFAULT_BASE_URL;
  return { id: omni.id, apiKey, baseUrl };
}

/**
 * Speech-to-text: transcribe an audio blob. Prefers Groq Whisper when a Groq
 * key is configured (fast + cheap + accurate); otherwise falls back to the
 * NVIDIA omni model.
 */
export async function transcribeAudio(
  audio: Buffer,
  mime: string
): Promise<{ text: string }> {
  const groqKey = await resolveGroqApiKey();

  if (groqKey) {
    try {
      const text = await transcribeWithGroq(audio, mime, groqKey);
      return { text };
    } catch (error) {
      // Fall through to NVIDIA if Groq fails; surface nothing until both fail.
      if (process.env.VERBOSE_VOICE) {
        console.error("Groq Whisper failed, falling back to NVIDIA:", error);
      }
    }
  }

  const model = await resolveOmniModel();
  if (!model) {
    throw new Error("No speech-capable model is configured for voice.");
  }

  const b64 = audio.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;

  const response = await fetch(`${model.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify({
      model: model.id,
      messages: [
        {
          role: "user",
          content: [
            { type: "audio_url", audio_url: { url: dataUrl } },
            { type: "text", text: "Transcribe this audio exactly." },
          ],
        },
      ],
      temperature: 0.2,
      top_k: 1,
      max_tokens: 1024,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(friendlySttError(response.status, text));
  }

  const payload: unknown = await response.json();
  const text = extractText(payload);
  if (!text.trim()) {
    throw new Error("Could not hear anything in the audio. Try speaking a little closer to the microphone.");
  }
  return { text: text.trim() };
}

/** Translate raw STT failures into a concise, human-readable message. */
function friendlySttError(status: number, body: string): string {
  const lower = body.toLowerCase();

  if (lower.includes("invalid or unsupported audio")) {
    return "The audio recording was unreadable. Check your microphone and try again.";
  }
  if (lower.includes("failed to load audio") || lower.includes("invalid audio")) {
    return "The audio recording was unreadable. Check your microphone and try again.";
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("api key")) {
    return "The speech API key is invalid. Check your provider credentials in Admin.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Speech service is busy right now. Try again in a moment.";
  }

  return `Speech transcription failed (${status}). Try speaking again.`;
}

/**
 * Groq Whisper transcription via the OpenAI-compatible multipart endpoint.
 * Accepts common audio mime types (webm, wav, mp3, m4a, ogg).
 */
async function transcribeWithGroq(audio: Buffer, mime: string, apiKey: string): Promise<string> {
  const form = new FormData();
  const filename = `recording.${extensionForMime(mime)}`;
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
  form.append("model", GROQ_STT_MODEL);
  form.append("response_format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(GROQ_STT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(friendlySttError(response.status, text));
    }

    const payload: unknown = await response.json();
    const record = isRecord(payload) ? payload : {};
    const text = typeof record.text === "string" ? record.text : "";

    if (!text.trim()) {
      throw new Error("Could not hear anything in the audio. Try speaking a little closer to the microphone.");
    }

    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function extensionForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp3")) return "mp3";
  if (mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractText(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : null;
  if (!choice) return "";
  const message = isRecord(choice.message) ? choice.message : {};
  if (typeof message.content === "string") return message.content;
  // Some omni responses nest the transcript under audio.transcript.
  if (isRecord(message.audio) && typeof message.audio.transcript === "string") {
    return message.audio.transcript;
  }
  return "";
}
