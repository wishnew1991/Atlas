/**
 * Regression test for the Prisma lazy-proxy `this`-binding defect.
 *
 * The previous `makeLazyProxy` extracted client methods as bare references and
 * invoked them as `target(...args)`, losing the receiver. Prisma's `$transaction`
 * reads `this._tracingHelper` on entry, so every array-form transaction threw:
 *
 *   Cannot read properties of undefined (reading '_tracingHelper')
 *
 * This suite reproduces that failure with a legacy-style bare invocation, then
 * proves the corrected proxy preserves the owner as `this` for both `$transaction`
 * and model delegate methods.
 */

import { describe, it, expect } from "vitest";

import { makeLazyProxy } from "@/lib/atlas/server/prisma";

/** Minimal stand-in for the Prisma runtime's `$transaction`, which reads
 *  `this._tracingHelper` on entry exactly like the real runtime does. */
class FakePrismaClient {
  _tracingHelper = {
    runInChildSpan(_span: unknown, fn: () => unknown): unknown {
      return fn();
    },
  };

  rows: unknown[] = [];

  $transaction(input: unknown) {
    // Mirrors the real runtime: `this._tracingHelper` is the FIRST field read.
    const o =
      typeof input === "function"
        ? () => this._runInteractive(input as (tx: unknown) => unknown)
        : () => this._runArray(input as unknown[]);
    return this._tracingHelper.runInChildSpan(
      { name: "transaction", attributes: { method: "$transaction" } },
      o
    );
  }

  private _runArray(_ops: unknown[]): { count: number } {
    return { count: 0 };
  }

  private _runInteractive(cb: (tx: unknown) => unknown): Promise<unknown> {
    return Promise.resolve(cb(this._makeTx()));
  }

  private _makeTx() {
    return {
      message: {
        create: (args: { data: Record<string, unknown> }) => {
          const row = { id: `m${this.rows.length + 1}`, ...args.data };
          this.rows.push(row);
          return Promise.resolve(row);
        },
      },
      conversation: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = { id: args.where.id, ...args.data, updatedAt: new Date() };
          this.rows.push(row);
          return Promise.resolve(row);
        },
      },
    };
  }

  message = {
    ownerTag: undefined as string | undefined,
    create(this: { ownerTag?: string }, args: { data: Record<string, unknown> }): Promise<unknown> {
      return Promise.resolve({ ownerTag: this.ownerTag, ...args.data });
    },
  };
}

describe("Prisma lazy proxy this-binding", () => {
  it("reproduces the previous _tracingHelper failure when called as a bare reference", () => {
    const client = new FakePrismaClient();
    const bareTransaction = client.$transaction; // `this` is lost (legacy behavior)
    expect(() => bareTransaction([{}])).toThrowError(
      "Cannot read properties of undefined (reading '_tracingHelper')"
    );
  });

  it("keeps the client as `this` for $transaction through the corrected proxy", async () => {
    const client = new FakePrismaClient();
    const proxy = makeLazyProxy(() => Promise.resolve(client)) as {
      $transaction: (input: unknown) => Promise<unknown>;
    };

    await expect(
      proxy.$transaction(async (tx: unknown) => {
        await (tx as { message: { create: (a: never) => Promise<unknown> } }).message.create({
          data: { conversationId: "c1", role: "user", content: "hello" },
        } as never);
      })
    ).resolves.toBeUndefined();
  });

  it("commits through the transaction body and records writes", async () => {
    const client = new FakePrismaClient();
    const proxy = makeLazyProxy(() => Promise.resolve(client)) as {
      $transaction: (input: (tx: unknown) => unknown) => Promise<unknown>;
    };

    await proxy.$transaction(async (tx: unknown) => {
      const t = tx as {
        message: { create: (a: { data: Record<string, unknown> }) => Promise<unknown> };
        conversation: {
          update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
        };
      };
      await t.message.create({ data: { role: "user", content: "user-msg" } });
      await t.message.create({ data: { role: "assistant", content: "assistant-msg" } });
      await t.conversation.update({ where: { id: "c1" }, data: { summary: "s" } });
    });

    expect(client.rows).toHaveLength(3);
    expect(client.rows.map((r) => (r as { role?: string }).role)).toContain("user");
    expect(client.rows.map((r) => (r as { role?: string }).role)).toContain("assistant");
  });

  it("keeps the delegate as `this` for model methods through the corrected proxy", async () => {
    const client = new FakePrismaClient();
    client.message.ownerTag = "message-delegate";
    const proxy = makeLazyProxy(() => Promise.resolve(client)) as {
      message?: { create: (a: Record<string, unknown>) => Promise<unknown> };
    };
    const result = await proxy.message?.create({ data: { content: "x" } });
    expect(result).toMatchObject({ ownerTag: "message-delegate" });
  });
});