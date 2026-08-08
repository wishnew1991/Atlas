import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initMockLlm, initLiveLlm, MockLlmAdapter } from "../adapters";
import { getLlmAdapter } from "@/lib/atlas/llm";
import { resetAtlasTestState, resetAtlasTestTimers } from "../reset";

describe("Infrastructure — MockLlmAdapter", () => {
  let mock: MockLlmAdapter;

  beforeEach(() => {
    resetAtlasTestState();
    mock = initMockLlm();
  });

  afterEach(() => {
    initLiveLlm();
    resetAtlasTestTimers();
  });

  describe("scenario matching", () => {
    it("matches by user message substring", async () => {
      mock.whenUserSays("order pizza", "Let me help you order pizza.");

      const result = await getLlmAdapter("openai").chat({
        model: "test",
        messages: [{ role: "user", content: "I want to order pizza" }],
        provider: "openai",
        apiKey: "test-key",
      });

      expect(result.content).toBe("Let me help you order pizza.");
      expect(result.toolCalls).toEqual([]);
    });

    it("matches by system prompt", async () => {
      mock.addScenario({
        name: "classifier",
        when: { systemPrompt: "capability classifier" },
        then: { content: "classifier-response" },
      });

      const result = await getLlmAdapter("openai").chat({
        model: "test",
        messages: [
          { role: "system", content: "You are a capability classifier for Atlas." },
          { role: "user", content: "I am hungry" },
        ],
        provider: "openai",
        apiKey: "test-key",
      });

      expect(result.content).toBe("classifier-response");
    });

    it("most specific scenario wins when multiple match", async () => {
      mock.whenUserSays("order pizza", "generic");
      mock.addScenario({
        name: "specific",
        when: { userMessage: "order pizza", systemPrompt: "classifier" },
        then: { content: "specific" },
      });

      const result = await getLlmAdapter("openai").chat({
        model: "test",
        messages: [
          { role: "system", content: "You are a classifier." },
          { role: "user", content: "I want to order pizza" },
        ],
        provider: "openai",
        apiKey: "test-key",
      });

      expect(result.content).toBe("specific");
    });

    it("returns default content when no scenario matches", async () => {
      mock.withDefaultContent("default reply");

      const result = await getLlmAdapter("openai").chat({
        model: "test",
        messages: [{ role: "user", content: "something unexpected" }],
        provider: "openai",
        apiKey: "test-key",
      });

      expect(result.content).toBe("default reply");
    });

    it("returns empty string when no scenario and no default", async () => {
      const result = await getLlmAdapter("openai").chat({
        model: "test",
        messages: [{ role: "user", content: "unexpected" }],
        provider: "openai",
        apiKey: "test-key",
      });

      expect(result.content).toBe("");
    });
  });

  describe("tool calls", () => {
    it("returns tool calls from scenario", async () => {
      mock.whenUserSays("find restaurants", [
        { id: "call_1", name: "food_find_restaurants", arguments: { dish: "biryani" } },
      ]);

      const result = await getLlmAdapter("openai").chat({
        model: "test",
        messages: [{ role: "user", content: "find restaurants" }],
        provider: "openai",
        apiKey: "test-key",
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("food_find_restaurants");
      expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({ dish: "biryani" });
    });

    it("supports multi-round tool workflows", async () => {
      mock.whenUserSaysMulti("multi round", [
        [{ id: "c1", name: "tool_a", arguments: { step: 1 } }],
        [{ id: "c2", name: "tool_b", arguments: { step: 2 } }],
      ]);

      const adapter = getLlmAdapter("openai");
      const options = {
        model: "test",
        messages: [{ role: "user" as const, content: "multi round" }],
        provider: "openai" as const,
        apiKey: "test-key",
      };

      const r1 = await adapter.chat(options);
      expect(r1.toolCalls[0].name).toBe("tool_a");

      mock.resetRoundIndex();
      const r1Again = await adapter.chat(options);
      expect(r1Again.toolCalls[0].name).toBe("tool_a");
    });
  });

  describe("error injection", () => {
    it("throws on error scenario", async () => {
      mock.addScenario({
        name: "error",
        when: { userMessage: "fail" },
        then: { error: { kind: "timeout", message: "timed out" } },
      });

      await expect(
        getLlmAdapter("openai").chat({
          model: "test",
          messages: [{ role: "user", content: "fail" }],
          provider: "openai",
          apiKey: "test-key",
        })
      ).rejects.toThrow("LLM timeout");
    });

    it("throws default error when no scenario matches", async () => {
      mock.withDefaultError({ kind: "server_error" });

      await expect(
        getLlmAdapter("openai").chat({
          model: "test",
          messages: [{ role: "user", content: "anything" }],
          provider: "openai",
          apiKey: "test-key",
        })
      ).rejects.toThrow("LLM server error");
    });
  });

  describe("embeddings", () => {
    it("produces deterministic embeddings", async () => {
      const a = await getLlmAdapter("openai").embed!({
        model: "test",
        input: "Hello",
        provider: "openai",
        apiKey: "test-key",
      });

      const b = await getLlmAdapter("openai").embed!({
        model: "test",
        input: "Hello",
        provider: "openai",
        apiKey: "test-key",
      });

      expect(a.embeddings).toHaveLength(1);
      expect(a.embeddings[0]).toHaveLength(128);
      expect(a.embeddings).toEqual(b.embeddings);
    });

    it("produces different embeddings for different inputs", async () => {
      const a = await getLlmAdapter("openai").embed!({
        model: "test",
        input: "Hello",
        provider: "openai",
        apiKey: "test-key",
      });
      const b = await getLlmAdapter("openai").embed!({
        model: "test",
        input: "Goodbye",
        provider: "openai",
        apiKey: "test-key",
      });

      expect(a.embeddings).not.toEqual(b.embeddings);
    });
  });

  describe("streaming", () => {
    it("yields tokens from chat response", async () => {
      mock.withDefaultContent("Hello world");

      const chunks: string[] = [];
      for await (const chunk of getLlmAdapter("openai").streamChat({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
        provider: "openai",
        apiKey: "test-key",
      })) {
        if (chunk.type === "token") chunks.push(chunk.text);
      }

      const text = chunks.join("");
      expect(text).toBe("Hello world");
      expect(chunks.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("Infrastructure — LLM Tier Switching", () => {
  afterEach(() => {
    initLiveLlm();
  });

  it("injects mock across aliased providers", () => {
    const mock = initMockLlm();

    expect(getLlmAdapter("openai")).toBe(mock);
    expect(getLlmAdapter("custom")).toBe(mock);
    expect(getLlmAdapter("nvidia")).toBe(mock);
  });

  it("does not affect non-aliased providers", () => {
    const originalAnthropic = getLlmAdapter("anthropic");
    initMockLlm();

    expect(getLlmAdapter("anthropic")).toBe(originalAnthropic);
    expect(getLlmAdapter("google")).not.toBe(originalAnthropic);
  });

  it("restores original adapters after live init", () => {
    const original = getLlmAdapter("openai");
    const mock = initMockLlm();

    expect(getLlmAdapter("openai")).toBe(mock);

    initLiveLlm();
    expect(getLlmAdapter("openai")).toBe(original);
  });
});

describe("Infrastructure — State Reset", () => {
  it("resetAtlasTestState should not throw", () => {
    expect(() => resetAtlasTestState()).not.toThrow();
  });

  it("resetAtlasTestTimers should not throw", () => {
    expect(() => resetAtlasTestTimers()).not.toThrow();
  });
});
