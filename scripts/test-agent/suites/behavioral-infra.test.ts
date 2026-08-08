import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MockOpenAiServer } from "../servers/mock-openai";
import { InfrastructureController } from "../replay/infrastructure";
import { ReplayEngine } from "../replay/engine";
import { createReplayRuntime, ReplayRuntime } from "../replay/runtime";
import { HookPriority, HookMode } from "../replay/types";
import type { HookContext, TurnResult, ConversationDataset } from "../replay/types";

describe("Behavioral Infrastructure — MockOpenAiServer", () => {
  let server: MockOpenAiServer;

  beforeAll(async () => { server = new MockOpenAiServer(); await server.start(); });
  afterAll(async () => { await server.stop(); });

  it("health check returns 200", async () => {
    const res = await fetch(`http://127.0.0.1:${server.getPort()}/__admin/health`);
    expect(res.status).toBe(200);
  });

  it("responds to chat completions with structured output", async () => {
    server.getMock().withDefaultContent("Hello from mock");

    const res = await fetch(`${server.getUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const json = await res.json();
    expect(json.choices).toBeDefined();
    expect(json.choices[0].message.content).toBe("Hello from mock");
    expect(json.choices[0].finish_reason).toBe("stop");
  });

  it("responds with tool calls", async () => {
    server.getMock().clearScenarios();
    server.getMock().whenUserSays("order", [
      { id: "call_1", name: "food_find_restaurants", arguments: { dish: "biryani" } },
    ]);

    const res = await fetch(`${server.getUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test",
        messages: [{ role: "user", content: "I want to order" }],
      }),
    });

    const json = await res.json();
    expect(json.choices[0].message.tool_calls).toBeDefined();
    expect(json.choices[0].message.tool_calls[0].function.name).toBe("food_find_restaurants");
    expect(json.choices[0].finish_reason).toBe("tool_calls");
  });

  it("streams SSE tokens", async () => {
    server.getMock().clearScenarios();
    server.getMock().withDefaultContent("Hello world");

    const res = await fetch(`${server.getUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      }),
    });

    const text = await res.text();
    expect(text).toContain("data:");
    expect(text).toContain("[DONE]");
  });

  it("streams tool calls in SSE format", async () => {
    server.getMock().clearScenarios();
    server.getMock().whenUserSays("order", [
      { id: "call_1", name: "food_find_restaurants", arguments: { dish: "biryani" } },
    ]);

    const res = await fetch(`${server.getUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test",
        messages: [{ role: "user", content: "I want to order" }],
        stream: true,
      }),
    });

    const text = await res.text();
    expect(text).toContain("tool_calls");
    expect(text).toContain("food_find_restaurants");
    expect(text).toContain("[DONE]");
  });

  it("returns embeddings with correct dimensions", async () => {
    const res = await fetch(`${server.getUrl()}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test", input: "hello" }),
    });

    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.length).toBe(1);
    expect(json.data[0].embedding.length).toBe(128);
  });

  it("loads scenarios via admin endpoint", async () => {
    await fetch(`http://127.0.0.1:${server.getPort()}/__admin/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { name: "test", when: { userMessage: "admin test" }, then: { content: "admin response" } },
      ]),
    });

    const res = await fetch(`${server.getUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test", messages: [{ role: "user", content: "admin test" }] }),
    });

    const json = await res.json();
    expect(json.choices[0].message.content).toBe("admin response");
  });

  it("injects faults via admin endpoint", async () => {
    await fetch(`http://127.0.0.1:${server.getPort()}/__admin/faults`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorRate: 1.0 }),
    });

    const res = await fetch(`${server.getUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test", messages: [{ role: "user", content: "any" }] }),
    });

    expect(res.status).toBe(500);

    await fetch(`http://127.0.0.1:${server.getPort()}/__admin/faults`, { method: "DELETE" });
  });
});

describe("Behavioral Infrastructure — Hook System", () => {
  it("calls hooks in priority order", async () => {
    const order: string[] = [];
    const engine = new ReplayEngine();

    engine.registerHook({
      name: "low", priority: HookPriority.Observer, mode: HookMode.Observational,
      onReplayStart() { order.push("low"); },
    });
    engine.registerHook({
      name: "high", priority: HookPriority.Critical, mode: HookMode.Critical,
      onReplayStart() { order.push("high"); },
    });

    await engine["invokeHooks"]("onReplayStart", { dataset: { name: "t", turns: [] }, turn: null, turnIndex: 0, startedAt: 0, trace: {} });
    expect(order).toEqual(["high", "low"]);
  });

  it("critical hook failure aborts replay", async () => {
    const engine = new ReplayEngine();
    engine.registerHook({
      name: "failer", priority: HookPriority.Critical, mode: HookMode.Critical,
      onTurnStart() { throw new Error("critical failure"); },
    });

    await expect(
      engine["invokeHooks"]("onTurnStart", { dataset: { name: "t", turns: [] }, turn: null, turnIndex: 0, startedAt: 0, trace: {} })
    ).rejects.toThrow("critical failure");
  });

  it("observational hook failure does not abort", async () => {
    const engine = new ReplayEngine();
    engine.registerHook({
      name: "safe-failer", priority: HookPriority.Observer, mode: HookMode.Observational,
      onTurnStart() { throw new Error("observable failure"); },
    });

    await expect(
      engine["invokeHooks"]("onTurnStart", { dataset: { name: "t", turns: [] }, turn: null, turnIndex: 0, startedAt: 0, trace: {} })
    ).resolves.toBeUndefined();
  });

  it("turn result is immutable (frozen)", async () => {
    const engine = new ReplayEngine();
    let captured: Readonly<TurnResult> | null = null;

    engine.registerHook({
      name: "capturer", priority: HookPriority.Assertion, mode: HookMode.Observational,
      onTurnEnd(_ctx: HookContext, result: Readonly<TurnResult>) {
        captured = result;
      },
    });

    const result: TurnResult = {
      reply: "test", toolsUsed: [], latencyMs: 10,
    };

    await engine["invokeHooks"]("onTurnEnd", { dataset: { name: "t", turns: [] }, turn: null, turnIndex: 0, startedAt: 0, trace: {} }, Object.freeze(result));
    expect(captured).toBeDefined();
    expect(Object.isFrozen(captured!)).toBe(true);
  });
});

describe("Behavioral Infrastructure — ReplayRuntime", () => {
  it("createReplayRuntime produces a runtime instance", async () => {
    const runtime = createReplayRuntime({
      detachedDevUrl: "http://127.0.0.1:3000",
      detachedLlmPort: 3001,
    });
    await runtime.start();
    expect(runtime).toBeDefined();
    expect(runtime.baseUrl).toBe("http://127.0.0.1:3000");
    expect(runtime.llmPort).toBe(0);
    await runtime.stop();
  });

  it("registerHook adds hooks to engine", () => {
    const runtime = createReplayRuntime({
      detachedDevUrl: "http://127.0.0.1:3000",
      detachedLlmPort: 3001,
    });

    const hook = {
      name: "test-hook",
      priority: HookPriority.Metrics,
      mode: HookMode.Observational,
    };

    expect(() => runtime.registerHook(hook)).not.toThrow();
  });
});
