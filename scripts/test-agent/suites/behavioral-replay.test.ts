import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ReplayEngine } from "../replay/engine";
import { ReplayRuntime, createReplayRuntime } from "../replay/runtime";
import { HookPriority, HookMode } from "../replay/types";
import type { ConversationDataset, HookContext, TurnResult, ConversationTrace } from "../replay/types";

import happyPath from "../datasets/conversations/food/happy-path.json";
import productSearch from "../datasets/conversations/shopping/product-search.json";
import bareConfirmations from "../datasets/conversations/edge-cases/bare-confirmations.json";

describe("Behavioral Replay — Engine", () => {
  let engine: ReplayEngine;

  beforeAll(() => {
    engine = new ReplayEngine();
  });

  it("parses dataset and produces trace structure", async () => {
    // Create a mock endpoint that returns a simple chat response
    const mockPort = 9000 + Math.floor(Math.random() * 1000);
    const server = (await import("node:http")).createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"type":"token","text":"Hello from mock"}\n\n');
      res.write('data: {"type":"done","conversationId":"c-1"}\n\n');
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(mockPort, resolve));

    try {
      const dataset: ConversationDataset = {
        name: "test",
        turns: [
          { user: "hi", expect: { shouldNotHaveAction: true } },
          { user: "bye" },
        ],
      };

      const trace = await engine.replay(dataset, `http://127.0.0.1:${mockPort}`);
      expect(trace.dataset).toBe("test");
      expect(trace.turns.length).toBe(2);
      expect(trace.turns[0].reply).toBe("Hello from mock");
      expect(trace.turns[0].assertions.length).toBe(1);
      expect(trace.turns[0].assertions[0].passed).toBe(true);
      expect(trace.turnCount).toBe(2);
      expect(trace.totalLatencyMs).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });

  it("collects conversationId across turns", async () => {
    let callCount = 0;
    const server = (await import("node:http")).createServer((_req, res) => {
      callCount++;
      const cid = `conv-${callCount}`;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: {"type":"token","text":"Turn ${callCount}"}\n\n`);
      res.write(`data: {"type":"done","conversationId":"${cid}"}\n\n`);
      res.end();
    });

    const port = 9100 + Math.floor(Math.random() * 1000);
    await new Promise<void>((r) => server.listen(port, r));
    try {
      const ds: ConversationDataset = { name: "multi", turns: [{ user: "a" }, { user: "b" }] };
      const trace = await engine.replay(ds, `http://127.0.0.1:${port}`);
      expect(trace.turns[0].conversationId).toBe("conv-1");
      expect(trace.turns[1].conversationId).toBe("conv-2");
    } finally { server.close(); }
  });

  it("handles error responses gracefully", async () => {
    const server = (await import("node:http")).createServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });

    const port = 9200 + Math.floor(Math.random() * 1000);
    await new Promise<void>((r) => server.listen(port, r));
    try {
      const ds: ConversationDataset = { name: "err", turns: [{ user: "crash" }] };
      const trace = await engine.replay(ds, `http://127.0.0.1:${port}`);
      expect(trace.turns[0].error).toBeDefined();
      expect(trace.turns[0].latencyMs).toBeGreaterThan(0);
    } finally { server.close(); }
  });
});

describe("Behavioral Replay — Golden Datasets", () => {
  let engine: ReplayEngine;

  beforeAll(() => {
    engine = new ReplayEngine();
  });

  it("food happy-path dataset has expected structure", () => {
    const ds = happyPath as ConversationDataset;
    expect(ds.name).toBe("Food — Happy Path Ordering");
    expect(ds.turns.length).toBe(5);
    expect(ds.turns[0].user).toBe("I'm hungry");
    expect(ds.turns[0].expect).toBeDefined();
  });

  it("shopping product-search dataset has expected structure", () => {
    const ds = productSearch as ConversationDataset;
    expect(ds.name).toBe("Shopping — Product Search");
    expect(ds.turns.length).toBe(4);
  });

  it("bare confirmations dataset covers continuations", () => {
    const ds = bareConfirmations as ConversationDataset;
    expect(ds.turns.length).toBe(4);
    // All turns after the first are continuations
    expect(ds.turns[1].expect?.continuation).toBe(true);
    expect(ds.turns[2].expect?.continuation).toBe(true);
    expect(ds.turns[3].expect?.continuation).toBe(true);
  });
});

describe("Behavioral Replay — Hooks", () => {
  it("traces hook events in correct order", async () => {
    const engine = new ReplayEngine();
    const events: string[] = [];

    engine.registerHook({
      name: "tracker", priority: HookPriority.Assertion, mode: HookMode.Observational,
      onReplayStart() { events.push("start"); },
      onTurnStart() { events.push("turn-start"); },
      onTurnEnd(_c: HookContext, _r: Readonly<TurnResult>) { events.push("turn-end"); },
      onReplayEnd() { events.push("end"); },
    });

    const server = (await import("node:http")).createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"type":"token","text":"ok"}\n\n');
      res.write('data: {"type":"done"}\n\n');
      res.end();
    });

    const port = 9300 + Math.floor(Math.random() * 1000);
    await new Promise<void>((r) => server.listen(port, r));
    try {
      await engine.replay({ name: "hook-test", turns: [{ user: "a" }, { user: "b" }] }, `http://127.0.0.1:${port}`);
    } finally { server.close(); }

    expect(events).toEqual(["start", "turn-start", "turn-end", "turn-start", "turn-end", "end"]);
  });
});

describe("Behavioral Replay — Trace Metadata", () => {
  it("captures assertion counts in trace", async () => {
    const engine = new ReplayEngine();
    const server = (await import("node:http")).createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"type":"token","text":"ok"}\n\n');
      res.write('data: {"type":"done"}\n\n');
      res.end();
    });

    const port = 9400 + Math.floor(Math.random() * 1000);
    await new Promise<void>((r) => server.listen(port, r));
    try {
      const ds: ConversationDataset = {
        name: "assertion-test",
        turns: [
          { user: "a", expect: { shouldNotHaveAction: true, shouldNotHaveTools: true } },
          { user: "b", expect: { hasApproval: false, maxLatencyMs: 5000 } },
        ],
      };
      const trace = await engine.replay(ds, `http://127.0.0.1:${port}`);
      expect(trace.assertionCount).toBe(4);
      expect(trace.assertionPassed).toBe(4);
    } finally { server.close(); }
  });
});

describe("Behavioral Replay — Full Stack (opt-in)", () => {
  const LIVE = process.env.ATLAS_BEHAVIORAL_LIVE === "1";

  (LIVE ? it : it.skip)("replays conversation against real Next.js server", async () => {
    const runtime = createReplayRuntime();
    await runtime.start();

    try {
      const ds = happyPath as ConversationDataset;
      const trace = await runtime.replay(ds);

      expect(trace.turns.length).toBe(5);
      expect(trace.turns.every((t) => !t.error || t.error.length === 0)).toBe(true);

      for (const turn of trace.turns) {
        expect(turn.latencyMs).toBeGreaterThan(0);
        expect(turn.reply).toBeTruthy();
      }
    } finally {
      await runtime.stop();
    }
  }, 120000);
});
