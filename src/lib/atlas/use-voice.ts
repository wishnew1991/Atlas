"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  parseVoiceSttMode,
  parseVoiceTtsMode,
  sttEngineOrder,
  ttsEngineOrder,
  type VoiceEngine,
  type VoiceSttMode,
  type VoiceTtsMode,
} from "@/lib/atlas/voice-modes";
import {
  createNativeRecognition,
  extractTranscript,
  isNativeSttAvailable,
  isNativeTtsAvailable,
  type NativeSpeechRecognition,
} from "@/lib/atlas/voice-native";

type VoiceConfig = {
  sttLanguage: string;
  ttsRate: number;
  ttsPitch: number;
  sttModelId: string;
  ttsModelId: string;
  sttMode: VoiceSttMode;
  ttsMode: VoiceTtsMode;
};

type VoiceStatus = {
  sttReady: boolean;
  ttsReady: boolean;
  sttModelLabel: string | null;
};

/**
 * Voice adapter: Web Speech (device) + server STT/TTS.
 * Modes are Admin-configurable; same hook surface for a future Capacitor shell.
 */
export function useVoice() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [listeningEngine, setListeningEngine] = useState<VoiceEngine | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<VoiceConfig>({
    sttLanguage: "en-US",
    ttsRate: 1,
    ttsPitch: 1,
    sttModelId: "",
    ttsModelId: "local:piper",
    sttMode: "native_first",
    ttsMode: "server_first",
  });
  const [status, setStatus] = useState<VoiceStatus>({
    sttReady: false,
    ttsReady: false,
    sttModelLabel: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<NativeSpeechRecognition | null>(null);
  const sttEngineRef = useRef<VoiceEngine | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);
  const audioUnlockedRef = useRef(false);
  const pendingAudioUrlRef = useRef<string | null>(null);
  const playAudioUrlRef = useRef<((url: string) => void) | null>(null);
  const intentionalStopRef = useRef(false);
  const configRef = useRef(config);
  const statusRef = useRef(status);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const hasMedia =
      typeof navigator !== "undefined" && "mediaDevices" in navigator && "MediaRecorder" in window;
    const hasNative = isNativeSttAvailable() || isNativeTtsAvailable();
    setSupported(hasMedia || hasNative);

    const getAudio = (): HTMLAudioElement => {
      if (!audioElementRef.current) {
        const audio = new Audio();
        audio.preload = "auto";
        audioElementRef.current = audio;
      }
      return audioElementRef.current;
    };

    const unlock = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;

      try {
        const audio = getAudio();
        audio.src =
          "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
        const unlockPlay = audio.play();
        if (unlockPlay && typeof unlockPlay.catch === "function") {
          unlockPlay.catch(() => {});
        }
      } catch {
        /* audio unlock is best-effort */
      }

      if (pendingAudioUrlRef.current) {
        const url = pendingAudioUrlRef.current;
        pendingAudioUrlRef.current = null;
        playAudioUrl(url);
      }
    };

    const playAudioUrl = (url: string) => {
      const audio = getAudio();
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
      };
      audio.src = url;
      setSpeaking(true);
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
        });
      }
    };

    playAudioUrlRef.current = playAudioUrl;

    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("touchstart", unlock, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/voice-config")
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (payload?.voice) {
          setConfig({
            sttLanguage: payload.voice.sttLanguage ?? "en-US",
            ttsRate: payload.voice.ttsRate ?? 1,
            ttsPitch: payload.voice.ttsPitch ?? 1,
            sttModelId: payload.voice.sttModelId ?? "",
            ttsModelId: payload.voice.ttsModelId ?? "local:piper",
            sttMode: parseVoiceSttMode(payload.voice.sttMode),
            ttsMode: parseVoiceTtsMode(payload.voice.ttsMode),
          });
        }
        if (payload?.status) {
          setStatus({
            sttReady: payload.status.sttReady === true,
            ttsReady: payload.status.ttsReady === true,
            sttModelLabel: payload.status.sttModelLabel ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const startServerListening = useCallback(async (onTranscript: (text: string) => void) => {
    if (!statusRef.current.sttReady) {
      throw new Error(
        "No STT model is ready. Open Admin → Voice and select a speech-to-text model (Whisper or NVIDIA omni)."
      );
    }

    if (typeof navigator === "undefined" || !("mediaDevices" in navigator) || !("MediaRecorder" in window)) {
      throw new Error("This browser cannot record microphone audio for server STT.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    onTranscriptRef.current = onTranscript;
    sttEngineRef.current = "server";
    setListeningEngine("server");

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      setListening(false);
      setListeningEngine(null);
      sttEngineRef.current = null;

      if (blob.size === 0) {
        setError("No audio was captured. Check your microphone and try again.");
        return;
      }

      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      try {
        const response = await fetch("/api/voice/stt", { method: "POST", body: formData });
        const payload: unknown = await response.json();
        if (!response.ok || typeof payload !== "object" || payload === null) {
          const message = (payload as { error?: string })?.error;
          setError(
            message ||
              "Voice transcription failed. Configure STT under Admin → Voice and check Providers."
          );
          return;
        }
        const text = (payload as { text?: string }).text;
        const callback = onTranscriptRef.current;
        if (text && callback) {
          callback(text);
        }
      } catch {
        setError("Voice transcription failed. Check Admin → Voice STT model.");
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setListening(true);
  }, []);

  const startNativeListening = useCallback((onTranscript: (text: string) => void) => {
    const recognition = createNativeRecognition(configRef.current.sttLanguage);
    if (!recognition) {
      throw new Error("Device speech recognition is not available in this browser.");
    }

    intentionalStopRef.current = false;
    onTranscriptRef.current = onTranscript;
    recognitionRef.current = recognition;
    sttEngineRef.current = "native";
    setListeningEngine("native");

    recognition.onresult = (event) => {
      const text = extractTranscript(event);
      if (text) {
        onTranscriptRef.current?.(text);
      }
    };

    recognition.onerror = (event) => {
      // "aborted" / "no-speech" are common; only surface hard failures.
      if (event.error === "not-allowed") {
        setError("Microphone permission was denied. Allow microphone access and try again.");
      } else if (event.error === "audio-capture") {
        setError("No microphone was found on this device.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Device speech recognition failed (${event.error}).`);
      }
    };

    recognition.onend = () => {
      // Some browsers end after a pause; keep listening until the user stops.
      if (!intentionalStopRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
          return;
        } catch {
          /* fall through to idle */
        }
      }
      setListening(false);
      setListeningEngine(null);
      sttEngineRef.current = null;
      recognitionRef.current = null;
    };

    recognition.start();
    setListening(true);
  }, []);

  const startListening = useCallback(
    async (onTranscript: (text: string) => void) => {
      if (listening) return;
      setError(null);

      const order = sttEngineOrder(configRef.current.sttMode);
      const errors: string[] = [];

      for (const engine of order) {
        try {
          if (engine === "native") {
            if (!isNativeSttAvailable()) {
              errors.push("Device STT unavailable");
              continue;
            }
            startNativeListening(onTranscript);
            return;
          }

          await startServerListening(onTranscript);
          return;
        } catch (err) {
          const message =
            err instanceof DOMException
              ? err.name === "NotAllowedError"
                ? "Microphone permission was denied. Allow microphone access and try again."
                : err.name === "NotFoundError"
                  ? "No microphone was found on this device."
                  : "Could not start the microphone."
              : err instanceof Error
                ? err.message
                : "Could not start speech input.";
          errors.push(message);
        }
      }

      setError(errors[errors.length - 1] || "Speech input is not available.");
    },
    [listening, startNativeListening, startServerListening]
  );

  const stopListening = useCallback(() => {
    intentionalStopRef.current = true;
    const engine = sttEngineRef.current;

    if (engine === "native" || recognitionRef.current) {
      try {
        recognitionRef.current?.stop();
      } catch {
        try {
          recognitionRef.current?.abort();
        } catch {
          /* ignore */
        }
      }
      recognitionRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    if (engine === "native") {
      setListening(false);
      setListeningEngine(null);
      sttEngineRef.current = null;
    }
  }, []);

  const speakNative = useCallback((text: string) => {
    if (!isNativeTtsAvailable()) {
      throw new Error("Device text-to-speech is not available in this browser.");
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = configRef.current.ttsRate;
    utterance.pitch = configRef.current.ttsPitch;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const speakServer = useCallback(async (text: string) => {
    const response = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, rate: configRef.current.ttsRate }),
    });

    if (!response.ok) {
      throw new Error("Server TTS failed.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    if (!audioUnlockedRef.current) {
      pendingAudioUrlRef.current = url;
      return;
    }

    playAudioUrlRef.current?.(url);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      setError(null);

      const order = ttsEngineOrder(configRef.current.ttsMode);
      const errors: string[] = [];

      for (const engine of order) {
        try {
          if (engine === "native") {
            speakNative(text);
            return;
          }
          await speakServer(text);
          return;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "TTS failed");
        }
      }

      setError(errors[errors.length - 1] || "Speech output is not available.");
    },
    [speakNative, speakServer]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (pendingAudioUrlRef.current) {
      URL.revokeObjectURL(pendingAudioUrlRef.current);
      pendingAudioUrlRef.current = null;
    }
    audioElementRef.current?.pause();
    setSpeaking(false);
  }, []);

  return {
    supported,
    listening,
    listeningEngine,
    speaking,
    error,
    clearError: () => setError(null),
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
