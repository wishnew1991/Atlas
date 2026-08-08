import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initMockLlm, initLiveLlm } from "../adapters";
import { resetAtlasTestState, resetAtlasTestTimers } from "../reset";
import {
  assertCapabilitiesContain,
  assertCapabilitiesDoNotContain,
  assertCapabilitiesEqual,
  assertIsContinuation,
  assertNotContinuation,
} from "../assertions/planner";
import type { Capability } from "@/lib/atlas/planner/planner";
import { plan } from "@/lib/atlas/planner/planner";
import { isContinuationUtterance } from "@/lib/atlas/conversation/state";
import { analyzeIntent } from "@/lib/atlas/intent/analyzer";

import directRoutingFixtures from "../fixtures/planner/direct-routing.json";

vi.mock("@/lib/atlas/server/model-registry", () => ({
  resolveDefaultModel: vi.fn().mockResolvedValue({
    id: "test-model",
    provider: "openai",
    label: "test",
    apiKey: "test-key",
    enabled: true,
  }),
}));

beforeEach(() => {
  resetAtlasTestState();
  const mock = initMockLlm();

  for (const fixture of directRoutingFixtures) {
    mock.addScenario({
      name: `classifier: ${fixture.input}`,
      when: {
        systemPrompt: "capability classifier",
        userMessage: fixture.input,
      },
      then: {
        content: JSON.stringify({
          capabilities: fixture.capabilities,
          confidence: 0.95,
          domain: fixture.capabilities[0] === "none" ? null : fixture.capabilities[0],
          entities: null,
          reason: `test fixture: ${fixture.input}`,
        }),
        finishReason: "stop",
      },
    });
  }

  mock.withDefaultContent(
    JSON.stringify({
      capabilities: ["web"],
      confidence: 0,
      domain: null,
      entities: null,
      reason: "unmatched",
    })
  );
});

afterEach(() => {
  initLiveLlm();
  resetAtlasTestTimers();
});

describe("Planner — Direct Keyword Routing", () => {
  const fixtures = directRoutingFixtures.filter(
    (f: typeof directRoutingFixtures[number]) => f.input !== "send an email to John"
  );

  for (const fixture of fixtures) {
    it(`"${fixture.input}" → [${fixture.capabilities.join(", ")}]`, async () => {
      const result = await plan(
        fixture.input,
        fixture.history as { role: "user" | "assistant"; text: string }[]
      );

      assertCapabilitiesEqual(result, fixture.capabilities as Capability[]);
      assertNotContinuation(result);
    });
  }

  it('"send an email to John" → contains communication', async () => {
    const result = await plan("send an email to John", []);
    assertCapabilitiesContain(result, "communication");
    assertNotContinuation(result);
  });
});

describe("Planner — Continuation Detection", () => {
  it("bare 'yes' after food conversation continues as food", async () => {
    const history = [
      { role: "user" as const, text: "I want to order biryani" },
      { role: "assistant" as const, text: "Sure, let me find restaurants." },
    ];

    const result = await plan("yes", history);

    assertCapabilitiesContain(result, "food");
    assertIsContinuation(result);
  });

  it("'go ahead' after food conversation continues as food", async () => {
    const history = [
      { role: "user" as const, text: "I am hungry" },
      { role: "assistant" as const, text: "What would you like to eat?" },
    ];

    const result = await plan("go ahead", history);

    assertCapabilitiesContain(result, "food");
    assertIsContinuation(result);
  });

  it("'order it' after food conversation continues as food", async () => {
    const history = [
      { role: "user" as const, text: "I want chicken biryani" },
      { role: "assistant" as const, text: "Found Meghana Foods." },
    ];

    const result = await plan("order it", history);

    assertCapabilitiesContain(result, "food");
    assertIsContinuation(result);
  });

  it("bare 'yes' with no history defaults to none", async () => {
    const result = await plan("yes", []);

    assertCapabilitiesEqual(result, ["none"]);
    assertNotContinuation(result);
  });

  it("numeric reference '2' after food continues as food", async () => {
    const history = [
      { role: "user" as const, text: "find biryani" },
      { role: "assistant" as const, text: "Here are options: 1. Meghana 2. Paradise" },
    ];

    const result = await plan("2", history);

    assertCapabilitiesContain(result, "food");
    assertIsContinuation(result);
  });
});

describe("Planner — New Topic Override", () => {
  it("new food topic overrides shopping context", async () => {
    const history = [
      { role: "user" as const, text: "buy headphones" },
      { role: "assistant" as const, text: "Found headphones." },
    ];

    const result = await plan("I want biryani", history);

    assertCapabilitiesContain(result, "food");
    assertCapabilitiesDoNotContain(result, "shopping");
    assertNotContinuation(result);
  });

  it("new travel topic overrides food context", async () => {
    const history = [
      { role: "user" as const, text: "I want biryani" },
      { role: "assistant" as const, text: "Let me find food." },
    ];

    const result = await plan("book a flight to Delhi", history);

    assertCapabilitiesContain(result, "travel");
    assertCapabilitiesDoNotContain(result, "food");
    assertNotContinuation(result);
  });
});

describe("Planner — Ambiguous Utterances", () => {
  it("'I'm craving' routes to food", async () => {
    const result = await plan("I'm craving", []);

    assertCapabilitiesContain(result, "food");
    assertNotContinuation(result);
  });

  it("'I want something' falls back to none", async () => {
    const result = await plan("I want something", []);

    assertCapabilitiesEqual(result, ["none"]);
    assertNotContinuation(result);
  });
});

describe("Planner — isContinuationUtterance", () => {
  it("detects confirmations", () => {
    expect(isContinuationUtterance("yes")).toBe(true);
    expect(isContinuationUtterance("yeah")).toBe(true);
    expect(isContinuationUtterance("sure")).toBe(true);
    expect(isContinuationUtterance("go ahead")).toBe(true);
    expect(isContinuationUtterance("do it")).toBe(true);
    expect(isContinuationUtterance("order it")).toBe(true);
    expect(isContinuationUtterance("book it")).toBe(true);
  });

  it("detects referential utterances", () => {
    expect(isContinuationUtterance("that one")).toBe(true);
    expect(isContinuationUtterance("the first one")).toBe(true);
    expect(isContinuationUtterance("option 3")).toBe(true);
  });

  it("detects short slot fills", () => {
    expect(isContinuationUtterance("tomorrow")).toBe(true);
    expect(isContinuationUtterance("7pm")).toBe(true);
  });

  it("does not detect full sentences as continuations", () => {
    expect(isContinuationUtterance("I want to order biryani from Meghana")).toBe(false);
    expect(isContinuationUtterance("what is the weather like")).toBe(false);
  });
});

describe("Planner — analyzeIntent", () => {
  it("classifies action verbs as tool intent", () => {
    expect(analyzeIntent("Order biryani from Meghana").kind).toBe("tool");
    expect(analyzeIntent("Book a flight to Paris").kind).toBe("tool");
    expect(analyzeIntent("Buy headphones").kind).toBe("tool");
  });

  it("classifies greetings as chat intent", () => {
    expect(analyzeIntent("hi").kind).toBe("chat");
    expect(analyzeIntent("hello there").kind).toBe("chat");
    expect(analyzeIntent("how are you").kind).toBe("chat");
  });

  it("classifies identity questions as chat", () => {
    expect(analyzeIntent("who are you").kind).toBe("chat");
    expect(analyzeIntent("what can you do").kind).toBe("chat");
  });

  it("classifies hunger expressions as chat (conversational)", () => {
    expect(analyzeIntent("I'm hungry").kind).toBe("chat");
    expect(analyzeIntent("I'm craving biryani").kind).toBe("chat");
  });

  it("classifies knowledge questions as clarify", () => {
    expect(analyzeIntent("what is photosynthesis").kind).toBe("clarify");
  });

  it("classifies task connectors as task", () => {
    expect(analyzeIntent("then book a cab and add to cart").kind).toBe("task");
  });
});

describe("Planner — Golden Fixtures (Snapshot)", () => {
  for (const fixture of directRoutingFixtures) {
    it(`snapshot: "${fixture.input}"`, async () => {
      const result = await plan(
        fixture.input,
        fixture.history as { role: "user" | "assistant"; text: string }[]
      );

      expect(result).toMatchSnapshot();
    });
  }
});
