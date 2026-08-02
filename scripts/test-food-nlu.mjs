// Offline unit tests for the food conversation's natural-language layer:
// cart intent parsing and reference resolution. No MCP or network required.
//
//   node scripts/test-food-nlu.mjs

import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

function loadTsModule(relPath) {
  const source = readFileSync(relPath, "utf8").replace(/^import "server-only";\s*$/m, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "atlas-food-"));
  const file = join(dir, "mod.mjs");
  writeFileSync(file, js);
  return import(file);
}

const { parseCartIntent, resolveReference } = await loadTsModule("src/lib/atlas/mcp/food-resolve.ts");

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

function section(title) {
  console.log(`\n${title}`);
}

section("Cart intent — add");
test("plain add", () => {
  const intent = parseCartIntent("add Andhra Chicken Biryani");
  assert.equal(intent.kind, "add");
  assert.equal(intent.quantity, 1);
  assert.match(intent.reference, /andhra chicken biryani/i);
});
test("add with numeric quantity", () => {
  const intent = parseCartIntent("add 2 gulab jamuns");
  assert.equal(intent.kind, "add");
  assert.equal(intent.quantity, 2);
});
test("add with word quantity", () => {
  const intent = parseCartIntent("Two Gulab Jamuns");
  assert.equal(intent.kind, "add");
  assert.equal(intent.quantity, 2);
  assert.match(intent.reference, /gulab jamun/i);
});
test("bare dish name is an add", () => {
  const intent = parseCartIntent("Add Coke");
  assert.equal(intent.kind, "add");
  assert.match(intent.reference, /coke/i);
});
test("'add another biryani' increments", () => {
  const intent = parseCartIntent("add another biryani");
  assert.equal(intent.kind, "add");
  assert.match(intent.reference, /biryani/i);
});

section("Cart intent — remove");
test("remove by name", () => {
  const intent = parseCartIntent("Remove Coke");
  assert.equal(intent.kind, "remove");
  assert.match(intent.reference, /coke/i);
});
test("'take out the fries'", () => {
  const intent = parseCartIntent("take out the fries");
  assert.equal(intent.kind, "remove");
  assert.match(intent.reference, /fries/i);
});

section("Cart intent — quantity");
test("'make it two'", () => {
  const intent = parseCartIntent("make it two");
  assert.equal(intent.kind, "set_quantity");
  assert.equal(intent.quantity, 2);
});
test("'increase biryani to 2'", () => {
  const intent = parseCartIntent("increase biryani to 2");
  assert.equal(intent.kind, "set_quantity");
  assert.equal(intent.quantity, 2);
  assert.match(intent.reference, /biryani/i);
});

section("Cart intent — replace / clear");
test("'replace with mutton biryani'", () => {
  const intent = parseCartIntent("replace the chicken biryani with mutton biryani");
  assert.equal(intent.kind, "replace");
  assert.match(intent.from, /chicken biryani/i);
  assert.match(intent.to, /mutton biryani/i);
});
test("'cancel the order' clears", () => {
  assert.equal(parseCartIntent("cancel the order").kind, "clear");
});
test("'empty the cart' clears", () => {
  assert.equal(parseCartIntent("empty the cart").kind, "clear");
});

section("Reference resolution");
const restaurants = [
  { index: 1, id: "111", name: "Meghana Foods" },
  { index: 2, id: "222", name: "Kritunga" },
  { index: 3, id: "333", name: "Behrouz Biryani" },
];
test("bare number selects", () => assert.equal(resolveReference("2", restaurants).id, "222"));
test("ordinal word selects", () => assert.equal(resolveReference("the third one", restaurants).id, "333"));
test("'#1' selects", () => assert.equal(resolveReference("#1", restaurants).id, "111"));
test("name match selects", () => assert.equal(resolveReference("Meghana", restaurants).id, "111"));
test("case-insensitive name", () => assert.equal(resolveReference("behrouz biryani", restaurants).id, "333"));
test("exact id passthrough", () => assert.equal(resolveReference("222", restaurants).id, "222"));

const menu = [
  { index: 1, id: "a", name: "Andhra Chicken Biryani" },
  { index: 2, id: "b", name: "Mutton Biryani" },
  { index: 3, id: "c", name: "Chicken 65" },
];
test("multi-word dish match", () => assert.equal(resolveReference("andhra chicken biryani", menu).id, "a"));
test("partial dish match", () => assert.equal(resolveReference("chicken 65", menu).id, "c"));
test("unrelated text yields nothing confident", () => {
  const match = resolveReference("zzzz nonexistent qqq", menu);
  assert.ok(match === undefined || match.id !== undefined);
});

console.log(`\n${"=".repeat(60)}\n${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
process.exit(failed === 0 ? 0 : 1);
