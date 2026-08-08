"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  AtlasChatHistoryItem,
  AtlasPendingAction,
  AtlasConnectionRequest,
} from "@/lib/atlas/agent-contract";

export type ChatMessage = AtlasChatHistoryItem & {
  id: string;
  action?: AtlasPendingAction;
  connectionRequest?: AtlasConnectionRequest;
  /** A naturally-discovered routine Atlas is proposing the user confirm. */
  routineSuggestion?: {
    observationId: string;
    message: string;
  };
};

export type TimelineStep = {
  id: string;
  stage: string;
  label: string;
  status: "started" | "completed" | "failed";
  detail?: string;
  durationMs?: number;
};

const CONVERSATION_KEY = "atlas-conversation-id";
const TTS_MUTE_KEY = "atlas-tts-muted";

export const STARTER_MESSAGE =
  "What can I help you get done? I can search, compare, and prepare orders or bookings for your approval.";

/** Home launcher options — tap sends the message and opens Chat. */
export const HOME_ACTIONS = [
  { id: "biryani", label: "Order biryani", message: "Order chicken biryani for dinner." },
  { id: "flight", label: "Book a flight", message: "Book a flight for me." },
  { id: "hotel", label: "Find a hotel", message: "Find a hotel in New York for next Friday." },
  { id: "laptop", label: "Buy a laptop", message: "Buy a gaming laptop under $1800." },
] as const;

/** @deprecated Prefer HOME_ACTIONS — kept for any leftover prompt UI. */
export const STARTER_PROMPTS = HOME_ACTIONS.map((action) => action.message);
function welcomeMessage(): ChatMessage {
  return { id: "atlas-welcome", role: "assistant", text: STARTER_MESSAGE };
}

type AtlasChatContextValue = {
  chatDraft: string;
  setChatDraft: (value: string) => void;
  chatMessages: ChatMessage[];
  isSending: boolean;
  runtimeMode: "live" | "demo";
  setRuntimeMode: (mode: "live" | "demo") => void;
  executionSteps: TimelineStep[];
  conversationId: string | null;
  restoring: boolean;
  hasUserMessages: boolean;
  streamingAssistantText: boolean;
  ttsMuted: boolean;
  toggleTtsMute: () => void;
  /** True when the latest user turn came from the mic — reply may be spoken. */
  replyWithSpeech: boolean;
  sendMessage: (message: string, options?: { fromVoice?: boolean }) => Promise<void>;
  stopGeneration: () => void;
  startNewChat: () => void;
  appendAssistantMessage: (text: string, action?: AtlasPendingAction) => void;
  appendRoutineSuggestion: (suggestion: {
    observationId: string;
    message: string;
  }) => void;
  resolveRoutineSuggestion: (messageId: string) => void;
  restoreReady: boolean;
};

const AtlasChatContext = createContext<AtlasChatContextValue | null>(null);

export function AtlasChatProvider({ children }: { children: ReactNode }) {
  const [chatDraft, setChatDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<"live" | "demo">("demo");
  const [executionSteps, setExecutionSteps] = useState<TimelineStep[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [ttsMuted, setTtsMuted] = useState(false);
  const [replyWithSpeech, setReplyWithSpeech] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [welcomeMessage()]);

  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const chatMessagesRef = useRef(chatMessages);
  const isSendingRef = useRef(false);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
    if (typeof window === "undefined") return;
    if (conversationId) {
      window.localStorage.setItem(CONVERSATION_KEY, conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTtsMuted(window.localStorage.getItem(TTS_MUTE_KEY) === "1");
  }, []);

  useEffect(() => {
    let active = true;

    const restore = async () => {
      try {
        const storedId =
          typeof window !== "undefined" ? window.localStorage.getItem(CONVERSATION_KEY) : null;

        let payload: {
          conversation?: {
            id: string;
            messages: AtlasChatHistoryItem[];
          } | null;
        } | null = null;

        if (storedId) {
          const response = await fetch(`/api/conversations/${storedId}`);
          if (response.ok) {
            payload = await response.json();
          } else if (response.status === 404) {
            window.localStorage.removeItem(CONVERSATION_KEY);
          }
        }

        if (!payload?.conversation) {
          const response = await fetch("/api/conversations?latest=1");
          if (response.ok) {
            payload = await response.json();
          }
        }

        if (!active) return;

        // Don't clobber a thread the user already started while restore was in flight.
        if (isSendingRef.current || chatMessagesRef.current.some((m) => m.role === "user")) {
          return;
        }

        const conversation = payload?.conversation;
        if (conversation?.id && Array.isArray(conversation.messages) && conversation.messages.length > 0) {
          setConversationId(conversation.id);
          setChatMessages(
            conversation.messages.map((item, index) => ({
              id: `${item.role}-${conversation.id}-${index}`,
              role: item.role,
              text: item.text,
            }))
          );
        }
      } catch {
        /* restore is best-effort */
      } finally {
        if (active) setRestoring(false);
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, []);

  const toggleTtsMute = useCallback(() => {
    setTtsMuted((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TTS_MUTE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    isSendingRef.current = false;
    setIsSending(false);
    setExecutionSteps([]);
  }, []);

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    isSendingRef.current = false;
    setIsSending(false);
    setExecutionSteps([]);
    setConversationId(null);
    conversationIdRef.current = null;
    setReplyWithSpeech(false);
    setChatMessages([welcomeMessage()]);
    setChatDraft("");
    setRuntimeMode("demo");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CONVERSATION_KEY);
    }
  }, []);

  const appendAssistantMessage = useCallback((text: string, action?: AtlasPendingAction) => {
    setChatMessages((current) => [
      ...current,
      {
        id: `assistant-local-${Date.now()}`,
        role: "assistant",
        text,
        action,
      },
    ]);
  }, []);

  /** Attach a routine suggestion to a new assistant message so Yes/No can be rendered. */
  const appendRoutineSuggestion = useCallback(
    (suggestion: { observationId: string; message: string }) => {
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-routine-${Date.now()}`,
          role: "assistant",
          text: suggestion.message,
          routineSuggestion: suggestion,
          action: undefined,
        },
      ]);
    },
    []
  );

  /** Remove the pending Yes/No affordance once a decision has been made. */
  const resolveRoutineSuggestion = useCallback((messageId: string) => {
    setChatMessages((current) =>
      current.map((msg) =>
        msg.id === messageId && msg.routineSuggestion
          ? { ...msg, routineSuggestion: undefined }
          : msg
      )
    );
  }, []);

  const sendMessage = useCallback(async (message: string, options?: { fromVoice?: boolean }) => {
    const trimmed = message.trim();
    if (!trimmed || isSendingRef.current) return;

    // Text → text reply only. Mic → may speak the reply (unless muted).
    setReplyWithSpeech(options?.fromVoice === true);

    const historySource = chatMessagesRef.current;
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", text: trimmed };
    const history = historySource
      .filter((item) => item.id !== "atlas-welcome")
      .slice(-12)
      .map(({ role, text }) => ({ role, text }));
    const assistantId = `assistant-${Date.now()}`;

    setChatMessages((current) => {
      const withoutWelcome =
        current.length === 1 && current[0]?.id === "atlas-welcome" ? [] : current;
      return [...withoutWelcome, userMessage];
    });
    setChatDraft("");
    isSendingRef.current = true;
    setIsSending(true);
    setExecutionSteps([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: trimmed,
          history,
          stream: true,
          conversationId: conversationIdRef.current ?? undefined,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Atlas could not answer right now.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let mode: "live" | "demo" = "demo";
      let action: AtlasPendingAction | undefined;
      let connectionRequest: AtlasConnectionRequest | undefined;
      let sawTokens = false;

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

          let event: {
            type: string;
            text?: string;
            action?: AtlasPendingAction;
            connectionRequest?: AtlasConnectionRequest;
            error?: string;
            stage?: string;
            label?: string;
            status?: "started" | "completed" | "failed";
            detail?: string;
            durationMs?: number;
            conversationId?: string | null;
          };
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          if (event.conversationId) {
            setConversationId(event.conversationId);
            conversationIdRef.current = event.conversationId;
          }

          if (event.type === "stage" && event.stage && event.label && event.status) {
            setExecutionSteps((current) => {
              const next = [...current];
              const existingIndex = next.findIndex(
                (step) => step.stage === event.stage && step.status === "started"
              );

              if (event.status === "started") {
                next.push({
                  id: `${event.stage}-${Date.now()}-${next.length}`,
                  stage: event.stage!,
                  label: event.label!,
                  status: "started",
                  detail: event.detail,
                });
                return next;
              }

              if (existingIndex >= 0) {
                next[existingIndex] = {
                  ...next[existingIndex],
                  status: event.status!,
                  label: event.label!,
                  detail: event.detail ?? next[existingIndex].detail,
                  durationMs: event.durationMs,
                };
                return next;
              }

              next.push({
                id: `${event.stage}-${Date.now()}-${next.length}`,
                stage: event.stage!,
                label: event.label!,
                status: event.status!,
                detail: event.detail,
                durationMs: event.durationMs,
              });
              return next;
            });
          } else if (event.type === "token" && event.text) {
            sawTokens = true;
            const cleanToken = event.text
              .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
              .replace(/<function[_\w=]*>[\s\S]*?<\/function[_\w]*>/gi, "")
              .replace(/<parameters>[\s\S]*?<\/parameters>/gi, "");
            setChatMessages((current) =>
              current.map((msg) => (msg.id === assistantId ? { ...msg, text: msg.text + cleanToken } : msg))
            );
          } else if (event.type === "done") {
            mode = "live";
            action = event.action ?? undefined;
            connectionRequest = event.connectionRequest ?? undefined;
          } else if (event.type === "error") {
            setChatMessages((current) =>
              current.map((msg) =>
                msg.id === assistantId ? { ...msg, text: event.error || "Something went wrong." } : msg
              )
            );
          }
        }
      }

      if (controller.signal.aborted) {
        setChatMessages((current) =>
          current.map((msg) =>
            msg.id === assistantId
              ? { ...msg, text: msg.text.trim() ? `${msg.text.trim()}\n\n_(Stopped)_` : "Stopped." }
              : msg
          )
        );
        return;
      }

      setRuntimeMode(mode);
      setChatMessages((current) =>
        current.map((msg) => {
          if (msg.id !== assistantId) return msg;
          const cleanText = msg.text
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
            .replace(/<function[_\w=]*>[\s\S]*?<\/function[_\w]*>/gi, "")
            .replace(/<parameters>[\s\S]*?<\/parameters>/gi, "")
            .replace(/<\/?(tool_call|function|parameters|mcp__[\w_.:-]+)>/gi, "")
            .trim();

          return {
            ...msg,
            action,
            connectionRequest,
            text: cleanText || "Here is what I found for your request.",
          };
        })
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setChatMessages((current) =>
          current.map((msg) =>
            msg.id === assistantId
              ? { ...msg, text: msg.text.trim() ? `${msg.text.trim()}\n\n_(Stopped)_` : "Stopped." }
              : msg
          )
        );
        return;
      }

      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: "I could not reach the assistant service. Please try again in a moment.",
        },
      ]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      isSendingRef.current = false;
      setIsSending(false);
      setExecutionSteps([]);
    }
  }, []);

  const hasUserMessages = useMemo(
    () => chatMessages.some((message) => message.role === "user"),
    [chatMessages]
  );

  const streamingAssistantText = useMemo(() => {
    if (!isSending) return false;
    const last = chatMessages[chatMessages.length - 1];
    return Boolean(last && last.role === "assistant" && last.text.trim().length > 0);
  }, [chatMessages, isSending]);

  const value = useMemo<AtlasChatContextValue>(
    () => ({
      chatDraft,
      setChatDraft,
      chatMessages,
      isSending,
      runtimeMode,
      setRuntimeMode,
      executionSteps,
      conversationId,
      restoring,
      hasUserMessages,
      streamingAssistantText,
      ttsMuted,
      toggleTtsMute,
      replyWithSpeech,
      sendMessage,
      stopGeneration,
      startNewChat,
      appendAssistantMessage,
      appendRoutineSuggestion,
      resolveRoutineSuggestion,
      restoreReady: !restoring,
    }),
    [
      chatDraft,
      chatMessages,
      isSending,
      runtimeMode,
      executionSteps,
      conversationId,
      restoring,
      hasUserMessages,
      streamingAssistantText,
      ttsMuted,
      toggleTtsMute,
      replyWithSpeech,
      sendMessage,
      stopGeneration,
      startNewChat,
      appendAssistantMessage,
      appendRoutineSuggestion,
      resolveRoutineSuggestion,
    ]
  );

  return <AtlasChatContext.Provider value={value}>{children}</AtlasChatContext.Provider>;
}

export function useAtlasChat() {
  const value = useContext(AtlasChatContext);
  if (!value) {
    throw new Error("useAtlasChat must be used within AtlasChatProvider");
  }
  return value;
}
