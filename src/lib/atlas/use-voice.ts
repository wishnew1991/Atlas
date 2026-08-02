"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VoiceConfig = {
  sttLanguage: string;
  ttsVoiceURI: string;
  ttsRate: number;
  ttsPitch: number;
};

// Voice now flows through the server-side NVIDIA NeMo omni model instead of
// the browser's built-in speech APIs: the browser records audio and POSTs it
// to /api/voice/stt, and plays back audio returned from /api/voice/tts. Secrets
// (the NVIDIA key) stay server-side.

export function useVoice() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<VoiceConfig>({
    sttLanguage: "en-US",
    ttsVoiceURI: "",
    ttsRate: 1,
    ttsPitch: 1,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);
  const audioUnlockedRef = useRef(false);
  const pendingAudioUrlRef = useRef<string | null>(null);
  const playAudioUrlRef = useRef<((url: string) => void) | null>(null);

  useEffect(() => {
    const hasMedia = typeof navigator !== "undefined" && "mediaDevices" in navigator && "MediaRecorder" in window;
    setSupported(hasMedia);

    // A single persistent audio element is reused for every TTS reply. Browsers
    // (especially iOS Safari) only allow play() after the element has been
    // "unlocked" by a play() call inside a user gesture. We create it lazily and
    // unlock it synchronously on the first tap, so later async play() calls work.
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
        // Play a tiny silent WAV inside the gesture to unlock the element.
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

      // If a Piper reply was blocked waiting for activation, play it now.
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
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/voice-config")
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.voice) {
          setConfig(payload.voice);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const startListening = useCallback(
    async (onTranscript: (text: string) => void) => {
      if (!supported || listening) return;
      setError(null);

      let stream: MediaStream | undefined;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        onTranscriptRef.current = onTranscript;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          stream?.getTracks().forEach((track) => track.stop());
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          setListening(false);

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
              setError(message || "Voice transcription failed. Make sure a speech model is configured (Admin → Providers).");
              return;
            }
            const text = (payload as { text?: string }).text;
            const callback = onTranscriptRef.current;
            if (text && callback) {
              callback(text);
            }
          } catch {
            setError("Voice transcription failed. Check that a speech model is configured.");
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setListening(true);
      } catch (err) {
        stream?.getTracks().forEach((track) => track.stop());
        setListening(false);
        const reason =
          err instanceof DOMException
            ? err.name === "NotAllowedError"
              ? "Microphone permission was denied. Allow microphone access and try again."
              : err.name === "NotFoundError"
                ? "No microphone was found on this device."
                : "Could not start the microphone."
            : "Could not start the microphone.";
        setError(reason);
      }
    },
    [supported, listening]
  );

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const speakBrowser = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = config.ttsRate;
    utterance.pitch = config.ttsPitch;
    if (config.ttsVoiceURI && typeof window.speechSynthesis.getVoices === "function") {
      const match = window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === config.ttsVoiceURI);
      if (match) utterance.voice = match;
    }
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [config.ttsRate, config.ttsPitch, config.ttsVoiceURI]);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;

      let response: Response;
      try {
        response = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, rate: config.ttsRate }),
        });
      } catch {
        speakBrowser(text);
        return;
      }

      if (!response.ok) {
        speakBrowser(text);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Autoplay policy: if the page hasn't seen a user gesture yet, play() is
      // rejected. Park the audio and play it on the next gesture instead of
      // falling back to Chrome TTS.
      if (!audioUnlockedRef.current) {
        pendingAudioUrlRef.current = url;
        return;
      }

      playAudioUrlRef.current?.(url);
    },
    [speakBrowser, config.ttsRate]
  );

  const stopSpeaking = useCallback(() => {
    // TTS uses the browser's speech synthesis (not an <audio> element), so we
    // must cancel it there — pausing the audio element does nothing.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    audioElementRef.current?.pause();
    setSpeaking(false);
  }, []);

  return {
    supported,
    listening,
    speaking,
    error,
    clearError: () => setError(null),
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
