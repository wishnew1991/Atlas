import "server-only";

import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import { memory, type MemoryInterface } from "@/lib/atlas/memory/interface";

const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 4000;

export interface ConversationContext {
  messages: AtlasChatHistoryItem[];
}

export class ConversationManager {
  constructor(private readonly memoryStore: MemoryInterface = memory) {}

  buildContext(history: AtlasChatHistoryItem[], message: string): ConversationContext {
    const trimmedHistory = (history ?? [])
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && item.text.trim().length > 0)
      .slice(-MAX_HISTORY)
      .map((item) => ({ role: item.role, text: item.text.slice(0, MAX_MESSAGE_CHARS) }));

    return { messages: trimmedHistory };
  }

  async loadMemory(userId: string) {
    return this.memoryStore.load(userId);
  }

  async recordTurn(userId: string, userText: string, assistantText: string) {
    await this.memoryStore.save(userId, { role: "user", text: userText, at: Date.now() });
    await this.memoryStore.save(userId, { role: "assistant", text: assistantText, at: Date.now() });
  }
}
