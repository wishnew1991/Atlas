/** Shared voice routing modes (web today; Capacitor native adapters later). */

export const VOICE_STT_MODES = ["native_first", "server_first", "native_only", "server_only"] as const;
export const VOICE_TTS_MODES = ["server_first", "native_first", "native_only", "server_only"] as const;

export type VoiceSttMode = (typeof VOICE_STT_MODES)[number];
export type VoiceTtsMode = (typeof VOICE_TTS_MODES)[number];

export type VoiceEngine = "native" | "server";

export function parseVoiceSttMode(value: unknown): VoiceSttMode {
  return typeof value === "string" && (VOICE_STT_MODES as readonly string[]).includes(value)
    ? (value as VoiceSttMode)
    : "native_first";
}

export function parseVoiceTtsMode(value: unknown): VoiceTtsMode {
  return typeof value === "string" && (VOICE_TTS_MODES as readonly string[]).includes(value)
    ? (value as VoiceTtsMode)
    : "server_first";
}

/** Ordered STT engines for a mode (first = preferred). */
export function sttEngineOrder(mode: VoiceSttMode): VoiceEngine[] {
  switch (mode) {
    case "native_only":
      return ["native"];
    case "server_only":
      return ["server"];
    case "server_first":
      return ["server", "native"];
    case "native_first":
    default:
      return ["native", "server"];
  }
}

/** Ordered TTS engines for a mode (first = preferred). */
export function ttsEngineOrder(mode: VoiceTtsMode): VoiceEngine[] {
  switch (mode) {
    case "native_only":
      return ["native"];
    case "server_only":
      return ["server"];
    case "native_first":
      return ["native", "server"];
    case "server_first":
    default:
      return ["server", "native"];
  }
}

export const STT_MODE_LABELS: Record<VoiceSttMode, string> = {
  native_first: "Device first → server fallback",
  server_first: "Server first → device fallback",
  native_only: "Device only",
  server_only: "Server only",
};

export const TTS_MODE_LABELS: Record<VoiceTtsMode, string> = {
  server_first: "Server first → device fallback",
  native_first: "Device first → server fallback",
  native_only: "Device only",
  server_only: "Server only",
};

/** Coarse mobile detection so device voices become the default on phones/tablets. */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /(android|iphone|ipad|ipod|mobile|opera mini|iemobile)/i.test(navigator.userAgent);
}
