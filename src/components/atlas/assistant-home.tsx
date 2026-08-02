"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type {
  AtlasChatHistoryItem,
  AtlasChatResponse,
  AtlasPendingAction,
} from "@/lib/atlas/agent-contract";
import { useVoice } from "@/lib/atlas/use-voice";
import { MicIcon, SendIcon, SparkIcon } from "./icons";
import { MarkdownText } from "./markdown-text";

type ChatMessage = AtlasChatHistoryItem & {
  id: string;
  action?: AtlasPendingAction;
};

const starterMessage =
  "What can I help you get done? I can search, compare, and prepare orders or bookings for your approval.";

const starterPrompts = [
  "Find a hotel in New York for next Friday.",
  "Order chicken biryani for dinner.",
  "Buy a gaming laptop under $1800.",
];

export function AssistantHome({ mode = "home" }: { mode?: "home" | "chat" }) {
  const [chatDraft, setChatDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<"live" | "demo">("demo");
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [pendingUpi, setPendingUpi] = useState<{ actionId: string; upiRedirect?: string; upiQr?: string } | null>(null);
  const [confirmingUpi, setConfirmingUpi] = useState(false);
  const voiceInputRef = useRef(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: "atlas-welcome",
      role: "assistant",
      text: starterMessage,
    },
  ]);

  const threadRef = useRef<HTMLDivElement>(null);
  const voice = useVoice();

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [chatMessages, isSending]);

  useEffect(() => {
    if (isSending) return;
    const last = chatMessages[chatMessages.length - 1];
    // Speak assistant replies via Piper TTS. The initial welcome message is
    // skipped so the app doesn't talk over the user on page load.
    if (
      last &&
      last.role === "assistant" &&
      last.id.startsWith("assistant-") &&
      last.id !== "atlas-welcome" &&
      !last.action &&
      last.text.length > 0
    ) {
      voice.speak(last.text);
    }
    voiceInputRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, isSending]);

  const sendMessage = async (message: string, fromVoice = false) => {
    voiceInputRef.current = fromVoice;
    const trimmed = message.trim();

    if (!trimmed || isSending) {
      return;
    }

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", text: trimmed };
    const history = chatMessages.slice(-12).map(({ role, text }) => ({ role, text }));
    const assistantId = `assistant-${Date.now()}`;
    setChatMessages((current) => [...current, userMessage]);
    setChatDraft("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history, stream: true }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Atlas could not answer right now.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let mode: "live" | "demo" = "demo";
      let action: AtlasPendingAction | undefined;

      setChatMessages((current) => [...current, { id: assistantId, role: "assistant", text: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const block of lines) {
          const trimmedLine = block.trim();
          if (!trimmedLine.startsWith("data:")) continue;
          const data = trimmedLine.slice(5).trim();
          if (!data) continue;

          let event: { type: string; text?: string; action?: AtlasPendingAction; error?: string };
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          if (event.type === "token" && event.text) {
            setChatMessages((current) =>
              current.map((msg) => (msg.id === assistantId ? { ...msg, text: msg.text + event.text } : msg))
            );
          } else if (event.type === "done") {
            mode = "live";
            action = event.action ?? undefined;
          } else if (event.type === "error") {
            setChatMessages((current) =>
              current.map((msg) => (msg.id === assistantId ? { ...msg, text: event.error || "Something went wrong." } : msg))
            );
          }
        }
      }

      setRuntimeMode(mode);
      setChatMessages((current) =>
        current.map((msg) => (msg.id === assistantId ? { ...msg, action, text: msg.text || "I'm ready to help." } : msg))
      );
    } catch {
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: "I could not reach the assistant service. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(chatDraft);
  };

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const fillPrompt = (prompt: string) => {
    setChatDraft(prompt);
  };

  const toggleVoice = () => {
    if (voice.listening) {
      voice.stopListening();
      return;
    }

    voice.clearError?.();
    voice.startListening((text) => {
      setChatDraft(text);
      const clean = text.trim();
      if (clean.endsWith(".") || clean.endsWith("?") || clean.length > 40) {
        void sendMessage(clean, true);
      }
    });
  };

  const approveAction = async (action: AtlasPendingAction) => {
    if (executingActionId) {
      return;
    }

    setExecutingActionId(action.id);

    try {
      const response = await fetch("/api/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id }),
      });
      const payload: unknown = await response.json();

      if (!response.ok || typeof payload !== "object" || payload === null) {
        throw new Error("The action could not be completed.");
      }

      const result = payload as {
        message?: string;
        mode?: "live" | "demo";
        pending?: boolean;
        upiRedirect?: string;
        upiQr?: string;
      };
      setRuntimeMode(result.mode === "live" ? "live" : "demo");

      // UPI handoff: keep the order pending and show the payment surface instead
      // of announcing completion. The user pays in their UPI app, then taps
      // "I've paid" which finalizes the order server-side.
      if (result.pending && (result.upiRedirect || result.upiQr)) {
        setPendingUpi({
          actionId: action.id,
          upiRedirect: result.upiRedirect,
          upiQr: result.upiQr,
        });
        setChatMessages((current) => [
          ...current,
          {
            id: `assistant-upi-${Date.now()}`,
            role: "assistant",
            text: result.message || "Complete the payment in your UPI app to place the order.",
          },
        ]);
        return;
      }

      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-confirmed-${Date.now()}`,
          role: "assistant",
          text: result.message || "Your request has been confirmed.",
        },
      ]);
    } catch {
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-action-error-${Date.now()}`,
          role: "assistant",
          text: "I could not complete that request. No order or booking was placed.",
        },
      ]);
    } finally {
      setExecutingActionId(null);
    }
  };

  const confirmUpi = async () => {
    if (!pendingUpi || confirmingUpi) return;
    setConfirmingUpi(true);
    try {
      const response = await fetch("/api/actions/confirm-upi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: pendingUpi.actionId }),
      });
      const payload: unknown = await response.json();
      const result = typeof payload === "object" && payload !== null ? (payload as { message?: string; pending?: boolean }) : {};
      setPendingUpi(null);
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-upi-done-${Date.now()}`,
          role: "assistant",
          text: result.message || "Your order is confirmed.",
        },
      ]);
    } catch {
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-upi-err-${Date.now()}`,
          role: "assistant",
          text: "I couldn't confirm the payment yet. It may still be processing — try again in a moment.",
        },
      ]);
    } finally {
      setConfirmingUpi(false);
    }
  };

  const showPrompts = chatMessages.length === 1 && mode === "home";
  const showHero = mode === "home";

  return (
    <div className="atlas-chat-app">
      {showHero ? (
        <div className="atlas-chat-app__identity">
          <div>
            <div className="atlas-chat-app__logo" aria-hidden="true">
              <SparkIcon width={26} height={26} />
            </div>
            <div className="atlas-chat-app__name">Atlas</div>
            <div className="atlas-chat-app__status">
              <span className="atlas-chat-app__status-dot" />
              {runtimeMode === "live" ? "Connected" : "Ready"}
              {!voice.supported ? (
                <span className="atlas-micro"> - voice unavailable in this browser</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="atlas-chat-app__thread" ref={threadRef} aria-live="polite">
        {chatMessages.map((message) => (
          <div key={message.id} className={`atlas-mobile-message atlas-mobile-message--${message.role}`}>
            {message.role === "assistant" ? (
              <div className="atlas-mobile-message__avatar" aria-hidden="true">
                <SparkIcon width={15} height={15} />
              </div>
            ) : null}
            <div className="atlas-mobile-message__content">
              <div className="atlas-mobile-message__text">
               <MarkdownText text={message.text} />
             </div>
              {message.action ? (
                <div className="atlas-approval-card">
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
                      onClick={() => approveAction(message.action!)}
                    >
                      {executingActionId === message.action.id ? "Confirming..." : message.action.approvalLabel}
                    </button>
                    <button
                      type="button"
                      className="atlas-approval-card__cancel"
                      disabled={Boolean(executingActionId)}
                      onClick={() => setChatDraft("I want to change this request.")}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {isSending ? (
          <div className="atlas-mobile-message atlas-mobile-message--assistant atlas-mobile-message--thinking">
            <div className="atlas-mobile-message__avatar" aria-hidden="true">
              <SparkIcon width={15} height={15} />
            </div>
            <div className="atlas-mobile-message__content">
              <div className="atlas-mobile-message--thinking-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {pendingUpi ? (
        <div className="atlas-upi-card">
          <div className="atlas-upi-card__title">Complete UPI payment</div>
          {pendingUpi.upiRedirect ? (
            <button
              type="button"
              className="atlas-upi-card__pay"
              onClick={() => {
                // Open the native UPI app (e.g. gpay://upi/, phonepe://) on the
                // device. window.location.href lets the OS hand off to the app
                // and keeps Atlas running in the background.
                window.location.href = pendingUpi.upiRedirect as string;
              }}
            >
              Open UPI app to pay
            </button>
          ) : null}
          {pendingUpi.upiQr ? (
            <div className="atlas-upi-card__qr">
              <div className="atlas-upi-card__qr-label">Scan this QR with any UPI app</div>
              <pre className="atlas-upi-card__qr-data">{pendingUpi.upiQr}</pre>
            </div>
          ) : null}
          <button
            type="button"
            className="atlas-upi-card__confirm"
            disabled={confirmingUpi}
            onClick={confirmUpi}
          >
            {confirmingUpi ? "Confirming..." : "I've paid"}
          </button>
        </div>
      ) : null}

      {showPrompts ? (
        <div className="atlas-chat-app__prompts" aria-label="Suggested prompts">
          {starterPrompts.map((prompt) => (
            <button type="button" key={prompt} onClick={() => fillPrompt(prompt)}>
              <span>{prompt}</span>
              <span className="atlas-chat-app__prompt-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <form className="atlas-mobile-composer" onSubmit={submitChat}>
        <textarea
          id="atlas-chat-input"
          value={chatDraft}
          onChange={(event) => setChatDraft(event.target.value)}
          onKeyDown={handleChatKeyDown}
          placeholder={voice.listening ? "Listening..." : "Ask Atlas"}
          rows={1}
          disabled={isSending || voice.listening}
          aria-label="Ask Atlas"
        />
        <div className="atlas-mobile-composer__actions">
          {voice.supported ? (
            <button
              type="button"
              onClick={toggleVoice}
              aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
              aria-pressed={voice.listening}
              className={voice.listening ? "atlas-mic atlas-mic--active" : "atlas-mic"}
            >
              <MicIcon width={18} height={18} />
            </button>
          ) : null}
          <button type="submit" disabled={!chatDraft.trim() || isSending} aria-label="Send message" className="atlas-send">
            <SendIcon width={18} height={18} />
          </button>
        </div>
      </form>

      {voice.speaking ? (
        <button type="button" className="atlas-chat-app__notice atlas-inline-action" onClick={voice.stopSpeaking}>
          Stop voice reply
        </button>
      ) : (
        <p className="atlas-chat-app__notice">
          Atlas asks before spending, booking, or sending requests to connected services.
          {voice.supported ? " Use the Voice button to talk instead of typing." : ""}
        </p>
      )}

      {voice.error ? (
        <p className="atlas-chat-app__voice-error" role="alert">
          {voice.error}
        </p>
      ) : null}
    </div>
  );
}
