import { describe, it, expect } from "vitest";
import { diffTraces, normalizeText, normalizeTrace, storeGoldenTrace, loadGoldenTrace, batchDiffTraces, generateDiffSummary } from "../replay/diff";
import type { ConversationTrace } from "../replay/types";

const makeTrace = (name: string, turns: Array<{ user: string; reply: string; tools: string[] }>): ConversationTrace => ({
  dataset: name,
  turns: turns.map((t) => ({
    user: t.user,
    reply: t.reply,
    toolsUsed: t.tools,
    action: null,
    latencyMs: 100,
    assertions: [],
  })),
  startedAt: "2024-01-01T00:00:00.000Z",
  completedAt: "2024-01-01T00:00:01.000Z",
  totalLatencyMs: 1000,
  turnCount: turns.length,
  assertionCount: 0,
  assertionPassed: 0,
});

describe("Trace Diff — Normalization", () => {
  it("strips timestamps from text", () => {
    expect(normalizeText("Order placed at 2024-12-25T10:30:00Z")).toBe("Order placed at <timestamp>");
  });

  it("strips UUIDs from text", () => {
    // exec_ pattern
    expect(normalizeText("exec_abc123-def456-ghi789")).toBe("<execid>");
    // UUID pattern
    const uuidResult = normalizeText("Error: 550e8400-e29b-41d4-a716-446655440000 not found");
    expect(uuidResult).toContain("<uuid>");
    expect(uuidResult).not.toContain("550e8400");
  });

  it("strips prices from text", () => {
    expect(normalizeText("Total: ₹714 (₹640 subtotal)")).not.toContain("₹714");
    expect(normalizeText("Total: ₹714 (₹640 subtotal)")).toContain("<price>");
  });

  it("collapses whitespace", () => {
    expect(normalizeText("hello    world\n\ntest  ")).toBe("hello world test");
  });

  it("normalizes trace turns correctly", () => {
    const trace = makeTrace("test", [{ user: "hi", reply: "hello", tools: [] }]);
    (trace.turns[0] as Record<string, unknown>).executionId = "exec_test123";
    (trace.turns[0] as Record<string, unknown>).conversationId = "conv_test456";
    const norm = normalizeTrace(trace);
    expect(norm.turns[0].executionId).toBe("<stripped>");
    expect(norm.turns[0].latencyMs).toBe(0);
    expect(norm.turns[0].conversationId).toBe("<stripped>");
  });
});

describe("Trace Diff — Exact Comparison", () => {
  it("detects no changes for identical traces", () => {
    const trace = makeTrace("test", [{ user: "hi", reply: "hello", tools: [] }]);
    const report = diffTraces(trace, trace);
    expect(report.summary.verdict).toBe("pass");
    expect(report.regressions.length).toBe(0);
  });

  it("detects user message changes", () => {
    const base = makeTrace("test", [{ user: "hi", reply: "hello", tools: [] }]);
    const curr = makeTrace("test", [{ user: "hello", reply: "hello", tools: [] }]);
    const report = diffTraces(base, curr);
    expect(report.regressions.length).toBeGreaterThanOrEqual(1);
    expect(report.regressions.some((r) => r.field === "user")).toBe(true);
  });
});

describe("Trace Diff — Fuzzy Comparison", () => {
  it("tolerates similar replies", () => {
    const base = makeTrace("test", [{ user: "hi", reply: "I found 3 restaurants near you. Meghana Foods (4.5★, ₹500 for two), Paradise Biryani (4.2★, ₹450 for two), and Closed Kitchen (3.8★, ₹300 for two).", tools: [] }]);
    const curr = makeTrace("test", [{ user: "hi", reply: "I found 3 restaurants near you. Meghana Foods (4.5★, <price> for two), Paradise Biryani (4.2★, <price> for two), and Closed Kitchen (3.8★, <price> for two).", tools: [] }]);
    const report = diffTraces(base, curr);
    expect(report.regressions.length).toBe(0);
  });

  it("flags completely different replies", () => {
    const base = makeTrace("test", [{ user: "hi", reply: "I can help with food orders.", tools: [] }]);
    const curr = makeTrace("test", [{ user: "hi", reply: "I specialize in travel bookings.", tools: [] }]);
    const report = diffTraces(base, curr);
    expect(report.regressions.some((r) => r.category === "reply_divergence")).toBe(true);
  });

  it("flags when reply disappears entirely", () => {
    const base = makeTrace("test", [{ user: "hi", reply: "Hello!", tools: [] }]);
    const curr = makeTrace("test", [{ user: "hi", reply: "", tools: [] }]);
    const report = diffTraces(base, curr);
    expect(report.regressions.some((r) => r.category === "reply_disappeared")).toBe(true);
  });
});

describe("Trace Diff — Tool Ordering", () => {
  it("ignores tool order for unordered fields", () => {
    const base = makeTrace("test", [{ user: "order", reply: "ok", tools: ["food_find_restaurants", "food_browse_menu"] }]);
    const curr = makeTrace("test", [{ user: "order", reply: "ok", tools: ["food_browse_menu", "food_find_restaurants"] }]);
    const report = diffTraces(base, curr);
    expect(report.regressions.length).toBe(0);
  });

  it("detects missing tools", () => {
    const base = makeTrace("test", [{ user: "order", reply: "ok", tools: ["food_find_restaurants", "food_checkout"] }]);
    const curr = makeTrace("test", [{ user: "order", reply: "ok", tools: ["food_find_restaurants"] }]);
    const report = diffTraces(base, curr);
    expect(report.regressions.some((r) => r.category === "tool_removed")).toBe(true);
  });

  it("detects added tools", () => {
    const base = makeTrace("test", [{ user: "order", reply: "ok", tools: ["food_find_restaurants"] }]);
    const curr = makeTrace("test", [{ user: "order", reply: "ok", tools: ["food_find_restaurants", "food_update_cart"] }]);
    const report = diffTraces(base, curr);
    expect(report.regressions.some((r) => r.category === "tool_added")).toBe(true);
  });
});

describe("Trace Diff — Regression Categories", () => {
  it("classifies capability changes as a regression", () => {
    const base = makeTrace("test", [{ user: "order", reply: "ok", tools: [] }]);
    const curr = makeTrace("test", [{ user: "order", reply: "ok", tools: [] }]);
    base.turns[0].capability = ["food"];
    curr.turns[0].capability = ["shopping"];
    const report = diffTraces(base, curr);
    expect(report.regressions.length).toBeGreaterThanOrEqual(1);
  });

  it("turn count mismatch produces warning", () => {
    const base = makeTrace("test", [{ user: "a", reply: "ok", tools: [] }]);
    const curr = makeTrace("test", [
      { user: "a", reply: "ok", tools: [] },
      { user: "b", reply: "ok", tools: [] },
    ]);
    const report = diffTraces(base, curr);
    expect(report.turnCount.match).toBe(false);
  });
});

describe("Trace Diff — Golden Store", () => {
  it("stores and loads golden traces", () => {
    const trace = makeTrace("store-test", [{ user: "hi", reply: "hello", tools: [] }]);
    const dir = "/tmp/atlas-test-diff";
    storeGoldenTrace(trace, dir);
    const loaded = loadGoldenTrace("store-test", dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.dataset).toBe("store-test");
    expect(loaded!.turns.length).toBe(1);
  });
});

describe("Trace Diff — Batch Diff", () => {
  it("produces reports for multiple traces", () => {
    const trace = makeTrace("batch-1", [{ user: "hi", reply: "hello", tools: [] }]);
    const dir = "/tmp/atlas-test-batch";
    storeGoldenTrace(trace, dir);

    const current = [trace];
    const reports = batchDiffTraces(dir, current);
    expect(reports.length).toBe(1);
    expect(reports[0].summary.verdict).toBe("pass");
  });
});

describe("Trace Diff — Summary Report", () => {
  it("generates readable terminal summary", () => {
    const base = makeTrace("alpha", [{ user: "hi", reply: "Hello world", tools: ["a", "b"] }]);
    const curr = makeTrace("alpha", [{ user: "hi", reply: "Goodbye world", tools: ["b"] }]);
    const report = diffTraces(base, curr);
    const summary = generateDiffSummary([report]);
    expect(summary).toContain("alpha");
    expect(summary).toContain("tool_removed");
    expect(summary).toContain("reply_divergence");
  });
});
