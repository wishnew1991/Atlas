/**
 * Browser “native” voice adapters (Web Speech API).
 * Same surface will later wrap Capacitor / OS speech plugins.
 */

export type NativeSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => NativeSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isNativeSttAvailable(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isNativeTtsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function createNativeRecognition(lang: string): NativeSpeechRecognition | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang || "en-US";
  return recognition;
}

export function extractTranscript(event: SpeechRecognitionResultEventLike): string {
  let finalText = "";
  let interimText = "";
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const piece = result?.[0]?.transcript ?? "";
    if (result?.isFinal) finalText += piece;
    else interimText += piece;
  }
  return (finalText || interimText).trim();
}

/**
 * Finals-only extraction. Returns "" when the result contains only interim
 * (in-progress) transcript, so callers never commit a half-spoken utterance.
 */
export function extractFinalTranscript(event: SpeechRecognitionResultEventLike): string {
  let finalText = "";
  let sawFinal = false;
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const piece = result?.[0]?.transcript ?? "";
    if (result?.isFinal) {
      finalText += piece;
      sawFinal = true;
    }
  }
  return sawFinal ? finalText.trim() : "";
}
