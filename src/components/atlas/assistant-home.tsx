"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AtlasPendingAction } from "@/lib/atlas/agent-contract";
import type { BriefCardData } from "./atlas-chat-provider";
import { useVoice } from "@/lib/atlas/use-voice";
import { useVoiceSession } from "@/lib/atlas/use-voice-session";
import { HOME_ACTIONS, useAtlasChat } from "./atlas-chat-provider";
import {
  MicIcon,
  SendIcon,
  SparkIcon,
  StopIcon,
  VolumeIcon,
  VolumeMuteIcon,
} from "./icons";
import { MarkdownText } from "./markdown-text";
import { DailyBriefCard } from "./daily-brief-card";

function labelForKind(kind: string): string {
  switch (kind) {
    case "approval":
      return "Approval";
    case "deadline":
      return "Deadline";
    case "followup":
      return "Follow-up";
    case "info":
      return "Heads-up";
    default:
      return "Task";
  }
}

export function AssistantHome({
  mode = "home",
  userName = "",
}: {
  mode?: "home" | "chat";
  userName?: string;
}) {
  const router = useRouter();
  const chat = useAtlasChat();
  const voice = useVoice();
  const voiceSession = useVoiceSession();
  const threadRef = useRef<HTMLDivElement>(null);
  const spokenIdRef = useRef<string | null>(null);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [pendingUpi, setPendingUpi] = useState<{
    actionId: string;
    upiRedirect?: string;
    upiQr?: string;
  } | null>(null);
  const [confirmingUpi, setConfirmingUpi] = useState(false);
  const [pendingRoutineMessageId, setPendingRoutineMessageId] = useState<string | null>(null);
  const upiHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem("atlas-pending-upi");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          actionId?: string;
          upiRedirect?: string;
          upiQr?: string;
        };
        if (parsed?.actionId) {
          setPendingUpi({
            actionId: parsed.actionId,
            upiRedirect: parsed.upiRedirect,
            upiQr: parsed.upiQr,
          });
        }
      }
    } catch {
      /* ignore */
    } finally {
      upiHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !upiHydratedRef.current) return;
    if (pendingUpi) {
      window.sessionStorage.setItem("atlas-pending-upi", JSON.stringify(pendingUpi));
    } else {
      window.sessionStorage.removeItem("atlas-pending-upi");
    }
  }, [pendingUpi]);

  // Fresh conversations get today's Daily Brief as a summary card — but only
  // once per session and only when there is no unread brief already shown.
  const briefInjectedRef = useRef(false);
  useEffect(() => {
    if (mode !== "chat" || chat.restoring || chat.isSending) return;
    if (briefInjectedRef.current) return;
    if (chat.hasUserMessages) return;
    if (chat.chatMessages.some((m) => m.briefCard)) return;

    briefInjectedRef.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/proactive/briefs?limit=6", { cache: "no-store" });
        const payload = (await response.json()) as {
          briefs?: Array<{
            id: string;
            period: string;
            title: string;
            acknowledgedAt: string | null;
            items: Array<{ text: string; item: { reason: string; kind: string } }>;
          }>;
        };
        const latest = (payload.briefs ?? []).find((b) => !b.acknowledgedAt);
        if (!latest || latest.items.length === 0) return;
        chat.appendBriefCard({
          briefId: latest.id,
          period: latest.period,
          title: latest.title,
          items: latest.items.map((entry) => ({
            text: entry.text,
            reason: entry.item.reason,
            kind: entry.item.kind,
          })),
        } as BriefCardData);
      } catch {
        /* brief card is a nice-to-have; ignore failures */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chat.restoring, chat.isSending]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [chat.chatMessages, chat.isSending, chat.executionSteps, pendingUpi, mode]);

  useEffect(() => {
    // Match modality: typed turns stay text-only; mic turns may speak the reply.
    // A live voice session speaks its own reply tokens, so never double-trigger.
    if (mode !== "chat" || chat.isSending || chat.ttsMuted || !chat.replyWithSpeech) return;
    if (voiceSession.sessionActive) return;

    const last = chat.chatMessages[chat.chatMessages.length - 1];
    if (
      last &&
      last.role === "assistant" &&
      last.id.startsWith("assistant-") &&
      last.id !== "atlas-welcome" &&
      !last.action &&
      last.text.length > 0 &&
      spokenIdRef.current !== last.id
    ) {
      spokenIdRef.current = last.id;
      // Close the mic before TTS so the reply is not re-captured as a new user turn.
      voice.stopListening();
      void voice.speak(last.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.chatMessages, chat.isSending, chat.ttsMuted, chat.replyWithSpeech, mode]);

  useEffect(() => {
    if (mode !== "chat" || chat.ttsMuted || !chat.replyWithSpeech) {
      voice.stopSpeaking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.ttsMuted, chat.replyWithSpeech, mode]);

  const sendAndMaybeRoute = async (message: string, fromVoice = false) => {
    if (!fromVoice) {
      voice.stopSpeaking();
      voice.stopListening();
    }
    // Home is a launcher — jump into Chat so the thread owns the turn.
    if (mode === "home") {
      router.push("/chat");
    }
    await chat.sendMessage(message, { fromVoice });
  };

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendAndMaybeRoute(chat.chatDraft);
  };

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const toggleVoiceSession = () => {
    if (voiceSession.sessionActive) {
      voiceSession.clearSessionError?.();
      voiceSession.stopSession();
      return;
    }
    if (chat.isSending) return;

    voice.stopListening();
    voice.stopSpeaking();
    voiceSession.clearSessionError?.();
    // Route through Chat so home becomes the launcher, exactly like text turns.
    if (mode === "home") {
      router.push("/chat");
    }
    void voiceSession.startSession(async (text, options) => {
      await chat.sendMessage(text, options);
    });
  };

  const stageLabel =
    voiceSession.sessionStage === "speaking"
      ? "Speaking…"
      : voiceSession.sessionStage === "thinking"
        ? "Thinking…"
        : voiceSession.sessionStage === "listening"
          ? "Listening…"
          : "Voice idle";

  const approveAction = async (action: AtlasPendingAction) => {
    if (executingActionId) return;
    setExecutingActionId(action.id);

    try {
      const response = await fetch("/api/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id }),
      });
      const payload: unknown = await response.json();

      if (!response.ok || typeof payload !== "object" || payload === null) {
        const detail =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "The action could not be completed.";
        throw new Error(detail);
      }

      const result = payload as {
        message?: string;
        mode?: "live" | "demo";
        pending?: boolean;
        upiRedirect?: string;
        upiQr?: string;
        routineSuggestion?: { observationId: string; message: string };
      };

      chat.setRuntimeMode(result.mode === "live" ? "live" : "demo");

      if (result.pending && (result.upiRedirect || result.upiQr)) {
        setPendingUpi({
          actionId: action.id,
          upiRedirect: result.upiRedirect,
          upiQr: result.upiQr,
        });
        chat.appendAssistantMessage(
          result.message || "Complete the payment in your UPI app to place the order."
        );
        return;
      }

      chat.appendAssistantMessage(result.message || "Your request has been confirmed.");

      if (result.routineSuggestion) {
        chat.appendRoutineSuggestion(result.routineSuggestion);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      chat.appendAssistantMessage(
        detail && detail !== "The action could not be completed."
          ? `I could not complete that request. ${detail}`
          : "I could not complete that request. No order or booking was placed."
      );
    } finally {
      setExecutingActionId(null);
    }
  };

  const confirmUpi = async (opts?: { silent?: boolean }) => {
    if (!pendingUpi || confirmingUpi) return;
    if (!opts?.silent) setConfirmingUpi(true);
    try {
      const response = await fetch("/api/actions/confirm-upi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: pendingUpi.actionId }),
      });
      const payload: unknown = await response.json();
      const result =
        typeof payload === "object" && payload !== null
          ? (payload as { message?: string; pending?: boolean })
          : {};

      // Still waiting on UPI — keep the card; only announce on manual check.
      if (result.pending) {
        if (!opts?.silent) {
          chat.appendAssistantMessage(
            result.message || "Payment is still processing. Try again in a moment."
          );
        }
        return;
      }

      setPendingUpi(null);
      chat.appendAssistantMessage(result.message || "Your order is confirmed.");
    } catch {
      if (!opts?.silent) {
        chat.appendAssistantMessage(
          "I couldn't confirm the payment yet. It may still be processing — try again in a moment."
        );
      }
    } finally {
      if (!opts?.silent) setConfirmingUpi(false);
    }
  };

  const decideRoutine = async (messageId: string, accept: boolean) => {
    const suggestion = chat.chatMessages.find((m) => m.id === messageId)?.routineSuggestion;
    if (!suggestion || pendingRoutineMessageId) return;
    setPendingRoutineMessageId(messageId);
    try {
      const response = await fetch("/api/routines/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, observationId: suggestion.observationId }),
      });
      const payload: unknown = await response.json();
      const result =
        typeof payload === "object" && payload !== null
          ? (payload as { message?: string })
          : {};
      chat.resolveRoutineSuggestion(messageId);
      chat.appendAssistantMessage(
        result.message || (accept ? "Got it. Next time just say 'order my usual.'" : "No problem.")
      );
    } catch {
      chat.resolveRoutineSuggestion(messageId);
      chat.appendAssistantMessage("I couldn't update that — we can sort it out the next time you order.");
    } finally {
      setPendingRoutineMessageId(null);
    }
  };

  const acknowledgeBriefCard = async (messageId: string, briefId: string) => {
    try {
      const response = await fetch(`/api/proactive/briefs/${briefId}/ack`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("ack failed");
      chat.resolveBriefCard(messageId);
      chat.appendAssistantMessage("Got it — that brief is marked as done.");
    } catch {
      chat.appendAssistantMessage("I couldn't mark that brief as read — try again.");
    }
  };

  // Poll Swiggy while the UPI card is open so cancel/fail/success updates the UI.
  useEffect(() => {
    if (mode !== "chat" || !pendingUpi) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || confirmingUpi) return;
      try {
        const response = await fetch("/api/actions/confirm-upi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionId: pendingUpi.actionId }),
        });
        const payload: unknown = await response.json();
        if (cancelled) return;
        if (typeof payload !== "object" || payload === null) return;
        const result = payload as { message?: string; pending?: boolean };
        if (result.pending) return;
        setPendingUpi(null);
        chat.appendAssistantMessage(result.message || "Payment status updated.");
      } catch {
        /* keep polling */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpi?.actionId, mode]);

  const composer = (
    <form className="atlas-mobile-composer" onSubmit={submitChat}>
      <textarea
        id="atlas-chat-input"
        value={chat.chatDraft}
        onChange={(event) => chat.setChatDraft(event.target.value)}
        onKeyDown={handleChatKeyDown}
        placeholder={
          mode === "home"
            ? "Ask Atlas to get something done"
            : "Message Atlas"
        }
        rows={1}
        disabled={chat.isSending}
        aria-label="Ask Atlas"
      />
      <div className="atlas-mobile-composer__actions">
        {voiceSession.sessionActive ? (
          <button
            type="button"
            onClick={toggleVoiceSession}
            aria-label="End live voice conversation"
            aria-pressed={true}
            className="atlas-live-voice atlas-live-voice--active"
            title={stageLabel}
          >
            <StopIcon width={16} height={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleVoiceSession}
            aria-label="Start a live voice conversation (hands-free)"
            aria-pressed={false}
            className="atlas-live-voice"
            disabled={chat.isSending || !voiceSession.sttCapable}
            title={
              !voiceSession.voiceEnabled
                ? "Voice replies are off — enable them in Profile → Voice."
                : voiceSession.sttCapable
                  ? ""
                  : "Voice is not supported on this device/browser yet (no speech recognition)."
            }
          >
            <MicIcon width={16} height={16} />
          </button>
        )}
        {chat.isSending ? (
          <button
            type="button"
            onClick={chat.stopGeneration}
            aria-label="Stop generating"
            className="atlas-send atlas-send--stop"
          >
            <StopIcon width={16} height={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!chat.chatDraft.trim()}
            aria-label="Send message"
            className="atlas-send"
          >
            <SendIcon width={18} height={18} />
          </button>
        )}
      </div>
    </form>
  );

  if (mode === "home") {
    return (
      <div className="atlas-chat-app atlas-chat-app--home">
        <div className="atlas-chat-app__identity">
          <div>
            <div className="atlas-chat-app__logo" aria-hidden="true">
              <SparkIcon width={26} height={26} />
            </div>
            <div className="atlas-chat-app__name">Atlas</div>
            <div className="atlas-chat-app__status">
              <span className="atlas-chat-app__status-dot" />
              {chat.runtimeMode === "live" ? "Connected" : "Ready"}
              {!voice.supported ? (
                <span className="atlas-micro"> — voice unavailable</span>
              ) : null}
            </div>
            {userName.trim() ? (
              <p className="atlas-chat-app__greeting" data-address-by-name>
                Hi {userName.trim()}
              </p>
            ) : null}
            <p className="atlas-chat-app__tagline">
              Ask Atlas to search, compare, and prepare real-world actions — it always asks before
              spending.
            </p>
          </div>
        </div>

        {chat.hasUserMessages ? (
          <div className="atlas-chat-continue">
            <div>
              <strong>Conversation in progress</strong>
              <p>Pick up where you left off in Chat.</p>
            </div>
            <div className="atlas-chat-continue__actions">
              <Link href="/chat" className="atlas-action atlas-action--primary">
                Continue
              </Link>
              <button
                type="button"
                className="atlas-action atlas-action--ghost"
                disabled={chat.isSending}
                onClick={() => chat.startNewChat()}
              >
                New chat
              </button>
            </div>
          </div>
        ) : null}

        <div className="atlas-chat-app__home-body">
          <DailyBriefCard />
          <p className="atlas-chat-app__home-eyebrow">What do you want to do?</p>
          <div className="atlas-home-actions" aria-label="Quick actions">
            {HOME_ACTIONS.map((action) => (
              <button
                type="button"
                key={action.id}
                className="atlas-home-actions__item"
                onClick={() => void sendAndMaybeRoute(action.message)}
              >
                <span className="atlas-home-actions__label">{action.label}</span>
                <span className="atlas-home-actions__arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="atlas-chat-app__notice">
          Atlas asks before spending, booking, or sending requests to connected services.
          {voice.supported ? " Open Chat to type or use the mic." : ""}
        </p>

        {voice.error ? (
          <p className="atlas-chat-app__voice-error" role="alert">
            {voice.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="atlas-chat-app atlas-chat-app--chat">
      <div className="atlas-chat-toolbar">
        <div className="atlas-chat-toolbar__status">
          <span className="atlas-chat-app__status-dot" />
          {chat.restoring
            ? "Restoring…"
            : chat.runtimeMode === "live"
              ? "Connected"
              : "Ready"}
        </div>
        <div className="atlas-chat-toolbar__actions">
          <button
            type="button"
            className="atlas-chat-toolbar__btn"
            onClick={chat.toggleTtsMute}
            aria-pressed={chat.ttsMuted}
            aria-label={chat.ttsMuted ? "Unmute spoken replies" : "Mute spoken replies"}
            title={
              chat.ttsMuted
                ? "Unmute spoken replies (mic turns only)"
                : "Mute spoken replies (mic turns only)"
            }
          >
            {chat.ttsMuted ? (
              <VolumeMuteIcon width={16} height={16} />
            ) : (
              <VolumeIcon width={16} height={16} />
            )}
          </button>
          <button
            type="button"
            className="atlas-chat-toolbar__btn"
            onClick={chat.startNewChat}
            disabled={chat.isSending}
          >
            New chat
          </button>
        </div>
      </div>

      <div className="atlas-chat-app__thread" ref={threadRef} aria-live="polite">
        {chat.chatMessages.map((message) => (
          <div
            key={message.id}
            className={`atlas-mobile-message atlas-mobile-message--${message.role}`}
          >
            {message.role === "assistant" ? (
              <div className="atlas-mobile-message__avatar" aria-hidden="true">
                <SparkIcon width={15} height={15} />
              </div>
            ) : null}
            <div className="atlas-mobile-message__content">
              {message.text ? (
                <div className="atlas-mobile-message__text">
                  <MarkdownText text={message.text} />
                </div>
              ) : null}
              {message.routineSuggestion ? (
                <div className="atlas-routine-card">
                  <div className="atlas-routine-card__actions">
                    <button
                      type="button"
                      className="atlas-routine-card__yes"
                      disabled={pendingRoutineMessageId === message.id}
                      onClick={() => void decideRoutine(message.id, true)}
                    >
                      {pendingRoutineMessageId === message.id ? "Saving…" : "Yes, remember it"}
                    </button>
                    <button
                      type="button"
                      className="atlas-routine-card__no"
                      disabled={Boolean(pendingRoutineMessageId)}
                      onClick={() => void decideRoutine(message.id, false)}
                    >
                      No thanks
                    </button>
                  </div>
                </div>
              ) : null}
              {message.action ? (
                <div className="atlas-approval-card">
                  <div className="atlas-approval-card__eyebrow">
                    Needs your approval · {message.action.domain}
                  </div>
                  <div className="atlas-approval-card__title">{message.action.title}</div>
                  <div className="atlas-approval-card__summary">{message.action.summary}</div>
                  <div className="atlas-approval-card__fields">
                    {message.action.fields.map((field) => (
                      <div className="atlas-approval-card__field" key={field.label}>
                        <span>{field.label}</span>
                        <strong>{field.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="atlas-approval-card__actions">
                    <button
                      type="button"
                      className="atlas-approval-card__confirm"
                      disabled={executingActionId === message.action.id}
                      onClick={() => void approveAction(message.action!)}
                    >
                      {executingActionId === message.action.id
                        ? "Confirming…"
                        : message.action.approvalLabel}
                    </button>
                    <button
                      type="button"
                      className="atlas-approval-card__cancel"
                      disabled={Boolean(executingActionId)}
                      onClick={() => chat.setChatDraft("I want to change this request.")}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : null}
              {message.connectionRequest ? (
                <div className="atlas-connection-card">
                  <div className="atlas-connection-card__eyebrow">
                    Personal service connection required · {message.connectionRequest.capability}
                  </div>
                  <div className="atlas-connection-card__header">
                    <span className="atlas-connection-card__icon" aria-hidden="true">
                      {message.connectionRequest.icon || "🔌"}
                    </span>
                    <div className="atlas-connection-card__info">
                      <div className="atlas-connection-card__title">
                        Connect {message.connectionRequest.integrationName}
                      </div>
                      <div className="atlas-connection-card__desc">
                        {message.connectionRequest.description ||
                          `Connect your personal ${message.connectionRequest.integrationName} account to let Atlas execute this for you.`}
                      </div>
                    </div>
                  </div>
                  <div className="atlas-connection-card__actions">
                    <Link
                      href="/profile"
                      className="atlas-connection-card__connect-btn"
                    >
                      Connect {message.connectionRequest.integrationName} →
                    </Link>
                  </div>
                </div>
              ) : null}
              {message.briefCard ? (
                <div className="atlas-brief-chat-card">
                  <div className="atlas-brief-chat-card__eyebrow">
                    Daily Brief · {message.briefCard.period}
                  </div>
                  <div className="atlas-brief-chat-card__title">{message.briefCard.title}</div>
                  <ul className="atlas-brief-chat-card__items">
                    {message.briefCard.items.map((entry, index) => (
                      <li className="atlas-brief-chat-card__item" key={`${entry.text}-${index}`}>
                        <span className="atlas-brief-card__badge">
                          {labelForKind(entry.kind)}
                        </span>
                        <div className="atlas-brief-card__copy">
                          <span className="atlas-brief-chat-card__item-title">{entry.text}</span>
                          <span className="atlas-brief-card__item-reason">{entry.reason}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="atlas-brief-chat-card__actions">
                    <button
                      type="button"
                      className="atlas-action atlas-action--primary"
                      onClick={() => void acknowledgeBriefCard(message.id, message.briefCard!.briefId)}
                    >
                      Got it
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {chat.isSending && !chat.streamingAssistantText ? (
          <div className="atlas-mobile-message atlas-mobile-message--assistant atlas-mobile-message--thinking">
            <div className="atlas-mobile-message__avatar" aria-hidden="true">
              <SparkIcon width={15} height={15} />
            </div>
            <div className="atlas-mobile-message__content">
              <div
                className="atlas-execution-timeline"
                aria-live="polite"
                aria-label="Atlas execution progress"
              >
                {chat.executionSteps.length === 0 ? (
                  <div className="atlas-execution-timeline__step atlas-execution-timeline__step--active">
                    <span className="atlas-execution-timeline__dot" />
                    <span className="atlas-execution-timeline__label">Starting…</span>
                  </div>
                ) : (
                  chat.executionSteps.map((step) => (
                    <div
                      key={step.id}
                      className={
                        step.status === "started"
                          ? "atlas-execution-timeline__step atlas-execution-timeline__step--active"
                          : step.status === "failed"
                            ? "atlas-execution-timeline__step atlas-execution-timeline__step--failed"
                            : "atlas-execution-timeline__step atlas-execution-timeline__step--done"
                      }
                    >
                      <span className="atlas-execution-timeline__dot" />
                      <span className="atlas-execution-timeline__label">
                        {step.label}
                        {typeof step.durationMs === "number" && step.status !== "started"
                          ? ` · ${step.durationMs}ms`
                          : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {pendingUpi ? (
        <div className="atlas-upi-card">
          <div className="atlas-upi-card__eyebrow">Payment required</div>
          <div className="atlas-upi-card__title">Complete UPI payment</div>
          <p className="atlas-upi-card__hint">
            Swiggy does not send a collect request into Google Pay. You must open the payment link on
            your phone (or scan the QR). Desktop browsers usually cannot open GPay directly.
          </p>
          <ol className="atlas-upi-card__steps">
            <li>On your phone, tap Open Google Pay / UPI below</li>
            <li>Confirm the exact amount in the app</li>
            <li>Return here and tap I’ve paid</li>
          </ol>
          {pendingUpi.upiRedirect ? (
            <a
              className="atlas-upi-card__pay"
              href={pendingUpi.upiRedirect}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Google Pay / UPI to pay
            </a>
          ) : null}
          {pendingUpi.upiQr ? (
            <div className="atlas-upi-card__qr">
              <div className="atlas-upi-card__qr-label">Or scan this UPI QR with any UPI app</div>
              <pre className="atlas-upi-card__qr-data">{pendingUpi.upiQr}</pre>
            </div>
          ) : null}
          {pendingUpi.upiRedirect ? (
            <button
              type="button"
              className="atlas-upi-card__confirm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(pendingUpi.upiRedirect as string);
                } catch {
                  /* ignore */
                }
              }}
            >
              Copy payment link
            </button>
          ) : null}
          <button
            type="button"
            className="atlas-upi-card__confirm"
            disabled={confirmingUpi}
            onClick={() => void confirmUpi()}
          >
            {confirmingUpi ? "Checking…" : "Check payment status"}
          </button>
          <p className="atlas-upi-card__hint">Status refreshes automatically every few seconds.</p>
        </div>
      ) : null}

      {voiceSession.sessionActive ? (
        <div className="atlas-live-session-bar" role="status">
          <span className="atlas-live-session-bar__dot" />
          <span className="atlas-live-session-bar__label">{stageLabel}</span>
          {voiceSession.liveCaption ? (
            <span className="atlas-live-session-bar__caption">
              {voiceSession.liveCaption}
            </span>
          ) : null}
        </div>
      ) : null}

      {composer}

      {voiceSession.sessionActive ? (
        <p className="atlas-chat-app__notice">
          Hands-free mode — keep talking. Atlas listens continuously and you can interrupt
          replies. Speak clearly or tap stop to end the conversation.
        </p>
      ) : voice.speaking && !chat.ttsMuted ? (
        <button
          type="button"
          className="atlas-chat-app__notice atlas-inline-action"
          onClick={voice.stopSpeaking}
        >
          Stop voice reply
        </button>
      ) : (
        <p className="atlas-chat-app__notice">
          Atlas asks before spending, booking, or sending requests to connected services.
        </p>
      )}

      {voice.error ? (
        <p className="atlas-chat-app__voice-error" role="alert">
          {voice.error}
        </p>
      ) : null}

      {voiceSession.sessionError ? (
        <p className="atlas-chat-app__voice-error" role="alert">
          {voiceSession.sessionError}
        </p>
      ) : null}
    </div>
  );
}
