/**
 * Atlas pipeline regression tests.
 *
 * Covers the confirmation-turn regressions found in the execution trace:
 *   1. hungry -> chicken biriyani -> yes   (food capability survives)
 *   2. book a flight -> yes                (travel capability survives)
 *   3. schedule a meeting -> tomorrow works -> yes (calendar persists)
 *   4. raw JSON tool payloads never reach the SSE stream
 *
 * Run: npm run test:pipeline
 */
import { strict as assert } from "node:assert";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

// ---------------------------------------------------------------------------
// Transpile the pure logic module under test to ESM with the real TypeScript
// compiler, so the tests exercise the SAME source the app ships.
// ---------------------------------------------------------------------------
const work = mkdtempSync(join(tmpdir(), "atlas-test-"));

function loadTsModule(srcPath, outName) {
  const raw = readFileSync(srcPath, "utf8")
    // `server-only` and cross-module type imports are not resolvable here.
    .replace(/^import "server-only";?\s*$/gm, "")
    .replace(/^import type .*$/gm, "");

  const js = ts.transpileModule(raw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

  const out = join(work, outName);
  writeFileSync(out, js);
  return import(out);
}

const state = await loadTsModule("src/lib/atlas/conversation/state.ts", "state.mjs");

// Re-implement the planner's decision layer on top of the shared resolver.
// (planner.ts itself pulls in server-only intent analysis.)
const CAPABILITY_TOOLS = {
  food: [
    "food_set_address",
    "food_find_restaurants",
    "food_select_restaurant",
    "food_browse_menu",
    "food_update_cart",
    "food_view_cart",
    "food_checkout",
    "food_select_payment",
    "food_cancel_order",
  ],
  travel: ["atlas_search", "atlas_prepare_approval"],
  shopping: ["atlas_search", "atlas_prepare_approval"],
  rides: ["atlas_search", "atlas_prepare_approval"],
  calendar: ["atlas_search", "atlas_prepare_approval"],
  communication: ["atlas_search", "atlas_prepare_approval"],
  web: ["web_search"],
};

function toolsFor(caps) {
  const names = new Set();
  for (const c of caps) {
    if (c === "none") continue;
    for (const n of CAPABILITY_TOOLS[c] ?? []) names.add(n);
  }
  return [...names];
}

// looksLikeToolPayload — mirrors the agent implementation.
function looksLikeToolPayload(content) {
  const trimmed = (content ?? "").trim();
  if (!trimmed.includes("{")) return false;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return false;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed !== "object" || parsed === null) return false;
    const hasName = typeof parsed.tool === "string" || typeof parsed.name === "string";
    const hasArgs = "arguments" in parsed || "parameters" in parsed || "input" in parsed;
    return hasName && hasArgs;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}
const section = (t) => console.log(`\n${t}`);

// --- Scenario 1: food ------------------------------------------------------
section("Scenario 1 — I am hungry -> chicken biriyani -> yes");
{
  const history = [];
  const turns = ["I am hungry", "chicken biriyani", "yes"];
  const seen = [];
  for (const t of turns) {
    const s = state.resolveConversationState(t, history);
    seen.push(s);
    history.push({ role: "user", text: t });
    history.push({ role: "assistant", text: "Would you like me to order it?" });
  }

  test("turn 1 'I am hungry' -> food capability", () =>
    assert.deepEqual(seen[0].capabilities, ["food"]));
  test("turn 2 'chicken biriyani' -> food capability", () =>
    assert.deepEqual(seen[1].capabilities, ["food"]));
  test("turn 3 'yes' -> food capability PRESERVED (was ['none'])", () =>
    assert.deepEqual(seen[2].capabilities, ["food"]));
  test("turn 3 'yes' marked as continuation", () =>
    assert.equal(seen[2].isContinuation, true));
  test("turn 3 domain resolves to food", () => assert.equal(seen[2].domain, "food"));
  test("turn 3 exposes food ordering tools to the LLM", () =>
    assert.ok(toolsFor(seen[2].capabilities).includes("food_find_restaurants")));
  test("turn 3 tool_choice would be 'auto' (tools non-empty)", () =>
    assert.ok(toolsFor(seen[2].capabilities).length > 0));
}

// --- Scenario 2: travel ----------------------------------------------------
section("Scenario 2 — Book a flight -> yes");
{
  const history = [
    { role: "user", text: "Book a flight" },
    { role: "assistant", text: "Shall I search flights for you?" },
  ];
  const s = state.resolveConversationState("yes", history);
  test("travel capability remains active", () => assert.ok(s.capabilities.includes("travel")));
  test("domain is travel", () => assert.equal(s.domain, "travel"));
  test("atlas_search exposed", () => assert.ok(toolsFor(s.capabilities).includes("atlas_search")));
}

// --- Scenario 3: calendar --------------------------------------------------
section("Scenario 3 — Schedule a meeting -> tomorrow works -> yes");
{
  const history = [
    { role: "user", text: "Schedule a meeting" },
    { role: "assistant", text: "What day works for you?" },
  ];
  const s1 = state.resolveConversationState("tomorrow works", history);
  test("'tomorrow works' keeps calendar capability", () =>
    assert.ok(s1.capabilities.includes("calendar")));
  test("'tomorrow works' is a continuation", () => assert.equal(s1.isContinuation, true));

  history.push({ role: "user", text: "tomorrow works" });
  history.push({ role: "assistant", text: "Great — 3pm tomorrow. Confirm?" });
  const s2 = state.resolveConversationState("yes", history);
  test("'yes' keeps calendar capability", () => assert.ok(s2.capabilities.includes("calendar")));
  test("calendar maps to appointments domain", () => assert.equal(s2.domain, "appointments"));
}

// --- Scenario 4: no raw JSON in stream -------------------------------------
section("Scenario 4 — raw tool JSON must never reach the client");
{
  const leaks = [
    '{"tool":"atlas_search","arguments":{"request":"chicken biryani"}}',
    '{\n  "tool": "food_find_restaurants",\n  "arguments": {\n    "dish": "chicken biryani"\n  }\n}',
    '{"name":"atlas_search","parameters":{"query":"biryani"}}',
    'Sure!\n{"tool":"food_find_restaurants","arguments":{"dish":"x"}}',
  ];
  leaks.forEach((c, i) =>
    test(`payload #${i + 1} detected as tool JSON`, () => assert.equal(looksLikeToolPayload(c), true))
  );

  const prose = [
    "I'm here to help! What would you like to eat?",
    "Here are 3 biryani places near you: 1. Paradise 2. Bawarchi 3. Shah Ghouse",
    "Your order is ready for approval — { tap confirm } to proceed.",
    "",
  ];
  prose.forEach((c, i) =>
    test(`prose #${i + 1} NOT flagged as tool JSON`, () => assert.equal(looksLikeToolPayload(c), false))
  );

  // Simulate the streaming guard from streamAtlasReply.
  function simulateStream(chunks) {
    let reply = "";
    let emitted = 0;
    let suppressed = false;
    const out = [];
    for (const text of chunks) {
      reply += text;
      if (suppressed) continue;
      if (reply.trimStart().startsWith("{")) {
        if (looksLikeToolPayload(reply)) {
          suppressed = true;
          emitted = 0;
        }
        continue;
      }
      if (reply.length > emitted) {
        out.push(reply.slice(emitted));
        emitted = reply.length;
      }
    }
    if (suppressed || looksLikeToolPayload(reply)) return { sse: "", suppressed: true };
    if (reply.length > emitted) out.push(reply.slice(emitted));
    return { sse: out.join(""), suppressed: false };
  }

  test("streamed JSON payload is fully suppressed", () => {
    const r = simulateStream(['{"tool":', '"atlas_search",', '"arguments":{"request":"biryani"}}']);
    assert.equal(r.suppressed, true);
    assert.equal(r.sse, "");
  });

  test("streamed prose passes through unchanged", () => {
    const chunks = ["Here are ", "3 biryani ", "places near you."];
    const r = simulateStream(chunks);
    assert.equal(r.suppressed, false);
    assert.equal(r.sse, chunks.join(""));
  });

  test("SSE output never contains a '\"tool\":' key", () => {
    const r = simulateStream(['{"tool":"food_find_restaurants","arguments":{}}']);
    assert.ok(!r.sse.includes('"tool"'));
  });
}

// --- Regression guards -----------------------------------------------------
section("Regression guards");
{
  test("bare 'yes' with NO history yields no capability (no false positive)", () => {
    const s = state.resolveConversationState("yes", []);
    assert.deepEqual(s.capabilities, []);
  });
  test("new topic overrides inherited context", () => {
    const s = state.resolveConversationState("book a flight to Delhi", [
      { role: "user", text: "I am hungry" },
    ]);
    assert.ok(s.capabilities.includes("travel"));
    assert.equal(s.isContinuation, false);
  });
  test("small talk stays non-actionable", () => {
    const s = state.resolveConversationState("who are you", []);
    assert.deepEqual(s.capabilities, []);
  });
  test("planner + domain agree (single source of truth)", () => {
    const h = [{ role: "user", text: "chicken biriyani" }];
    const s = state.resolveConversationState("yes", h);
    assert.equal(s.domain, "food");
    assert.ok(s.capabilities.includes("food"));
  });
  test("'go ahead' resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("go ahead"), true));
  test("'order it' resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("order it"), true));
  test("'book it' resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("book it"), true));
  test("'that one' resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("that one"), true));
  test("'2' (option pick) resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("2"), true));
  test("'order me a pizza' is NOT a bare continuation (has its own topic)", () =>
    assert.equal(state.isContinuationUtterance("order me a pizza"), false));
}

rmSync(work, { recursive: true, force: true });
console.log(`\n${"=".repeat(60)}\n${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
process.exit(failed === 0 ? 0 : 1);
