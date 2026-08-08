import type { RetrievedMemory, MemoryRecord, MemoryType } from "@/lib/atlas/memory/service";

export function assertMemoryCount(memories: MemoryRecord[], expected: number): void {
  if (memories.length !== expected) {
    throw new Error(
      `Expected ${expected} memories but got ${memories.length}`
    );
  }
}

export function assertContainsText(memories: MemoryRecord[], text: string): void {
  const texts = memories.map((m) => m.text);
  if (!texts.includes(text)) {
    throw new Error(
      `Expected memories to contain "${text}". Found: [${texts.join(", ")}]`
    );
  }
}

export function assertDoesNotContainText(memories: MemoryRecord[], text: string): void {
  const texts = memories.map((m) => m.text);
  if (texts.includes(text)) {
    throw new Error(
      `Expected memories to NOT contain "${text}"`
    );
  }
}

export function assertRankingOrder(
  retrieved: RetrievedMemory[],
  expectedOrder: string[]
): void {
  const texts = retrieved.map((r) => r.text);
  for (let i = 0; i < expectedOrder.length; i++) {
    if (i >= texts.length) {
      throw new Error(
        `Expected "${expectedOrder[i]}" at position ${i} but list ended`
      );
    }
    if (texts[i] !== expectedOrder[i]) {
      throw new Error(
        `Expected "${expectedOrder[i]}" at position ${i} but got "${texts[i]}"`
      );
    }
  }
}

export function assertHigherScoredFirst(
  retrieved: RetrievedMemory[],
  higher: string,
  lower: string
): void {
  const higherIdx = retrieved.findIndex((r) => r.text === higher);
  const lowerIdx = retrieved.findIndex((r) => r.text === lower);
  if (higherIdx === -1) throw new Error(`"${higher}" not found in results`);
  if (lowerIdx === -1) throw new Error(`"${lower}" not found in results`);
  if (higherIdx >= lowerIdx) {
    throw new Error(
      `Expected "${higher}" (pos ${higherIdx}) before "${lower}" (pos ${lowerIdx})` +
        ` — scores: ${retrieved[higherIdx].score} vs ${retrieved[lowerIdx].score}`
    );
  }
}

export function assertEmptyResult(retrieved: unknown[]): void {
  if (retrieved.length > 0) {
    throw new Error(
      `Expected empty result but got ${retrieved.length} items: [${(retrieved as RetrievedMemory[]).map((r) => (r as RetrievedMemory).text).join(", ")}]`
    );
  }
}

export function assertScoreAbove(retrieved: RetrievedMemory[], text: string, min: number): void {
  const mem = retrieved.find((r) => r.text === text);
  if (!mem) throw new Error(`"${text}" not found in results`);
  if (mem.score < min) {
    throw new Error(
      `Expected "${text}" score >= ${min} but got ${mem.score.toFixed(3)}`
    );
  }
}

export function assertConfidence(memory: MemoryRecord | null, min: number): void {
  if (!memory) throw new Error("Memory is null");
  if (memory.confidence < min) {
    throw new Error(
      `Expected confidence >= ${min} but got ${memory.confidence}`
    );
  }
}

export function assertImportance(memory: MemoryRecord | null, expected: number): void {
  if (!memory) throw new Error("Memory is null");
  if (memory.importance !== expected) {
    throw new Error(
      `Expected importance ${expected} but got ${memory.importance}`
    );
  }
}

export function assertMemoryType(memory: MemoryRecord | null, expected: MemoryType): void {
  if (!memory) throw new Error("Memory is null");
  if (memory.type !== expected) {
    throw new Error(
      `Expected type "${expected}" but got "${memory.type}"`
    );
  }
}

export function assertArchived(memory: MemoryRecord | null): void {
  if (!memory) throw new Error("Memory is null");
  if (memory.status !== "archived") {
    throw new Error(
      `Expected status "archived" but got "${memory.status}"`
    );
  }
}

export function assertActive(memory: MemoryRecord | null): void {
  if (!memory) throw new Error("Memory is null");
  if (memory.status !== "active") {
    throw new Error(
      `Expected status "active" but got "${memory.status}"`
    );
  }
}
