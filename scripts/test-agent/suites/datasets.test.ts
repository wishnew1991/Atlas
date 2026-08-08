import { describe, it, expect } from "vitest";
import type { ConversationDataset } from "../replay/types";

import happyPath from "../datasets/conversations/food/happy-path.json";
import productSearch from "../datasets/conversations/shopping/product-search.json";
import flightSearch from "../datasets/conversations/travel/flight-search.json";
import bookCab from "../datasets/conversations/rides/book-cab.json";
import scheduleDentist from "../datasets/conversations/appointments/schedule-dentist.json";
import mcpTimeout from "../datasets/conversations/regressions/mcp-timeout-recovery.json";
import approvalRejection from "../datasets/conversations/regressions/approval-rejection.json";
import foodThenShopping from "../datasets/conversations/multi-capability/food-then-shopping.json";

const datasets: ConversationDataset[] = [
  happyPath as ConversationDataset,
  productSearch as ConversationDataset,
  flightSearch as ConversationDataset,
  bookCab as ConversationDataset,
  scheduleDentist as ConversationDataset,
  mcpTimeout as ConversationDataset,
  approvalRejection as ConversationDataset,
  foodThenShopping as ConversationDataset,
];

describe("Golden Datasets — Structure Validation", () => {
  // Each dataset must have valid structure
  for (const ds of datasets) {
    it(`"${ds.name}" has valid structure`, () => {
      expect(ds.name).toBeTruthy();
      expect(ds.turns).toBeInstanceOf(Array);
      expect(ds.turns.length).toBeGreaterThanOrEqual(2);

      for (const turn of ds.turns) {
        expect(turn.user).toBeTruthy();
        expect(typeof turn.user).toBe("string");
      }
    });
  }

  it("all datasets have unique names", () => {
    const names = datasets.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("Golden Datasets — Domain Coverage", () => {
  const domains = new Set(datasets.map((d) => d.domain));

  it("covers food domain", () => expect(domains.has("food")).toBe(true));
  it("covers shopping domain", () => expect(domains.has("shopping")).toBe(true));
  it("covers travel domain", () => expect(domains.has("travel")).toBe(true));
  it("covers rides domain", () => expect(domains.has("rides")).toBe(true));
  it("covers appointments domain", () => expect(domains.has("appointments")).toBe(true));
});

describe("Golden Datasets — Expectation Coverage", () => {
  const allTurns = datasets.flatMap((d) => d.turns);
  const withExpect = allTurns.filter((t) => t.expect);
  const withFault = allTurns.filter((t) => t.injectFault || t.clearFaults);

  it(`${withExpect.length} of ${allTurns.length} turns have expectations`, () => {
    expect(withExpect.length).toBeGreaterThan(0);
  });

  it(`${withFault.length} turns have fault injection`, () => {
    expect(withFault.length).toBeGreaterThan(0);
  });
});

describe("Golden Datasets — Snapshots", () => {
  for (const ds of datasets) {
    it(`"${ds.name}" snapshot`, () => {
      const summary = {
        name: ds.name,
        domain: ds.domain,
        turns: ds.turns.length,
        withExpectations: ds.turns.filter((t) => t.expect).length,
        withFaults: ds.turns.filter((t) => t.injectFault || t.clearFaults).length,
      };
      expect(summary).toMatchSnapshot();
    });
  }
});
