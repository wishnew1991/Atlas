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

const work = mkdtempSync(join(tmpdir(), "atlas-test-"));

function loadTsModule(srcPath, outName) {
  const raw = readFileSync(srcPath, "utf8")
    .replace(/^import "server-only";?\s*$/gm, "")
    .replace(/^import type .*$/gm, "")
    .replace(
      /^import \{ classifyCapabilities \} from ["']@\/lib\/atlas\/planner\/classifier["'];?\s*$/gm,
      `async function classifyCapabilities() {
  return { capabilities: ["web"], confidence: 0, reason: "stub", domain: null };
}`
    )
    .replace(/^import .+ from ["']@\/.*["'];?\s*$/gm, "");

  const js = ts.transpileModule(raw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

  const out = join(work, outName);
  writeFileSync(out, js);
  return import(out);
}

const state = await loadTsModule("src/lib/atlas/conversation/state.ts", "state.mjs");

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

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}
const section = (t) => console.log(`\n${t}`);

section("Scenario 1 — I am hungry -> chicken biriyani -> yes");
{
  const history = [];
  const turns = ["I am hungry", "chicken biriyani", "yes"];
  const seen = [];
  for (const t of turns) {
    const s = await state.resolveConversationState(t, history);
    seen.push(s);
    history.push({ role: "user", text: t });
    history.push({ role: "assistant", text: "Would you like me to order it?" });
  }

  await test("turn 1 'I am hungry' -> food capability", () =>
    assert.deepEqual(seen[0].capabilities, ["food"]));
  await test("turn 2 'chicken biriyani' -> food capability", () =>
    assert.deepEqual(seen[1].capabilities, ["food"]));
  await test("turn 3 'yes' -> food capability PRESERVED (was ['none'])", () =>
    assert.deepEqual(seen[2].capabilities, ["food"]));
  await test("turn 3 'yes' marked as continuation", () =>
    assert.equal(seen[2].isContinuation, true));
  await test("turn 3 domain resolves to food", () => assert.equal(seen[2].domain, "food"));
  await test("turn 3 exposes food ordering tools to the LLM", () =>
    assert.ok(toolsFor(seen[2].capabilities).includes("food_find_restaurants")));
  await test("turn 3 tool_choice would be 'auto' (tools non-empty)", () =>
    assert.ok(toolsFor(seen[2].capabilities).length > 0));
}

section("Scenario 2 — Book a flight -> yes");
{
  const history = [
    { role: "user", text: "Book a flight" },
    { role: "assistant", text: "Shall I search flights for you?" },
  ];
  const s = await state.resolveConversationState("yes", history);
  await test("travel capability remains active", () => assert.ok(s.capabilities.includes("travel")));
  await test("domain is travel", () => assert.equal(s.domain, "travel"));
  await test("atlas_search exposed", () => assert.ok(toolsFor(s.capabilities).includes("atlas_search")));
}

section("Scenario 3 — Schedule a meeting -> tomorrow works -> yes");
{
  const history = [
    { role: "user", text: "Schedule a meeting" },
    { role: "assistant", text: "What day works for you?" },
  ];
  const s1 = await state.resolveConversationState("tomorrow works", history);
  await test("'tomorrow works' keeps calendar capability", () =>
    assert.ok(s1.capabilities.includes("calendar")));
  await test("'tomorrow works' is a continuation", () => assert.equal(s1.isContinuation, true));

  history.push({ role: "user", text: "tomorrow works" });
  history.push({ role: "assistant", text: "Great — 3pm tomorrow. Confirm?" });
  const s2 = await state.resolveConversationState("yes", history);
  await test("'yes' keeps calendar capability", () => assert.ok(s2.capabilities.includes("calendar")));
  await test("calendar maps to appointments domain", () => assert.equal(s2.domain, "appointments"));
}

section("Scenario 4 — raw tool JSON must never reach the client");
{
  const leaks = [
    '{"tool":"atlas_search","arguments":{"request":"chicken biryani"}}',
    '{\n  "tool": "food_find_restaurants",\n  "arguments": {\n    "dish": "chicken biryani"\n  }\n}',
    '{"name":"atlas_search","parameters":{"query":"biryani"}}',
    'Sure!\n{"tool":"food_find_restaurants","arguments":{"dish":"x"}}',
  ];
  for (const [i, c] of leaks.entries()) {
    await test(`payload #${i + 1} detected as tool JSON`, () => assert.equal(looksLikeToolPayload(c), true));
  }

  const prose = [
    "I'm here to help! What would you like to eat?",
    "Here are 3 biryani places near you: 1. Paradise 2. Bawarchi 3. Shah Ghouse",
    "Your order is ready for approval — { tap confirm } to proceed.",
    "",
  ];
  for (const [i, c] of prose.entries()) {
    await test(`prose #${i + 1} NOT flagged as tool JSON`, () => assert.equal(looksLikeToolPayload(c), false));
  }

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

  await test("streamed JSON payload is fully suppressed", () => {
    const r = simulateStream(['{"tool":', '"atlas_search",', '"arguments":{"request":"biryani"}}']);
    assert.equal(r.suppressed, true);
    assert.equal(r.sse, "");
  });

  await test("streamed prose passes through unchanged", () => {
    const chunks = ["Here are ", "3 biryani ", "places near you."];
    const r = simulateStream(chunks);
    assert.equal(r.suppressed, false);
    assert.equal(r.sse, chunks.join(""));
  });

  await test("SSE output never contains a '\"tool\":' key", () => {
    const r = simulateStream(['{"tool":"food_find_restaurants","arguments":{}}']);
    assert.ok(!r.sse.includes('"tool"'));
  });
}

section("Regression guards");
{
  await test("bare 'yes' with NO history yields no capability (no false positive)", async () => {
    const s = await state.resolveConversationState("yes", []);
    assert.deepEqual(s.capabilities, []);
  });
  await test("new topic overrides inherited context", async () => {
    const s = await state.resolveConversationState("book a flight to Delhi", [
      { role: "user", text: "I am hungry" },
    ]);
    assert.ok(s.capabilities.includes("travel"));
    assert.equal(s.isContinuation, false);
  });
  await test("small talk stays non-actionable", async () => {
    const s = await state.resolveConversationState("who are you", []);
    assert.deepEqual(s.capabilities, []);
  });
  await test("planner + domain agree (single source of truth)", async () => {
    const h = [{ role: "user", text: "chicken biriyani" }];
    const s = await state.resolveConversationState("yes", h);
    assert.equal(s.domain, "food");
    assert.ok(s.capabilities.includes("food"));
  });
  await test("'go ahead' resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("go ahead"), true));
  await test("'order it' resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("order it"), true));
  await test("'book it' resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("book it"), true));
  await test("'that one' resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("that one"), true));
  await test("'2' (option pick) resolves as continuation", () =>
    assert.equal(state.isContinuationUtterance("2"), true));
  await test("'order me a pizza' is NOT a bare continuation (has its own topic)", () =>
    assert.equal(state.isContinuationUtterance("order me a pizza"), false));
}

section("inferDomain — current message precedence");
{
  const { inferDomain } = await loadTsModule("src/lib/atlas/domain.ts", "domain.mjs");

  await test("bare 'yes' with food history resolves to food", () => {
    const history = [
      { role: "user", text: "I am hungry" },
      { role: "assistant", text: "What would you like?" },
      { role: "user", text: "chicken biryani" },
    ];
    assert.equal(inferDomain("yes", history), "food");
  });

  await test("'that one' with food history resolves to food", () => {
    const history = [
      { role: "user", text: "show me biryani places" },
      { role: "assistant", text: "Here are 3 options" },
    ];
    assert.equal(inferDomain("that one", history), "food");
  });

  await test("topic switch overrides history — 'book a flight' after food → travel", () => {
    const history = [
      { role: "user", text: "I am hungry" },
      { role: "assistant", text: "What would you like?" },
    ];
    assert.equal(inferDomain("book a flight to Delhi", history), "travel");
  });

  await test("topic switch overrides history — 'schedule a meeting' after food → appointments", () => {
    const history = [
      { role: "user", text: "order me a pizza" },
    ];
    assert.equal(inferDomain("schedule a meeting with the team", history), "appointments");
  });

  await test("current message with no history returns general", () => {
    assert.equal(inferDomain("hello"), "general");
  });

  await test("no history + no domain keyword returns general", () => {
    assert.equal(inferDomain("what time is it", []), "general");
  });

  await test("history older than 6 messages is ignored", () => {
    // 10 biryani messages + 8 non-domain messages = 18 total
    // Last 6 items are all "something else" / "ok" — no domain keyword
    const history = [];
    for (let i = 0; i < 10; i++) {
      history.push({ role: "user", text: "I want biryani" });
      history.push({ role: "assistant", text: "ok" });
    }
    for (let i = 0; i < 4; i++) {
      history.push({ role: "user", text: "something else" });
      history.push({ role: "assistant", text: "ok" });
    }
    assert.equal(inferDomain("yes", history), "general");
  });

  await test("history within 6 messages is used", () => {
    const history = [
      { role: "user", text: "I want biryani" },
      { role: "assistant", text: "ok" },
      { role: "user", text: "something else" },
      { role: "assistant", text: "ok" },
    ];
    // Last 6 = all 4 items — includes "biryani" → food
    assert.equal(inferDomain("yes", history), "food");
  });

  await test("food keyword in current message always wins regardless of history", () => {
    const history = [
      { role: "user", text: "book a flight" },
    ];
    assert.equal(inferDomain("order biryani", history), "food");
  });
}

rmSync(work, { recursive: true, force: true });
console.log(`\n${"=".repeat(60)}\n${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
process.exit(failed === 0 ? 0 : 1);
