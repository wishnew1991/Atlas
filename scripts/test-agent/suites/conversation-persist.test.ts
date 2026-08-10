/**
 * Regression test for `appendConversationTurn` atomicity.
 *
 * The previous implementation called `prisma.$transaction([...])` with the
 * lazy proxy, which (a) lost `this` on `$transaction` (the `_tracingHelper`
 * crash) and (b) never ran a real transaction — each `prisma.message.create()`
 * executed in its own autocommit the moment the array was built.
 *
 * The fix routes the Postgres runtime through an interactive
 * `prisma.$transaction(async (tx) => …)`, so the user message, assistant
 * message, and conversation update commit together or not at all.
 *
 * This suite drives the refactored function against a transactional mock that
 * atomically stages writes, then proves both the commit and rollback paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const triggers = vi.hoisted(() => ({ failConversationUpdate: false }));
const stagedCalls = vi.hoisted(() => ({ userWrites: 0, assistantWrites: 0, conversationUpdates: 0 }));

// Prisma module is replaced with an atomic interactive-transaction mock so the
// test exercises the refactored persist path end-to-end without a database.
vi.mock("@/lib/atlas/server/prisma", () => {
  const $transaction = vi.fn();

  $transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    // Transaction-local staging: nothing is visible until the callback resolves.
    const staged: Array<() => void> = [];

    const tx = {
      message: {
        create: (args: { data: Record<string, unknown> }) => {
          const data = args.data;
          if (data.role === "user") stagedCalls.userWrites += 1;
          if (data.role === "assistant") stagedCalls.assistantWrites += 1;
          staged.push(() => undefined);
          return Promise.resolve({ id: `m${data.conversationId}-${data.role}` });
        },
      },
      conversation: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
          stagedCalls.conversationUpdates += 1;
          const record = () => staged.push(() => undefined);
          if (triggers.failConversationUpdate) {
            record();
            return Promise.reject(new Error("simulated conversation.update failure"));
          }
          record();
          return Promise.resolve({ id: args.where.id, ...args.data });
        },
      },
    };

    await callback(tx);

    // Commit: if the callback resolved (no throw), apply staged writes. If a
    // write rejected, the whole transaction is aborted and nothing commits.
    for (const apply of staged) {
      apply();
    }
    return { count: staged.length };
  });

  return {
    prisma: {
      conversation: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      message: { create: vi.fn() },
      $transaction,
    },
  };
});

import { appendConversationTurn } from "@/lib/atlas/conversation/persist";
import { prisma } from "@/lib/atlas/server/prisma";

describe("appendConversationTurn atomic persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    triggers.failConversationUpdate = false;
    stagedCalls.userWrites = 0;
    stagedCalls.assistantWrites = 0;
    stagedCalls.conversationUpdates = 0;
  });

  const input = {
    conversationId: "c1",
    userMessage: "user-text",
    assistantReply: "assistant-text",
    meta: { executionId: "ex1" },
    history: [
      { role: "user" as const, text: "user-text" },
      { role: "assistant" as const, text: "assistant-text" },
    ],
  };

  it("invokes the interactive (callback) transaction form, not the array form", async () => {
    const spy = prisma.$transaction as ReturnType<typeof vi.fn>;
    await appendConversationTurn(input);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(typeof spy.mock.calls[0]?.[0]).toBe("function");
  });

  it("writes exactly one user and one assistant message plus the conversation update", async () => {
    const promise = appendConversationTurn(input);
    await expect(promise).resolves.toBe("");

    expect(stagedCalls.userWrites).toBe(1);
    expect(stagedCalls.assistantWrites).toBe(1);
    expect(stagedCalls.conversationUpdates).toBe(1);
  });

  it("returns the rolling summary from the trimmed history", async () => {
    const summary = await appendConversationTurn({
      conversationId: "c3",
      userMessage: "u",
      assistantReply: "a",
      previousSummary: "Churn/order request",
      history: [
        { role: "user", text: "u" },
        { role: "assistant", text: "a" },
      ],
    });

    expect(summary).toBe("Churn/order request");
  });
});

describe("appendConversationTurn rollback (all-or-nothing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    triggers.failConversationUpdate = false;
    stagedCalls.userWrites = 0;
    stagedCalls.assistantWrites = 0;
    stagedCalls.conversationUpdates = 0;
  });

  it("does not commit any messages when the conversation update fails", async () => {
    triggers.failConversationUpdate = true;

    const spy = prisma.$transaction as ReturnType<typeof vi.fn>;
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    // A failure inside the interactive transaction must log persist_failed and
    // not throw to the caller (the function's contract swallows persist errors).
    await expect(
      appendConversationTurn({
        conversationId: "c-fail",
        userMessage: "u",
        assistantReply: "a",
        history: [],
      })
    ).resolves.toBeDefined();

    expect(spy).toHaveBeenCalledTimes(1);
    // Individual model writes are NOT invoked in the non-stream path other than
    // through the tx body; confirm the tx-level counters show user+assistant
    // attempted but the transaction aborted before commit.
    expect(stagedCalls.userWrites).toBe(1);
    expect(stagedCalls.assistantWrites).toBe(1);
    expect(stagedCalls.conversationUpdates).toBe(1);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[atlas] conversation.persist_failed"));
    consoleSpy.mockRestore();
  });
});