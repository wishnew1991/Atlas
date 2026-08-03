// Offline unit tests for Routines learning + label matching.
// No Prisma, MCP, or network required — the pure module is loaded directly.
//
//   node scripts/test-routines.mjs

import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

function loadTsModule(relPath) {
  const source = readFileSync(relPath, "utf8")
    .replace(/^import "server-only";\s*$/m, "")
    .replace(/from "server-only";?\s*$/m, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "atlas-routines-"));
  const file = join(dir, "mod.mjs");
  writeFileSync(file, js);
  return import(file);
}

const {
  confidenceForCount,
  isWorthSuggesting,
  shouldSuggest,
  fingerprintOf,
  fingerprintOfEntities,
  labelFromEntities,
  matchesLabel,
  pickAction,
  OBSERVE_THRESHOLD,
} = await loadTsModule("src/lib/atlas/routines/learning.ts");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  FAIL  ${name}\n        ${error.message}`);
    failed += 1;
  }
}

console.log("\nRoutines — confidence & suggestion gating");

test("confidence grows with count and caps at threshold", () => {
  assert.equal(confidenceForCount(0), 0);
  assert.equal(confidenceForCount(1), 0.25 + 0.0825); // 0.3325
  assert.ok(confidenceForCount(2) > confidenceForCount(1));
  assert.ok(confidenceForCount(3) > confidenceForCount(2));
  assert.equal(confidenceForCount(50), 0.9); // capped
});

test("below threshold is not worth suggesting", () => {
  assert.equal(isWorthSuggesting(OBSERVE_THRESHOLD - 1), false);
  assert.equal(isWorthSuggesting(OBSERVE_THRESHOLD), true);
});

test("shouldSuggest honors declinedEver and non-observing state", () => {
  assert.equal(
    shouldSuggest({ count: OBSERVE_THRESHOLD, state: "observing", declinedEver: false }),
    true
  );
  assert.equal(
    shouldSuggest({ count: 1, state: "observing", declinedEver: false }),
    false
  );
  assert.equal(
    shouldSuggest({ count: OBSERVE_THRESHOLD, state: "suggested", declinedEver: false }),
    false
  );
  assert.equal(
    shouldSuggest({ count: OBSERVE_THRESHOLD, state: "observing", declinedEver: true }),
    false
  );
});

console.log("\n—fingerprints");

test("fingerprint is stable for equal payloads", () => {
  assert.equal(fingerprintOf({ a: 1, b: 2 }), fingerprintOf({ b: 2, a: 1 }));
});

test("fingerprint differs for different payloads", () => {
  assert.notEqual(fingerprintOf({ dish: "biryani" }), fingerprintOf({ dish: "pizza" }));
});

console.log("\n—entity-anchored identity");

test("entity fingerprint is stable irrespective of entity order", () => {
  const a = [
    { kind: "dish", value: "biryani" },
    { kind: "restaurant", value: "Meghana" },
  ];
  const b = [
    { kind: "restaurant", value: "meghana" },
    { kind: "dish", value: "BIRYANI" },
  ];
  assert.equal(fingerprintOfEntities(a), fingerprintOfEntities(b));
});

test("entity fingerprint ignores entities that differ", () => {
  assert.notEqual(
    fingerprintOfEntities([{ kind: "dish", value: "biryani" }]),
    fingerprintOfEntities([{ kind: "dish", value: "pizza" }])
  );
});

test("entity fingerprint discriminates on kind", () => {
  assert.notEqual(
    fingerprintOfEntities([{ kind: "dish", value: "dominos" }]),
    fingerprintOfEntities([{ kind: "restaurant", value: "dominos" }])
  );
});

test("label from food entities reads naturally", () => {
  assert.equal(
    labelFromEntities(
      "food",
      [
        { kind: "dish", value: "chicken biryani" },
        { kind: "restaurant", value: "Meghana Foods" },
      ],
      "my usual"
    ),
    "usual chicken biryani from Meghana Foods"
  );
});

console.log("\n—label matching");

const actions = [
  { id: "1", label: "usual chicken biryani from Meghana Foods" },
  { id: "2", label: "regular home-drop ride" },
  { id: "3", label: "usual dal tadka" },
];

test("exact-case-insensitive hit returns that action", () => {
  const hit = pickAction(actions, "USUAL CHICKEN BIRYANI FROM MEGHANA FOODS");
  assert.equal(hit?.id, "1");
});

test("substring query resolves to its action", () => {
  const hit = pickAction(actions, "my usual");
  assert.equal(hit?.id, "1"); // first substring ("usual ...") match
});

test("queries the word 'usual' prefer the first saved usual", () => {
  const hit = pickAction(actions, "order my usual");
  assert.equal(hit?.id, "1");
});

test("rides query resolves to the ride routine", () => {
  const hit = pickAction(actions, "book my regular ride");
  assert.equal(hit?.id, "2");
});

test("unknown query returns null", () => {
  assert.equal(pickAction(actions, "something brand new"), null);
});

test("empty query returns the most recently-saved action", () => {
  const hit = pickAction(actions, "");
  assert.equal(hit?.id, actions[0].id);
});

test("matchesLabel is case/whitespace-insensitive", () => {
  assert.equal(matchesLabel("Usual Biryani", "  usual  "), true);
  assert.equal(matchesLabel("Usual Biryani", "pizza"), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);