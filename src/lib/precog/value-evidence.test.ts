import { describe, expect, it } from "vitest";
import {
  MAX_VALUE_EVIDENCE_ITEMS,
  normalizeValueEvidence,
  parseValueEvidence,
  serializeValueEvidence,
  summarizeValueEvidence,
  type ValueEvidence,
} from "./value-evidence";

const asOf = new Date("2026-09-20T00:00:00.000Z");
const base: ValueEvidence = {
  id: "r1",
  kind: "recovery",
  description: "Duplicate supplier payment recovered",
  source: "AP credit memo 118",
  amount: 1_200,
  observedAt: "2026-08-01",
  verified: true,
};

describe("verified observations", () => {
  it("counts a verified, sourced, dated item inside the window", () => {
    expect(summarizeValueEvidence([base], asOf)).toMatchObject({
      verified: 1,
      recoveries: 1_200,
      score: 100,
    });
  });

  it("does not count an item whose date is missing, invalid, in the future, or older than a year", () => {
    const undated = normalizeValueEvidence([{ ...base, observedAt: "2026-99-99" }])[0];
    expect(undated.verified).toBe(true);
    expect(undated.observedAt).toBe("");
    for (const item of [
      undated,
      { ...base, observedAt: "" },
      { ...base, observedAt: "2026-09-21" },
      { ...base, observedAt: "2025-09-01" },
    ]) {
      expect(summarizeValueEvidence([item], asOf)).toMatchObject({
        verified: 0,
        recoveries: 0,
        score: 0,
      });
    }
  });

  it("counts totals and readiness on the same rule", () => {
    const items: ValueEvidence[] = [
      base,
      { ...base, id: "r2", observedAt: "2026-09-21" },
      { ...base, id: "t1", kind: "time", amount: 40, observedAt: "" },
      { ...base, id: "t2", kind: "time", amount: 12 },
    ];
    expect(summarizeValueEvidence(items, asOf)).toEqual({
      total: 4,
      verified: 2,
      recoveries: 1_200,
      hours: 12,
      unsourced: 0,
      stale: 1,
      future: 1,
      score: 50,
    });
  });
});

describe("register size", () => {
  const many = (n: number): ValueEvidence[] =>
    Array.from({ length: n }, (_, i) => ({ ...base, id: `r${i}`, description: `Item ${i}` }));

  it("keeps a register of 120 items through export and import", () => {
    const items = normalizeValueEvidence(many(120));
    expect(items).toHaveLength(120);
    expect(parseValueEvidence(serializeValueEvidence(items, asOf))).toHaveLength(120);
  });

  it("refuses an import larger than the register holds instead of cutting it short", () => {
    const envelope = JSON.stringify({
      version: 1,
      evidence: many(MAX_VALUE_EVIDENCE_ITEMS + 1).map((item) => ({ id: item.id })),
    });
    expect(() => parseValueEvidence(envelope)).toThrow(/Precog imported nothing/);
  });
});
