import "server-only";

import type { AtlasModelConfig } from "@/lib/atlas/server/model-registry";
import { readVoiceConfig } from "@/lib/atlas/server/model-registry";
import { resolveConfiguredSttModel } from "@/lib/atlas/server/voice-routing";

const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const OPENAI_STT_URL = "https://api.openai.com/v1/audio/transcriptions";
const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

function isWhisperStyle(model: AtlasModelConfig): boolean {
  const id = model.id.toLowerCase();
  const base = (model.baseUrl ?? "").toLowerCase();
  if (id.includes("whisper") || id.includes("transcrib")) return true;
  if (base.includes("groq.com")) return true;
  return false;
}

function isOmniStyle(model: AtlasModelConfig): boolean {
  const id = model.id.toLowerCase();
  return model.provider === "nvidia" || id.includes("omni") || id.includes("audio");
}

function transcriptionEndpoint(model: AtlasModelConfig): string {
  const base = (model.baseUrl ?? "").replace(/\/$/, "");
  if (base.includes("groq.com")) return GROQ_STT_URL;
  if (base) return `${base}/audio/transcriptions`;
  if (model.provider === "openai" || model.provider === "custom") return OPENAI_STT_URL;
  return OPENAI_STT_URL;
}

/**
 * Speech-to-text using the Admin → Voice selected STT model.
 * Falls back to auto-detected speech-capable models when unset.
 */
export async function transcribeAudio(
  audio: Buffer,
  mime: string
): Promise<{ text: string }> {
  const [model, voice] = await Promise.all([resolveConfiguredSttModel(), readVoiceConfig()]);

  if (!model) {
    throw new Error(
      "No STT model configured. Open Admin → Voice and select a speech-to-text model (or add Whisper / NVIDIA omni under Providers)."
    );
  }

  if (isWhisperStyle(model)) {
    return { text: await transcribeWithWhisperApi(audio, mime, model, voice.sttLanguage) };
  }

  if (isOmniStyle(model)) {
    return { text: await transcribeWithOmni(audio, mime, model) };
  }

  // Default: try OpenAI-compatible transcriptions endpoint first, then omni.
  try {
    return { text: await transcribeWithWhisperApi(audio, mime, model, voice.sttLanguage) };
  } catch (error) {
    if (process.env.VERBOSE_VOICE) {
      console.error("Whisper-style STT failed, trying omni path:", error);
    }
    return { text: await transcribeWithOmni(audio, mime, model) };
  }
}

async function transcribeWithOmni(
  audio: Buffer,
  mime: string,
  model: AtlasModelConfig
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY || model.apiKey;
  if (!apiKey) {
    throw new Error("The STT model has no API key. Check Admin → Providers.");
  }

  const baseUrl = model.baseUrl || NVIDIA_DEFAULT_BASE_URL;
  const b64 = audio.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
  return text.trim();
}

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

async function transcribeWithWhisperApi(
  audio: Buffer,
  mime: string,
  model: AtlasModelConfig,
  language: string
): Promise<string> {
  const apiKey = model.apiKey;
  if (!apiKey) {
    throw new Error("The STT model has no API key. Check Admin → Providers.");
  }

  const form = new FormData();
  const filename = `recording.${extensionForMime(mime)}`;
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
  form.append("model", model.id.includes("/") ? model.id.split("/").pop()! : model.id);
  form.append("response_format", "json");
  if (language) {
    // Whisper expects short codes like "en"; accept en-US → en.
    form.append("language", language.split("-")[0] || language);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(transcriptionEndpoint(model), {
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
  if (isRecord(message.audio) && typeof message.audio.transcript === "string") {
    return message.audio.transcript;
  }
  return "";
}
