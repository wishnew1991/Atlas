import "server-only";

import type { AtlasModelConfig, AtlasProvider } from "@/lib/atlas/server/model-registry";
import { readRegistry, readVoiceConfig } from "@/lib/atlas/server/model-registry";
import { isPiperAvailable } from "@/lib/atlas/server/piper-tts";

export const LOCAL_PIPER_TTS_ID = "local:piper";

export type VoiceModelOption = {
  id: string;
  label: string;
  provider: AtlasProvider | "local";
  kind: "stt" | "tts";
  reason: string;
};

function haystack(model: AtlasModelConfig): string {
  return [model.id, model.label ?? "", model.baseUrl ?? "", model.provider]
    .join(" ")
    .toLowerCase();
}

/**
 * STT-only detection. Chat LLMs must not appear here unless they are clearly
 * speech/omni/transcription capable.
 */
export function isSttCapableModel(model: AtlasModelConfig): boolean {
  if (!model.enabled) return false;

  const text = haystack(model);
  const base = (model.baseUrl ?? "").toLowerCase();

  // Dedicated transcription endpoints / Whisper family.
  if (text.includes("whisper")) return true;
  if (text.includes("transcrib") || text.includes("stt")) return true;
  if (base.includes("/audio/transcription") || base.includes("/audio/translations")) return true;
  if (base.includes("groq.com") && (text.includes("whisper") || text.includes("audio") || text.includes("speech"))) {
    return true;
  }

  // Multimodal omni models that accept audio input (NVIDIA NeMo omni, etc.).
  if (text.includes("omni") && (text.includes("audio") || text.includes("speech") || text.includes("nemo") || model.provider === "nvidia")) {
    return true;
  }
  if (model.provider === "nvidia" && text.includes("omni")) return true;

  // Explicit OpenAI audio transcription model ids.
  if (model.provider === "openai" && (text.includes("whisper") || text.includes("audio"))) return true;

  return false;
}

/**
 * TTS-only detection. Whisper/STT models and generic chat/omni chat models are
 * excluded — only engines that synthesize speech belong here.
 * Local Piper is added separately in listTtsModelOptions().
 */
export function isTtsCapableModel(model: AtlasModelConfig): boolean {
  if (!model.enabled) return false;

  const text = haystack(model);
  const base = (model.baseUrl ?? "").toLowerCase();

  // Never treat STT / Whisper as TTS.
  if (text.includes("whisper") || text.includes("transcrib") || text.includes("stt")) return false;
  if (base.includes("/audio/transcription") || base.includes("/audio/translations")) return false;

  // Explicit TTS product names / endpoints.
  if (/\btts\b/.test(text) || text.includes("text-to-speech") || text.includes("text_to_speech")) return true;
  if (text.includes("speech-synthesis") || text.includes("speech_synthesis")) return true;
  if (base.includes("/audio/speech")) return true;
  if (text.includes("tts-1") || text.includes("gpt-4o-mini-tts") || text.includes("eleven")) return true;
  if (text.includes("piper") || text.includes("styletts") || text.includes("bark") || text.includes("tortoise")) {
    return true;
  }

  // OpenAI-style speech models (not whisper).
  if (model.provider === "openai" && (text.includes("tts") || text.includes("speech"))) return true;

  return false;
}

export async function listSttModelOptions(): Promise<VoiceModelOption[]> {
  const registry = await readRegistry();
  return registry.models.filter(isSttCapableModel).map((model) => ({
    id: model.id,
    label: `${model.label || model.id} · ${model.provider}`,
    provider: model.provider,
    kind: "stt" as const,
    reason: sttReason(model),
  }));
}

export async function listTtsModelOptions(): Promise<VoiceModelOption[]> {
  const registry = await readRegistry();
  const cloud = registry.models.filter(isTtsCapableModel).map((model) => ({
    id: model.id,
    label: `${model.label || model.id} · ${model.provider}`,
    provider: model.provider as AtlasProvider | "local",
    kind: "tts" as const,
    reason: "Detected as TTS / speech-synthesis model",
  }));

  const piperReady = await isPiperAvailable();
  const options: VoiceModelOption[] = [];

  // Piper is a real local TTS engine — only include when installed.
  if (piperReady) {
    options.push({
      id: LOCAL_PIPER_TTS_ID,
      label: "Local Piper TTS",
      provider: "local",
      kind: "tts",
      reason: "Local Piper voice engine",
    });
  }

  return [...options, ...cloud];
}

function sttReason(model: AtlasModelConfig): string {
  const text = haystack(model);
  if (text.includes("whisper")) return "Whisper transcription model";
  if (text.includes("omni")) return "Omni model with audio input";
  if ((model.baseUrl ?? "").toLowerCase().includes("transcription")) return "Transcription API endpoint";
  return "Speech-to-text capable";
}

export async function resolveConfiguredSttModel(): Promise<AtlasModelConfig | null> {
  const [voice, registry] = await Promise.all([readVoiceConfig(), readRegistry()]);
  const capable = registry.models.filter(isSttCapableModel);

  if (voice.sttModelId) {
    const selected = capable.find((entry) => entry.id === voice.sttModelId);
    if (selected) return selected;
  }

  // Prefer Whisper-style, then omni.
  const whisper = capable.find((entry) => haystack(entry).includes("whisper"));
  if (whisper) return whisper;
  return capable[0] ?? null;
}

export type TtsTarget =
  | { kind: "piper"; voice: string; rate: number }
  | { kind: "model"; model: AtlasModelConfig; rate: number };

export async function resolveConfiguredTtsTarget(): Promise<TtsTarget | null> {
  const [voice, registry] = await Promise.all([readVoiceConfig(), readRegistry()]);
  const rate = voice.ttsRate || 1;
  const capableCloud = registry.models.filter(isTtsCapableModel);
  const ttsModelId = voice.ttsModelId || LOCAL_PIPER_TTS_ID;

  if (ttsModelId === LOCAL_PIPER_TTS_ID || ttsModelId.startsWith("piper:")) {
    if (!(await isPiperAvailable())) {
      const fallback = capableCloud[0];
      if (fallback) return { kind: "model", model: fallback, rate };
      return null;
    }
    const piperVoice =
      ttsModelId.startsWith("piper:") && ttsModelId.length > 6
        ? ttsModelId.slice(6)
        : voice.ttsVoiceURI || "en_US-lessac-medium";
    return { kind: "piper", voice: piperVoice, rate };
  }

  const model = capableCloud.find((entry) => entry.id === ttsModelId);
  if (model) return { kind: "model", model, rate };

  if (await isPiperAvailable()) {
    return { kind: "piper", voice: voice.ttsVoiceURI || "en_US-lessac-medium", rate };
  }

  return capableCloud[0] ? { kind: "model", model: capableCloud[0], rate } : null;
}
