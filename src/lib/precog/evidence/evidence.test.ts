import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../industry";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import {
  CASE_LIBRARY,
  CONTROL_CATALOG,
  casesForSector,
  casesForControl,
  casesForSodRules,
  detectionBreakdown,
  isOwnSector,
  observedLossRange,
  recommendedStepsForRules,
  tenureExamples,
  sectorForIndustry,
  sectorsForIndustry,
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

  it("names every catalog control in at least one prosecuted case", () => {
    for (const id of Object.keys(CONTROL_CATALOG)) {
      expect(casesForControl(id as keyof typeof CONTROL_CATALOG).length, id).toBeGreaterThan(0);
    }
  });

  it("gives every industry a sector with real cases", () => {
    for (const { id } of INDUSTRIES) {
      expect(casesForSector(sectorForIndustry(id)).length, id).toBeGreaterThan(0);
    }
  });

  it("counts medical cases as the dental template's own line of business", () => {
    expect(sectorsForIndustry("dental")).toEqual(["dental", "medical"]);
    expect(sectorForIndustry("dental")).toBe("dental");
    const medical = CASE_LIBRARY.find((c) => c.sector === "medical");
    const retail = CASE_LIBRARY.find((c) => c.sector === "retail");
    expect(medical && isOwnSector(medical, "dental")).toBe(true);
    expect(retail && isOwnSector(retail, "dental")).toBe(false);
    expect(retail && isOwnSector(retail, "retail")).toBe(true);
    for (const { id } of INDUSTRIES) {
      expect(sectorsForIndustry(id).length, id).toBeGreaterThan(0);
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

describe("detectionBreakdown", () => {
  const mk = (n: number, detection: (typeof CASE_LIBRARY)[number]["detection"]) => ({
    ...CASE_LIBRARY[0],
    id: `d${n}`,
    detection,
  });

  it("keeps unknown out of the routes and counts it separately", () => {
    const r = detectionBreakdown([
      mk(1, "owner-review"),
      mk(2, "owner-review"),
      mk(3, "tip"),
      mk(4, "unknown"),
    ]);
    expect(r.n).toBe(4);
    expect(r.known).toBe(3);
    expect(r.unknown).toBe(1);
    expect(r.byRoute).toEqual([
      { route: "owner-review", count: 2 },
      { route: "tip", count: 1 },
    ]);
  });

  it("returns zeros and no routes for an empty list", () => {
    expect(detectionBreakdown([])).toEqual({ n: 0, known: 0, unknown: 0, byRoute: [] });
  });
});

describe("tenureExamples", () => {
  const mk = (n: number, tenureYearsStated?: number) => ({
    ...CASE_LIBRARY[0],
    id: `t${n}`,
    tenureYearsStated,
  });

  it("uses only cases whose source states tenure, longest and shortest", () => {
    const r = tenureExamples([mk(1, 3), mk(2), mk(3, 27), mk(4, 0)]);
    expect(r.n).toBe(3);
    expect(r.longest?.id).toBe("t3");
    expect(r.shortest?.id).toBe("t4");
  });

  it("gives no shortest when only one case states tenure, and nothing when none does", () => {
    const one = tenureExamples([mk(1, 9), mk(2)]);
    expect(one.n).toBe(1);
    expect(one.longest?.id).toBe("t1");
    expect(one.shortest).toBeNull();
    expect(tenureExamples([mk(1), mk(2)])).toEqual({ n: 0, longest: null, shortest: null });
  });
});

describe("casesForControl", () => {
  it("returns only cases that name the control, largest loss first", () => {
    const cases = casesForControl("owner-opens-bank-statement");
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.wouldHaveCaughtIt.some((w) => w.control === "owner-opens-bank-statement")).toBe(
        true,
      );
    }
    for (let i = 1; i < cases.length; i++) {
      expect(cases[i - 1].lossUsd).toBeGreaterThanOrEqual(cases[i].lossUsd);
    }
  });
});

describe("recommendedStepsForRules", () => {
  it("counts a case once per control even when the case phrases the control twice", () => {
    const steps = recommendedStepsForRules(CONFLICT_RULES.map((r) => r.id));
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(new Set(s.supportingCaseIds).size).toBe(s.supportingCaseIds.length);
      expect(s.asApplied.length).toBeGreaterThan(0);
    }
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i - 1].supportingCaseIds.length).toBeGreaterThanOrEqual(
        steps[i].supportingCaseIds.length,
      );
    }
  });

  it("returns nothing for a rule id nothing cites", () => {
    expect(recommendedStepsForRules(["rule-does-not-exist"])).toEqual([]);
  });
});
