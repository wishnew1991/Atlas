"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  parseVoiceSttMode,
  parseVoiceTtsMode,
  ttsEngineOrder,
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

export type VoiceSessionStage = "idle" | "listening" | "thinking" | "speaking";

type SessionConfig = {
  sttLanguage: string;
  ttsRate: number;
  ttsPitch: number;
  sttMode: VoiceSttMode;
  ttsMode: VoiceTtsMode;
  voiceEnabled: boolean;
  tier: "free" | "premium" | "vip";
};

type SessionBudget = {
  capped: boolean;
  allowed: boolean;
  remainingSeconds: number | null;
  limitMinutes: number;
};

type SessionStatus = {
  sttReady: boolean;
  ttsReady: boolean;
};

type SendOptions = {
  fromVoice?: boolean;
  onToken?: (token: string) => void;
};

type SendFn = (text: string, options?: SendOptions) => Promise<void>;

const UTTERANCE_MAX_MS = 20_000;
const SILENCE_END_MS = 500;
const BARGE_IN_MS = 180;
const VAD_LEVEL = 0.008;
/** How long speech must stay above the (echo-adaptive) floor before a fresh
 *  recording is armed — a single residual frames can't start one. */
const SPEECH_CONFIRM_MS = 160;

/** Echo-adaptive barge-in tuning (pattern from vellum-assistant #38348):
 *  while the assistant's own audio is playing, the VAD threshold is raised to
 *  `max(VAD_LEVEL, ECHO_MARGIN × EMA-of-mic-energy)` so leaked echo stays below
 *  it and never self-triggers, while real user speech (which stacks on echo)
 *  still trips barge-in. */
const ECHO_MARGIN = 2.2;
const ECHO_EMA_ALPHA = 0.04;
/** Absolute RMS margin above the echo average the mic must clear while echo is
 *  present (≈ −34 dBFS). A ratio alone is fooled by the reply's own loud
 *  syllables on laggy/loud playback. */
const ECHO_PEAK_DELTA = 0.02;
/** Protect the first N ms of a reply from false barge-in. Must exceed the
 *  EMA convergence time (~320ms at alpha=0.04, 60fps) so the assistant's own
 *  onset frames don't cross the still-low threshold. */
const ECHO_ONSET_GUARD_MS = 350;
/** Keep the raised floor after playback ends until the room/AEC echo tail has
 *  died out (~1.2s), not just for the final 300ms — otherwise the last words of
 *  the reply are re-captured, re-transcribed, and fed back as a new turn. */
const ECHO_DRAIN_SLACK_MS = 1000;

/** Final-result coalescing: Chrome fires a final per pause; wait for the user
 *  to finish before committing the whole utterance. */
const FINAL_COALESCE_MS = 650;

function rmsOf(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

/**
 * Hands-free live conversation ("voice call") mode.
 *
 * Listens continuously, detects turn boundaries (native Web Speech finals, or
 * an energy-based VAD + server STT on browsers without Web Speech), streams the
 * reply back sentence-by-sentence, and lets the user barge in mid-reply. All
 * speech rides the existing free STT/TTS stack and the voice budget.
 */
export function useVoiceSession() {
  const [active, setActive] = useState(false);
  const [stage, setStage] = useState<VoiceSessionStage>("idle");
  const [liveCaption, setLiveCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Forces a re-render once /api/voice-config resolves: configRef/statusRef
  // are refs, so without this the derived sttCapable/tier/voiceEnabled would
  // stay frozen at their first-render defaults (tier "free", sttReady false)
  // and the mic would remain disabled even for VIP users.
  const [configLoaded, setConfigLoaded] = useState(false);

  const configRef = useRef<SessionConfig>({
    sttLanguage: "en-US",
    ttsRate: 1,
    ttsPitch: 1,
    sttMode: "native_first",
    ttsMode: "server_first",
    voiceEnabled: true,
    tier: "free",
  });
  const statusRef = useRef<SessionStatus>({ sttReady: false, ttsReady: false });
  const budgetRef = useRef<SessionBudget>({
    capped: false,
    allowed: true,
    remainingSeconds: null,
    limitMinutes: 0,
  });

  const isActiveRef = useRef(false);
  const stageRef = useRef<VoiceSessionStage>("idle");
  const sendRef = useRef<SendFn | null>(null);
  const nativeUsedRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetch("/api/voice-config")
      .then((response) => response.json())
      .then((payload) => {
        if (!active || typeof payload !== "object" || payload === null) return;
        const data = payload as {
          tier?: { id?: string };
          voice?: {
            sttLanguage?: string;
            ttsRate?: number;
            ttsPitch?: number;
            sttMode?: unknown;
            ttsMode?: unknown;
            voiceEnabled?: boolean;
          };
          status?: { sttReady?: boolean; ttsReady?: boolean };
          budget?: {
            capped?: boolean;
            allowed?: boolean;
            remainingSeconds?: number | null;
            limitMinutes?: number;
          };
        };
        if (data.voice) {
          const tier = data.tier?.id === "premium" || data.tier?.id === "vip" ? data.tier.id : "free";
          configRef.current = {
            sttLanguage: data.voice.sttLanguage ?? "en-US",
            ttsRate: data.voice.ttsRate ?? 1,
            ttsPitch: data.voice.ttsPitch ?? 1,
            sttMode: parseVoiceSttMode(data.voice.sttMode),
            ttsMode: parseVoiceTtsMode(data.voice.ttsMode),
            voiceEnabled: data.voice.voiceEnabled !== false,
            tier,
          };
        }
        if (data.status) {
          statusRef.current = {
            sttReady: data.status.sttReady === true,
            ttsReady: data.status.ttsReady === true,
          };
        }
        if (data.budget) {
          budgetRef.current = {
            capped: data.budget.capped === true,
            allowed: data.budget.allowed !== false,
            remainingSeconds:
              typeof data.budget.remainingSeconds === "number"
                ? data.budget.remainingSeconds
                : null,
            limitMinutes: data.budget.limitMinutes ?? 0,
          };
        }
        setConfigLoaded(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<NativeSpeechRecognition | null>(null);

  const vadRef = useRef({
    talking: false,
    inUtterance: false,
    speechOnset: 0,
    silenceOnset: 0,
    candidateOnset: 0,
    utteranceStartedAt: 0,
    hasCaptured: false,
  });

  const speechQueueRef = useRef<string[]>([]);
  const workingRef = useRef(false);
  const interruptRef = useRef(false);
  const pendingUtterancesRef = useRef<string[]>([]);
  const sendingRef = useRef(false);
  const tokenBufRef = useRef("");
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const synthActiveRef = useRef(false);
  const pendingPlayResolveRef = useRef<(() => void) | null>(null);

  /** Echo-adaptive VAD state for self-aware barge-in (see constants above). */
  const echoRef = useRef({
    ema: 0,
    lastLevel: 0,
    onsetAt: 0, // last time the assistant started a playback chunk
    drainUntil: 0, // last chunk ended + ECHO_DRAIN_SLACK_MS
  });

  const finalBufRef = useRef("");
  const finalTimerRef = useRef<number | null>(null);
  const finalStartRef = useRef(0);

  const setStageRef = useCallback((next: VoiceSessionStage) => {
    stageRef.current = next;
    setStage(next);
  }, []);

  const clearSpeechQueue = useCallback(() => {
    speechQueueRef.current = [];
    tokenBufRef.current = "";
  }, []);

  /** Cut any in-flight or queued speech immediately. */
  const interruptSpeech = useCallback(() => {
    interruptRef.current = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    synthActiveRef.current = false;
    audioElRef.current?.pause();
    audioElRef.current = null;
    const resolve = pendingPlayResolveRef.current;
    pendingPlayResolveRef.current = null;
    resolve?.();
    clearSpeechQueue();
    if (stageRef.current === "speaking") {
      setStageRef("listening");
    }
  }, [clearSpeechQueue, setStageRef]);

const markSpeaking = useCallback(() => {
    synthActiveRef.current = true;
    echoRef.current.onsetAt = Date.now();
    // Seed the echo EMA with the last observed level so the reply's very first
    // frames already sit under the raised floor (they have no history yet).
    echoRef.current.ema = Math.max(
      echoRef.current.ema,
      echoRef.current.lastLevel
    );
  }, []);

  const settleMic = useCallback(() => {
    synthActiveRef.current = false;
    echoRef.current.drainUntil = Date.now() + ECHO_DRAIN_SLACK_MS;
  }, []);

  /** Effective RMS threshold for the current VAD frame. While the assistant is
   *  speaking (or its echo is still draining), the floor is lifted to a margin
   *  above the observed echo energy so its own voice cannot re-trigger speech,
   *  but any real voice stacked on top of the echo still crosses the line. */
  const echoThreshold = useCallback((level: number): number => {
    const echo = echoRef.current;
    const inEchoWindow =
      synthActiveRef.current || Date.now() < echo.drainUntil;

    // Always track EMA — even after the drain window — so a lingering echo
    // tail keeps a raised floor until it fully decays. This prevents the
    // assistant's own residual audio from re-triggering after the drain.
    echo.ema = echo.ema + ECHO_EMA_ALPHA * (level - echo.ema);
    echo.lastLevel = level;

    // Ratio floor: decays with the EMA, so once the echo tail fades the floor
    // drops back to VAD_LEVEL and normal user speech is heard again.
    const floor = Math.max(VAD_LEVEL, ECHO_MARGIN * echo.ema);

    // Absolute delta only while audio is actually *playing*: on loud/laggy
    // playback the reply's own peaks can beat a pure ratio of its own average
    // (that would let it falsely barge in on itself). During the drain window
    // (echo draining, not playing) the extra floor must NOT stay pinned — the
    // user is likely to start talking right as the reply ends.
    if (synthActiveRef.current) {
      return Math.max(floor, echo.ema + ECHO_PEAK_DELTA);
    }
    return floor;
  }, []);

  const speakServer = useCallback(
    (text: string): Promise<void> =>
      new Promise((resolve, reject) => {
        fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, rate: configRef.current.ttsRate }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Server TTS failed.");
            }
            return response.blob();
          })
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio();
            audioElRef.current = audio;
            pendingPlayResolveRef.current = resolve;
            // Set echo window ONCE audio is ready to play (not before the fetch).
            // This ensures the onset guard (260ms) protects the actual audio start.
            markSpeaking();
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              URL.revokeObjectURL(url);
              settleMic();
              if (pendingPlayResolveRef.current === resolve) {
                pendingPlayResolveRef.current = null;
              }
              resolve();
            };
            audio.onended = done;
            audio.onerror = done;
            audio.src = url;
            const playPromise = audio.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch(done);
            }
          })
          .catch(() => {
            settleMic();
            if (pendingPlayResolveRef.current === resolve) {
              pendingPlayResolveRef.current = null;
            }
            reject(new Error("Server TTS failed."));
          });
      }),
    [markSpeaking, settleMic]
  );

  const speakNative = useCallback(
    (text: string): Promise<void> =>
      new Promise((resolve, reject) => {
        if (!isNativeTtsAvailable()) {
          reject(new Error("Device text-to-speech is not available."));
          return;
        }
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
          reject(new Error("No device voices loaded yet."));
          return;
        }
        window.speechSynthesis.cancel();
        pendingPlayResolveRef.current = resolve;
        markSpeaking();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          settleMic();
          if (pendingPlayResolveRef.current === resolve) {
            pendingPlayResolveRef.current = null;
          }
          resolve();
        };
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = configRef.current.ttsRate;
        utterance.pitch = configRef.current.ttsPitch;
        utterance.onend = done;
        utterance.onerror = () => {
          if (settled) return;
          settled = true;
          settleMic();
          if (pendingPlayResolveRef.current === resolve) {
            pendingPlayResolveRef.current = null;
          }
          reject(new Error("Device TTS failed."));
        };
        // Prefer a natural-sounding English voice; fallback to default.
        const preferred = voices.find(
          (v) => v.lang.toLowerCase().startsWith("en") && /(google|samantha|siri|daniel|zira|david|mark|james|emma|amy)/i.test(v.name)
        ) || voices.find((v) => v.lang.toLowerCase().startsWith("en"));
        if (preferred) utterance.voice = preferred;
        window.speechSynthesis.speak(utterance);
      }),
    [markSpeaking, settleMic]
  );

  const playTts = useCallback(
    async (text: string): Promise<void> => {
      if (interruptRef.current) return;
      const order = ttsEngineOrder(configRef.current.ttsMode);
      const errors: string[] = [];
      for (const engine of order) {
        if (interruptRef.current) return;
        if (engine === "native") {
          if (!isNativeTtsAvailable()) {
            errors.push("Device TTS unavailable");
            continue;
          }
          synthActiveRef.current = false;
          try {
            await speakNative(text);
            return;
          } catch (err) {
            errors.push(err instanceof Error ? err.message : "Native TTS failed.");
            continue;
          }
        }
        if (engine === "server") {
          if (!statusRef.current.ttsReady) {
            errors.push("Server TTS not ready");
            continue;
          }
          try {
            await speakServer(text);
            return;
          } catch (err) {
            errors.push(err instanceof Error ? err.message : "Server TTS failed.");
            continue;
          }
        }
      }
      if (errors.length > 0) {
        setError(errors[errors.length - 1]);
      }
    },
    [speakNative, speakServer, setError]
  );

  const drainSpeechQueue = useCallback(async () => {
    if (workingRef.current || !isActiveRef.current) return;
    workingRef.current = true;
    try {
      while (isActiveRef.current && speechQueueRef.current.length > 0) {
        if (interruptRef.current) return;
        const sentence = speechQueueRef.current.shift();
        if (!sentence) continue;
        setStageRef("speaking");
        await playTts(sentence);
      }
    } finally {
      workingRef.current = false;
      if (isActiveRef.current && !interruptRef.current) {
        if (speechQueueRef.current.length > 0) {
          void drainSpeechQueue();
          return;
        }
        const remaining = tokenBufRef.current.trim();
        if (remaining) {
          tokenBufRef.current = "";
          speechQueueRef.current.push(remaining);
          void drainSpeechQueue();
          return;
        }
        setStageRef("listening");
      }
    }
  }, [playTts, setStageRef]);

  /** Accumulate streamed reply tokens and speak them in sentence chunks. */
  const feedTokens = useCallback(
    (token: string) => {
      if (!isActiveRef.current || interruptRef.current) return;
      tokenBufRef.current += token;
      const buf = tokenBufRef.current;

      // Gemini-style: speak as soon as we hit a natural pause. Prefer sentence
      // endings, then clause breaks (comma/semicolon/colon), then a short
      // buffer so replies start quickly.
      const sentenceBoundary = /[.!?。！？\n]/.exec(buf);
      const clauseBoundary = /[,;:]/.exec(buf);
      if (sentenceBoundary && sentenceBoundary.index >= 8) {
        const sentence = buf.slice(0, sentenceBoundary.index + 1).trim();
        if (sentence) {
          speechQueueRef.current.push(sentence);
        }
        tokenBufRef.current = buf.slice(sentenceBoundary.index + 1).trim();
      } else if (clauseBoundary && clauseBoundary.index >= 45) {
        const clause = buf.slice(0, clauseBoundary.index + 1).trim();
        if (clause) {
          speechQueueRef.current.push(clause);
        }
        tokenBufRef.current = buf.slice(clauseBoundary.index + 1).trim();
      } else if (buf.length >= 80) {
        const trimmed = buf.trim();
        if (trimmed) {
          speechQueueRef.current.push(trimmed);
        }
        tokenBufRef.current = "";
      }
      void drainSpeechQueue();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drainSpeechQueue]
  );

  const flushPending = useCallback(() => {
    const remaining = tokenBufRef.current.trim();
    tokenBufRef.current = "";
    if (remaining) {
      speechQueueRef.current.push(remaining);
      void drainSpeechQueue();
    }
  }, [drainSpeechQueue]);

  const processUtterance = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      if (sendingRef.current) {
        pendingUtterancesRef.current.push(clean);
        return;
      }
      sendingRef.current = true;
      interruptRef.current = false;
      setLiveCaption("");
      setStageRef("thinking");
      try {
        await sendRef.current?.(clean, {
          fromVoice: true,
          onToken: (token) => feedTokens(token),
        });
      } catch {
        /* chat layer surfaces its own error message */
      } finally {
        sendingRef.current = false;
        flushPending();
        const next = pendingUtterancesRef.current.shift();
        if (next && isActiveRef.current) {
          void processUtterance(next);
        } else if (isActiveRef.current && stageRef.current === "thinking") {
          setStageRef("listening");
        }
      }
    },
    [feedTokens, flushPending, setStageRef]
  );

  const stopSession = useCallback(() => {
    isActiveRef.current = false;
    setActive(false);
    setStageRef("idle");
    setLiveCaption("");

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    pendingUtterancesRef.current = [];
    if (finalTimerRef.current !== null) {
      window.clearTimeout(finalTimerRef.current);
      finalTimerRef.current = null;
    }
    finalBufRef.current = "";
    finalStartRef.current = 0;
    interruptRef.current = false;
    interruptSpeech();
  }, [interruptSpeech, setStageRef]);

  const transcribeAndSend = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "inactive") return;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length === 0) return;

    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");
    try {
      const response = await fetch("/api/voice/stt", { method: "POST", body: formData });
      const payload: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 429) {
          setError((payload as { error?: string })?.error || "You have reached today’s voice limit.");
          stopSession();
        }
        return;
      }
      const text = (payload as { text?: string }).text;
      if (text) {
        await processUtterance(text);
      }
    } catch {
      setError("Voice transcription failed.");
    }
  }, [processUtterance, stopSession]);

  const beginUtterance = useCallback(() => {
    const vad = vadRef.current;
    if (vad.inUtterance) return;
    vad.inUtterance = true;
    vad.utteranceStartedAt = Date.now();
    vad.hasCaptured = false;
    if (stageRef.current === "speaking") {
      interruptSpeech();
    }
    if (streamRef.current && "MediaRecorder" in window) {
      try {
        const recorder = new MediaRecorder(streamRef.current);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
            vad.hasCaptured = true;
          }
        };
        recorderRef.current = recorder;
        recorder.start();
      } catch {
        /* best-effort */
      }
    }
  }, [interruptSpeech]);

  const runVad = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !isActiveRef.current) return;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const level = rmsOf(buf);
    const vad = vadRef.current;
    const now = Date.now();

    // Native recognition already segments utterances; only the server path
    // (no Web Speech) uses VAD to record + transcribe audio chunks.
    const serverCapture = !nativeUsedRef.current;

    // Echo-adaptive floor: while the assistant is speaking (or its echo is
    // still draining), raise the threshold above observed echo so its own
    // voice can't re-arm an utterance; genuine barge-in still crosses.
    const isSpeech = level > echoThreshold(level);

    if (isSpeech) {
      if (!vad.talking) {
        vad.talking = true;
        vad.speechOnset = now;
      }
      // Confirm the speech is sustained before arming a recording — a single
      // residual echo frame at the drain-window edge must not start one.
      // Also: while the assistant is speaking (or its echo is draining), reset
      // the candidate so the reply's own tail cannot accumulate 200ms of
      // sustained speech and re-arm a recording.
      const inEchoWindow =
        synthActiveRef.current || Date.now() < echoRef.current.drainUntil;
      if (stageRef.current === "speaking" || inEchoWindow) {
        vad.candidateOnset = now; // keep resetting so it never reaches SPEECH_CONFIRM_MS
      } else if (vad.candidateOnset === 0) {
        vad.candidateOnset = now;
      }
      // Never start a *new* recording while the assistant is speaking — its
      // own reply onset can cross a near-zero threshold. Barge-in below is the
      // only path into an utterance during "speaking", and it carries the
      // echo onset guard.
      if (
        serverCapture &&
        !vad.inUtterance &&
        stageRef.current !== "speaking" &&
        !inEchoWindow &&
        now - vad.candidateOnset >= SPEECH_CONFIRM_MS
      ) {
        beginUtterance();
      }
    } else {
      if (vad.talking) {
        vad.talking = false;
        vad.silenceOnset = now;
      }
      vad.candidateOnset = 0;
    }

    if (vad.inUtterance) {
      const silent = !vad.talking && now - vad.silenceOnset >= SILENCE_END_MS;
      const tooLong = now - vad.utteranceStartedAt >= UTTERANCE_MAX_MS;
      if ((silent && vad.hasCaptured) || tooLong) {
        vad.inUtterance = false;
        vad.hasCaptured = false;
        void transcribeAndSend();
       }
    }

    // Barge-in: user starts talking over the reply. The echo-adaptive
    // threshold above already keeps the assistant's own output from reaching
    // `isSpeech`, so a real interruption still lands here. Skip the brief
    // onset guard so the very first frames of a reply can't cancel it as echo.
    //
    // IMPORTANT: We only interrupt here; we do NOT start a new recording.
    // The next VAD frame (with stage now "listening") will naturally pick up
    // the ongoing user speech via the top block, preventing the assistant's own
    // voice from being re-recorded after a false barge-in.
    if (stageRef.current === "speaking" && !vad.inUtterance && isSpeech) {
      if (now - echoRef.current.onsetAt >= ECHO_ONSET_GUARD_MS) {
        if (now - vad.speechOnset >= BARGE_IN_MS) {
          interruptSpeech();
          // Do NOT call beginUtterance() here — let the continuous VAD
          // pick up the user's speech in the next frame once stage is "listening".
        }
      }
    }

    rafIdRef.current = requestAnimationFrame(runVad);
  }, [beginUtterance, echoThreshold, interruptSpeech, transcribeAndSend]);

  const wireNativeRecognition = useCallback(() => {
    const recognition = createNativeRecognition(configRef.current.sttLanguage);
    if (!recognition) return;
    nativeUsedRef.current = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const interimText = extractTranscript(event);
      if (interimText) {
        // While the assistant is speaking, Web Speech may briefly catch its
        // own audio at the start of a chunk despite browser AEC; require a
        // little sustained speech (past the echo onset guard) before treating
        // it as a barge-in so replies aren't cut on their first frames.
        const pastOnset = Date.now() - echoRef.current.onsetAt >= ECHO_ONSET_GUARD_MS;
        if (stageRef.current === "speaking" && pastOnset) {
          interruptSpeech();
        }
        setLiveCaption(interimText);
      }

      const finalText = extractTranscript(event);
      if (!finalText) return;

      // Accumulate final segments of the same utterance (Chrome fires one
      // final per pause), then commit after the user stops talking.
      if (finalTimerRef.current !== null) {
        window.clearTimeout(finalTimerRef.current);
        finalTimerRef.current = null;
      }
      finalBufRef.current = finalBufRef.current
        ? `${finalBufRef.current.trim()} ${finalText.trim()}`
        : finalText.trim();
      finalStartRef.current = Date.now();
      setLiveCaption(finalBufRef.current);
      finalTimerRef.current = window.setTimeout(() => {
        finalTimerRef.current = null;
        const text = finalBufRef.current.trim();
        finalBufRef.current = "";
        finalStartRef.current = 0;
        if (text) {
          setLiveCaption("");
          void processUtterance(text);
        }
      }, FINAL_COALESCE_MS);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone permission was denied.");
        stopSession();
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError(`Device recognition failed (${event.error}).`);
      }
    };

    recognition.onend = () => {
      // Flush any accumulated finals if recognition ended before the timer.
      if (finalTimerRef.current !== null) {
        window.clearTimeout(finalTimerRef.current);
        finalTimerRef.current = null;
        const text = finalBufRef.current.trim();
        finalBufRef.current = "";
        finalStartRef.current = 0;
        if (text) {
          setLiveCaption("");
          void processUtterance(text);
        }
      }
      if (isActiveRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          /* ignore */
        }
      }
    };

    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  }, [processUtterance, interruptSpeech, stopSession]);

  const armMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
    }

    const mode = configRef.current.sttMode;
    const nativeAvailable = isNativeSttAvailable();
    // Respect explicit mode flags. Gemini-style UX prefers native Web Speech when
    // available because it is local and lowest-latency; server is a fallback.
    const useNative =
      mode === "native_only" ||
      (mode !== "server_only" && nativeAvailable) ||
      (mode === "server_only" && !statusRef.current.sttReady && nativeAvailable);

    if (useNative) {
      wireNativeRecognition();
    }
    if (analyserRef.current) {
      rafIdRef.current = requestAnimationFrame(runVad);
    }
  }, [runVad, wireNativeRecognition]);

  const startSession = useCallback(
    async (send: SendFn) => {
      if (isActiveRef.current) return;
      setError(null);

      if (!configRef.current.voiceEnabled) {
        setError(
          "Live voice replies are off. Open Profile → Voice and turn on “Live voice replies” to talk to Atlas."
        );
        return;
      }

      if (configRef.current.tier === "free") {
        setError(
          "Voice is a Standard and VIP feature. Upgrade your plan under Profile → Plans to talk to Atlas."
        );
        return;
      }

      if (!budgetRef.current.allowed) {
        setError(
          `You have reached today’s voice limit (${budgetRef.current.limitMinutes} minutes). Try again tomorrow.`
        );
        return;
      }

      if (!statusRef.current.sttReady && !isNativeSttAvailable()) {
        setError("No speech recognition is available. Add an STT model under Admin → Voice.");
        return;
      }

      sendRef.current = send;
      isActiveRef.current = true;
      setActive(true);
      setStageRef("listening");
      setLiveCaption("");

      try {
        await armMic();
      } catch {
        isActiveRef.current = false;
        setActive(false);
        setStageRef("idle");
        setError("Could not start the microphone. Allow mic access and try again.");
      }
    },
    [armMic, setStageRef]
  );

  useEffect(() => {
    if (!active) return;
    return () => {
      stopSession();
    };
  }, [active, stopSession]);

  return {
    sessionActive: active,
    sessionStage: stage,
    liveCaption,
    sessionError: error,
    clearSessionError: () => setError(null),
    startSession,
    stopSession,
    sttEngine: nativeUsedRef.current ? ("native" as const) : ("server" as const),
    // True when any STT path works: native Web Speech (desktop Chrome/Safari,
    // Android Chrome) or a server Whisper/omni model. iOS Safari has neither
    // Web Speech ASR nor (without a model) server STT, so the mic is gated off.
    // Also gate on the per-user Profile → Voice preference.
    // Native Web Speech works without waiting for server config; otherwise we
    // need the config load to confirm a server STT model and tier/voice flags.
    sttCapable:
      isNativeSttAvailable() ||
      (configLoaded &&
        configRef.current.voiceEnabled &&
        configRef.current.tier !== "free" &&
        statusRef.current.sttReady),
    voiceEnabled: configRef.current.voiceEnabled,
    tier: configRef.current.tier,
    configLoaded,
  };
}