import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../industry";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import {
  CASE_LIBRARY,
  CONTROL_CATALOG,
  casesForSector,
  casesForSodRules,
  observedLossRange,
  sectorForIndustry,
} from "./index";

describe("case library integrity", () => {
  const ruleIds = new Set(CONFLICT_RULES.map((r) => r.id));

  it("has unique ids, a source URL, and at least one real SoD rule per case", () => {
    const seen = new Set<string>();
    for (const c of CASE_LIBRARY) {
      expect(seen.has(c.id), `duplicate ${c.id}`).toBe(false);
      seen.add(c.id);
      expect(c.source.url, c.id).toMatch(/^https:\/\//);
      expect(c.sodRuleIds.length, `${c.id} cites no rule`).toBeGreaterThan(0);
      for (const r of c.sodRuleIds) expect(ruleIds.has(r), `${c.id} cites ${r}`).toBe(true);
      for (const w of c.wouldHaveCaughtIt) {
        expect(CONTROL_CATALOG[w.control], `${c.id}: ${w.control}`).toBeDefined();
      }
      if (c.lossUsd === 0) expect(c.caveat, `${c.id} has no loss and no caveat`).toBeTruthy();
    }
  });

  it("backs every conflict rule with at least one prosecuted case", () => {
    for (const rule of CONFLICT_RULES) {
      expect(casesForSodRules([rule.id]).length, rule.id).toBeGreaterThan(0);
    }
  });

  it("gives every industry a sector with real cases", () => {
    for (const { id } of INDUSTRIES) {
      expect(casesForSector(sectorForIndustry(id)).length, id).toBeGreaterThan(0);
    }
  });
});

describe("observedLossRange", () => {
  it("ignores placeholder zero losses and returns null with nothing to measure", () => {
    expect(observedLossRange([])).toBeNull();
    const withZero = CASE_LIBRARY.filter((c) => c.lossUsd > 0).slice(0, 3);
    const zero = { ...withZero[0], id: "zero", lossUsd: 0 };
    const r = observedLossRange([...withZero, zero])!;
    expect(r.n).toBe(3);
    expect(r.low).toBeGreaterThan(0);
    expect(r.low).toBeLessThanOrEqual(r.median);
    expect(r.median).toBeLessThanOrEqual(r.high);
  });

  it("takes the middle value of an odd list and the mean of the middle pair of an even one", () => {
    const mk = (n: number) => ({ ...CASE_LIBRARY[0], id: `c${n}`, lossUsd: n });
    expect(observedLossRange([mk(30), mk(10), mk(20)])!.median).toBe(20);
    expect(observedLossRange([mk(40), mk(10), mk(20), mk(30)])!.median).toBe(25);
  });
});
