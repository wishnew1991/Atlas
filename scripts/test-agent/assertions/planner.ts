import type { Capability, Plan } from "@/lib/atlas/planner/planner";

export function assertCapabilitiesContain(result: Plan, expected: Capability): void {
  if (!result.capabilities.includes(expected)) {
    throw new Error(
      `Expected capabilities to include "${expected}" but got ` +
        `[${result.capabilities.join(", ")}]. Reason: ${result.reason}`
    );
  }
}

export function assertCapabilitiesDoNotContain(result: Plan, unexpected: Capability): void {
  if (result.capabilities.includes(unexpected)) {
    throw new Error(
      `Expected capabilities to NOT include "${unexpected}" but it was present in ` +
        `[${result.capabilities.join(", ")}]. Reason: ${result.reason}`
    );
  }
}

export function assertCapabilitiesEqual(result: Plan, expected: Capability[]): void {
  const sorted = [...result.capabilities].sort();
  const expectedSorted = [...expected].sort();
  const sortedStr = JSON.stringify(sorted);
  const expectedStr = JSON.stringify(expectedSorted);
  if (sortedStr !== expectedStr) {
    throw new Error(
      `Expected capabilities [${expected.join(", ")}] but got [${result.capabilities.join(", ")}]. ` +
        `Reason: ${result.reason}`
    );
  }
}

export function assertContinuation(result: Plan, isContinuation: boolean): void {
  if (result.isContinuation !== isContinuation) {
    throw new Error(
      `Expected isContinuation to be ${isContinuation} but got ${result.isContinuation}. ` +
        `Reason: ${result.reason}`
    );
  }
}

export function assertNotContinuation(result: Plan): void {
  assertContinuation(result, false);
}

export function assertIsContinuation(result: Plan): void {
  assertContinuation(result, true);
}
