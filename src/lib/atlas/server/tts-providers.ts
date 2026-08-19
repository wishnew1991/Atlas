import "server-only";

import type { AtlasModelConfig } from "./model-registry";

export type TtsProvider = "mistral" | "elevenlabs" | "google" | "edge" | "openai" | "custom" | "kokoro";

/** Detect which TTS provider a model config corresponds to. */
export function detectTtsProvider(model: AtlasModelConfig): TtsProvider {
  const id = model.id.toLowerCase();
  const base = (model.baseUrl ?? "").toLowerCase();
  const label = (model.label ?? "").toLowerCase();

  if (base.includes("api.mistral.ai") || id.includes("voxtral") || id.includes("mistral")) {
    return "mistral";
  }
  if (base.includes("api.elevenlabs.io") || id.includes("eleven") || label.includes("eleven")) {
    return "elevenlabs";
  }
  if (base.includes("texttospeech.googleapis.com") || id.includes("google") || label.includes("google") || model.provider === "google") {
    return "google";
  }
  if (base.includes("edge") || id.includes("edge") || label.includes("edge") || id === "edge-tts") {
    return "edge";
  }
  if (base.includes("api.openai.com") || id.includes("tts-1") || id.includes("gpt-4o-mini-tts") || model.provider === "openai") {
    return "openai";
  }
  if (base.includes("kokoro") || id.includes("kokoro") || label.includes("kokoro")) {
    return "kokoro";
  }
  return "custom";
}

/**
 * ElevenLabs TTS API
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech
 * Free tier: 10,000 characters/month
 */
export async function synthesizeElevenLabs(
  text: string,
  model: AtlasModelConfig,
  voice: string,
  rate: number
): Promise<{ audio: Buffer; mime: string }> {
  const apiKey = model.apiKey;
  if (!apiKey) {
    throw new Error("ElevenLabs TTS requires an API key. Add it in Admin → Providers or set ELEVENLABS_API_KEY env var.");
  }

  // Best ElevenLabs voices: eleven_multilingual_v2 model supports these
  // Popular: Adam (EXAVITQu4vr4xnSDxMa5Kz12), Rachel (21m00Tcm4TlvDq8ikWAM0)
  // For best quality, use a specific voice ID or let ElevenLabs choose
  const voiceId = voice.trim() || "EXAVITQu4vr4xnSDxMa5Kz12"; // Default: Adam (high quality male)
  const baseUrl = model.baseUrl || "https://api.elevenlabs.io/v1";

  const response = await fetch(`${baseUrl}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      // Best model for quality and multilingual support
      model_id: model.id.includes("multilingual") ? model.id : "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { audio, mime: "audio/mpeg" };
}

/**
 * Google Cloud Text-to-Speech API
 * Docs: https://cloud.google.com/text-to-speech/docs/reference/rest
 * Free tier: 1M Standard chars/month, 4M WaveNet chars/month (first 12 months)
 */
export async function synthesizeGoogleTTS(
  text: string,
  model: AtlasModelConfig,
  voice: string,
  rate: number
): Promise<{ audio: Buffer; mime: string }> {
  const apiKey = model.apiKey;
  if (!apiKey) {
    throw new Error("Google Cloud TTS requires an API key. Add it in Admin → Providers.");
  }

  // Parse voice: format can be "en-US-Wavenet-A" or just a language code
  // Default to en-US-Wavenet-A if not specified
  const voiceParams = voice.trim() ? { name: voice.trim() } : { languageCode: "en-US", name: "en-US-Wavenet-A" };
  const baseUrl = model.baseUrl || "https://texttospeech.googleapis.com/v1";

  const response = await fetch(`${baseUrl}/text:synthesize?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: voiceParams,
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: rate,
        pitch: 0,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Cloud TTS failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { audioContent?: string };
  if (!payload.audioContent) {
    throw new Error("Google Cloud TTS returned no audio content.");
  }

  const audio = Buffer.from(payload.audioContent, "base64");
  return { audio, mime: "audio/mpeg" };
}

/**
 * Edge TTS (Microsoft) - Free, no API key
 * Uses Microsoft's free speech service (same as Edge browser)
 * Docs: https://github.com/ranaroussi/youtube-harvest
 * Note: This is a reverse-engineered API, use at your own risk
 */
export async function synthesizeEdgeTTS(
  text: string,
  voice: string,
  rate: number,
  _model?: AtlasModelConfig
): Promise<{ audio: Buffer; mime: string }> {
  // Voice format: "en-US-AriaNeural" or similar
  const voiceId = voice.trim() || "en-US-AriaNeural";

  // Edge TTS uses a POST to a specific endpoint with voice ID
  // This is the community-maintained endpoint
  const response = await fetch("https://api.speech.microsoft.com/cognitiveservices/v1", {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      Authorization: "Bearer", // Edge TTS accepts empty bearer
    },
    body: `<speak version="1.0" xml:lang="en-US">
      <voice name="${voiceId}">
        <prosody rate="${Math.max(0.5, Math.min(2, rate))}">${text}</prosody>
      </voice>
    </speak>`,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Edge TTS failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { audio, mime: "audio/mpeg" };
}

/**
 * Mistral Voxtral TTS (OpenAI-compatible)
 * Already implemented in nemo-voice.ts, kept here for completeness
 */
export async function synthesizeMistral(
  text: string,
  model: AtlasModelConfig,
  voice: string,
  rate: number
): Promise<{ audio: Buffer; mime: string }> {
  const apiKey = model.apiKey;
  if (!apiKey) {
    throw new Error("Mistral TTS requires an API key. Add it in Admin → Providers.");
  }

  const baseUrl = model.baseUrl || "https://api.mistral.ai/v1";
  const targetVoice = voice.trim() || "en_paul_neutral";

  const body: Record<string, unknown> = {
    model: model.id,
    input: text,
    voice: targetVoice,
  };

  if (rate && Math.abs(rate - 1) > 0.01) {
    body.speed = Math.max(0.25, Math.min(4, rate));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Mistral TTS failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  // Raw audio bytes (OpenAI-style)
  if (contentType.includes("audio/")) {
    const raw = Buffer.from(await response.arrayBuffer());
    return { audio: raw, mime: contentType.split(";")[0] };
  }

  // Mistral Voxtral returns JSON { audio_data: <base64> }
  const payload = (await response.json().catch(() => null)) as { audio_data?: string; audio_format?: string } | null;
  const audioData = payload?.audio_data;
  if (!audioData) {
    throw new Error("Mistral TTS returned no audio.");
  }

  const mime = payload?.audio_format ? formatMime(payload.audio_format) : "audio/mpeg";
  return { audio: Buffer.from(audioData, "base64"), mime };
}

function formatMime(format: string): string {
  switch (format.toLowerCase()) {
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/pcm";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/ogg";
    default:
      return "audio/mpeg";
  }
}

/**
 * OpenAI TTS API
 * Docs: https://platform.openai.com/docs/guides/text-to-speech
 */
export async function synthesizeOpenAI(
  text: string,
  model: AtlasModelConfig,
  voice: string,
  rate: number
): Promise<{ audio: Buffer; mime: string }> {
  const apiKey = model.apiKey;
  if (!apiKey) {
    throw new Error("OpenAI TTS requires an API key. Add it in Admin → Providers.");
  }

  const baseUrl = model.baseUrl || "https://api.openai.com/v1";
  const targetVoice = voice.trim() || "alloy";
  const modelId = model.id || "tts-1";

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      input: text,
      voice: targetVoice,
      speed: Math.max(0.25, Math.min(4, rate)),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI TTS failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { audio, mime: "audio/mpeg" };
}

/**
 * Generic/custom TTS provider - tries OpenAI-compatible endpoint first
 */
export async function synthesizeCustom(
  text: string,
  model: AtlasModelConfig,
  voice: string,
  rate: number
): Promise<{ audio: Buffer; mime: string }> {
  const apiKey = model.apiKey;
  const baseUrl = model.baseUrl || "";

  if (!baseUrl) {
    throw new Error("Custom TTS requires a baseUrl. Configure it in Admin → Providers.");
  }

  // Try OpenAI-compatible endpoint first
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const body: Record<string, unknown> = {
    input: text,
    voice: voice.trim() || "default",
  };
  if (rate && Math.abs(rate - 1) > 0.01) {
    body.speed = rate;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/speech`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("audio/")) {
      const audio = Buffer.from(await response.arrayBuffer());
      return { audio, mime: contentType.split(";")[0] };
    }
    // Try JSON envelope
    const payload = (await response.json().catch(() => null)) as { audio_data?: string; audio_format?: string } | null;
    if (payload?.audio_data) {
      return { audio: Buffer.from(payload.audio_data, "base64"), mime: payload.audio_format ? formatMime(payload.audio_format) : "audio/mpeg" };
    }
  }

  throw new Error(`Custom TTS at ${baseUrl} failed or returned unsupported format.`);
}

/**
 * Kokoro TTS (self-hosted, OpenAI-compatible).
 * Served by remsky/Kokoro-FastAPI in a Docker container (CPU or GPU); local
 * or deployed on Cloud Run/Render. Endpoint mirrors OpenAI's `/audio/speech`.
 */
export async function synthesizeKokoro(
  text: string,
  model: AtlasModelConfig,
  voice: string,
  rate: number
): Promise<{ audio: Buffer; mime: string }> {
  const baseUrl = model.baseUrl || process.env.KOKORO_TTS_URL || "";
  if (!baseUrl) {
    throw new Error("Kokoro TTS requires a baseUrl. Add it in Admin → Providers or set KOKORO_TTS_URL env var.");
  }

  const targetVoice = voice.trim() || "af_bella";
  const responseFormat = "mp3";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.id === "kokoro-tts" ? "kokoro" : model.id,
        input: text,
        voice: targetVoice,
        response_format: responseFormat,
        speed: Math.max(0.25, Math.min(4, rate)),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Kokoro TTS failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const audio = Buffer.from(await response.arrayBuffer());
  const mime = contentType.includes("audio/") ? contentType.split(";")[0] : `audio/${responseFormat}`;
  return { audio, mime };
}

/**
 * Main synthesis function with provider fallback chain:
 * 1. ElevenLabs (free tier)
 * 2. Google Cloud TTS (free tier)
 * 3. Mistral (current)
 * 4. Edge TTS (free, unlimited, no key)
 */
export async function synthesizeCloudSpeech(
  text: string,
  model: AtlasModelConfig,
  voice: string,
  rate: number
): Promise<{ audio: Buffer; mime: string }> {
  const provider = detectTtsProvider(model);

  // Try the detected provider first
  try {
    switch (provider) {
      case "elevenlabs":
        return await synthesizeElevenLabs(text, model, voice, rate);
      case "google":
        return await synthesizeGoogleTTS(text, model, voice, rate);
      case "edge":
        return await synthesizeEdgeTTS(text, voice, rate);
      case "openai":
        return await synthesizeOpenAI(text, model, voice, rate);
      case "kokoro":
        return await synthesizeKokoro(text, model, voice, rate);
      case "mistral":
      case "custom":
      default:
        return await synthesizeMistral(text, model, voice, rate);
    }
  } catch (error) {
    // Provider-specific error - log and try fallback
    console.error(`[TTS] ${provider} failed:`, error instanceof Error ? error.message : String(error));
  }

  // Fallback chain: try other providers if the first fails
  // Order: ElevenLabs -> Google -> Mistral -> Edge (no key required)
  const fallbacks: Array<() => Promise<{ audio: Buffer; mime: string }>> = [
    () => synthesizeElevenLabs(text, { ...model, id: "elevenlabs-free", provider: "custom", apiKey: process.env.ELEVENLABS_API_KEY || "", label: "ElevenLabs Free", enabled: true }, voice, rate),
    () => synthesizeGoogleTTS(text, { ...model, id: "google-free", provider: "google", apiKey: process.env.GOOGLE_TTS_API_KEY || "", label: "Google Cloud TTS Free", enabled: true }, voice, rate),
    () => synthesizeMistral(text, model, voice, rate),
    () => synthesizeEdgeTTS(text, voice, rate),
  ];

  for (const fallback of fallbacks) {
    try {
      return await fallback();
    } catch (fallbackError) {
      console.error("[TTS] Fallback failed:", fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
    }
  }

  throw new Error("All TTS providers failed. Please configure at least one working TTS model in Admin → Providers.");
}
