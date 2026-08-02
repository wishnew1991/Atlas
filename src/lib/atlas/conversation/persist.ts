import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import { trimHistoryForModel } from "@/lib/atlas/conversation/history";
import { logStructured } from "@/lib/atlas/observability/trace";

function dbUserId(userId: string): string | null {
  return userId === "atlas-demo-user" ? null : userId;
}

/**
 * Resolve or create a conversation for this turn.
 * Accepts an optional client-provided conversationId (additive API field).
 */
export async function resolveConversation(
  userId: string,
  conversationId?: string
): Promise<{ id: string; summary: string }> {
  const uid = dbUserId(userId);

  if (conversationId) {
    const existing = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (existing && (existing.userId === uid || (uid === null && existing.userId === null))) {
      return { id: existing.id, summary: existing.summary || "" };
    }
  }

  if (uid) {
    const latest = await prisma.conversation.findFirst({
      where: { userId: uid },
      orderBy: { lastMessageAt: "desc" },
    });
    if (latest && Date.now() - latest.lastMessageAt.getTime() < 6 * 60 * 60 * 1000) {
      return { id: latest.id, summary: latest.summary || "" };
    }
  }

  // Omit userId when null — Prisma CreateInput rejects scalar FK null and
  // only accepts the nested `user` relation on that path.
  const created = await prisma.conversation.create({
    data: {
      ...(uid ? { userId: uid } : {}),
      summary: "",
      lastMessageAt: new Date(),
    },
  });

  return { id: created.id, summary: "" };
}

export async function appendConversationTurn(input: {
  conversationId: string;
  userMessage: string;
  assistantReply: string;
  history: AtlasChatHistoryItem[];
  previousSummary?: string;
  meta?: Record<string, unknown>;
}): Promise<string> {
  const { recent, summary } = trimHistoryForModel(input.history, input.previousSummary ?? "");

  try {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: input.conversationId,
          role: "user",
          content: input.userMessage,
        },
      }),
      prisma.message.create({
        data: {
          conversationId: input.conversationId,
          role: "assistant",
          content: input.assistantReply,
          meta: input.meta ? JSON.stringify(input.meta) : null,
        },
      }),
      prisma.conversation.update({
        where: { id: input.conversationId },
        data: {
          summary,
          lastMessageAt: new Date(),
        },
      }),
    ]);
  } catch (error) {
    logStructured("conversation.persist_failed", {
      conversationId: input.conversationId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  void recent;
  return summary;
}

export async function loadRecentMessages(
  conversationId: string,
  limit = 24
): Promise<AtlasChatHistoryItem[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows
    .reverse()
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role as "user" | "assistant",
      text: row.content,
    }));
}

export type ConversationSnapshot = {
  id: string;
  summary: string;
  lastMessageAt: string;
  messages: AtlasChatHistoryItem[];
};

function ownsConversation(
  conversation: { userId: string | null },
  userId: string
): boolean {
  const uid = dbUserId(userId);
  return conversation.userId === uid || (uid === null && conversation.userId === null);
}

/** Load a conversation the actor owns, with recent messages for UI restore. */
export async function loadConversationSnapshot(
  userId: string,
  conversationId: string,
  limit = 40
): Promise<ConversationSnapshot | null> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || !ownsConversation(conversation, userId)) {
    return null;
  }

  const messages = await loadRecentMessages(conversation.id, limit);
  return {
    id: conversation.id,
    summary: conversation.summary || "",
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    messages,
  };
}

/** Latest conversation for the actor (signed-in) within the recent window. */
export async function loadLatestConversationSnapshot(
  userId: string,
  limit = 40
): Promise<ConversationSnapshot | null> {
  const uid = dbUserId(userId);
  if (!uid) return null;

  const conversation = await prisma.conversation.findFirst({
    where: { userId: uid },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conversation) return null;

  const messages = await loadRecentMessages(conversation.id, limit);
  if (messages.length === 0) return null;

  return {
    id: conversation.id,
    summary: conversation.summary || "",
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    messages,
  };
}
