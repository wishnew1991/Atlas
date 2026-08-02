import {
  classifyMemoryIntentHeuristic,
  scoreMemoryIntent,
} from "../src/lib/atlas/intent/memory-intent-core.ts";

const cases = [
  ["suggest something to eat", "recommendation"],
  ["What should I eat tonight?", "recommendation"],
  ["Recommend a place to travel", "recommendation"],
  ["Pick a hotel for me", "recommendation"],
  ["Surprise me", "recommendation"],
  ["Where should I go this weekend?", "recommendation"],
  ["Order chicken biryani", "execution"],
  ["Book this flight", "execution"],
  ["Reserve this hotel", "execution"],
  ["I'm hungry", "ambiguous"],
  ["I want to go somewhere", "ambiguous"],
  ["hi how are you", "conversational"],
  ["explain how useEffect works", "conversational"],
  ["suggest pasta and order it", "hybrid"],
];

let failed = 0;
for (const [msg, expected] of cases) {
  const intent = classifyMemoryIntentHeuristic(msg);
  if (intent.kind !== expected) {
    console.error("FAIL", msg, "→", intent.kind, intent.reason, scoreMemoryIntent(msg));
    failed += 1;
  } else {
    console.log("ok", msg, "→", intent.kind);
  }
}

if (failed) {
  console.error(`${failed} intent cases failed`);
  process.exit(1);
}
console.log("all passed");
