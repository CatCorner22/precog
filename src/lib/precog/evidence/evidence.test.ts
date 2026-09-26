import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../industry";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { DEFAULT_FRAUD_STATS } from "../templates/shared-controls";
import {
  BENCHMARK_BY_ID,
  DETECTION_LABEL,
  lossPhrase,
  SECTOR_LABEL,
  sectorPhrase,
  CASE_LIBRARY,
  CONTROL_CATALOG,
  caseDurationPhrase,
  caseForRule,
  casesForControl,
  casesForSodRules,
  citingCaseStats,
  detectionBreakdown,
  durationPhrase,
  isOwnSector,
  observedLossRange,
  RULE_SCHEMES,
  recommendedStepsForRules,
  tenureExamples,
  sectorsForIndustry,
} from "./index";
import type { CaseStudy } from "./types";

const caseById = (id: string) => CASE_LIBRARY.find((c) => c.id === id);
const casesCitingSodRules = (ruleIds: readonly string[]) => citingCaseStats(ruleIds).cases;

describe("case library integrity", () => {
  const ruleIds = new Set(CONFLICT_RULES.map((r) => r.id));

  it("has unique ids, a source URL, and a rule or a scheme on every case", () => {
    const seen = new Set<string>();
    for (const c of CASE_LIBRARY) {
      expect(seen.has(c.id), `duplicate ${c.id}`).toBe(false);
      seen.add(c.id);
      expect(c.source.url, c.id).toMatch(/^https:\/\//);
      expect(c.sodRuleIds.length + c.schemes.length, `${c.id} cites nothing`).toBeGreaterThan(0);
      for (const r of c.sodRuleIds) expect(ruleIds.has(r), `${c.id} cites ${r}`).toBe(true);
      for (const w of c.wouldHaveCaughtIt) {
        expect(CONTROL_CATALOG[w.control], `${c.id}: ${w.control}`).toBeDefined();
      }
      if (c.lossUsd === 0) expect(c.caveat, `${c.id} has no loss and no caveat`).toBeTruthy();
      // A zero is no amount at all, so it cannot be a minimum.
      if (c.lossIsFloor) expect(c.lossUsd, `${c.id} floor of $0`).toBeGreaterThan(0);
    }
  });

  it("cites each source release once, so no case is counted twice", () => {
    const byUrl = new Map<string, string>();
    for (const c of CASE_LIBRARY) {
      expect(byUrl.get(c.source.url), `${c.id} repeats ${byUrl.get(c.source.url)}`).toBeUndefined();
      byUrl.set(c.source.url, c.id);
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
      const sectors = sectorsForIndustry(id);
      expect(
        CASE_LIBRARY.some((c) => sectors.includes(c.sector)),
        id,
      ).toBe(true);
    }
  });

  it("counts medical cases as the dental template's own line of business", () => {
    expect(sectorsForIndustry("dental")).toEqual(["dental", "medical", "veterinary"]);
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

describe("record invariants", () => {
  it("never states a tenure shorter than the scheme the person ran", () => {
    for (const c of CASE_LIBRARY) {
      if (c.tenureYearsStated === undefined || c.durationMonths === undefined) continue;
      expect(c.tenureYearsStated, c.id).toBeGreaterThanOrEqual(Math.floor(c.durationMonths / 12));
    }
  });

  it("marks a duration as a floor only where there is a duration", () => {
    for (const c of CASE_LIBRARY) {
      if (c.durationIsFloor) expect(c.durationMonths, c.id).toBeGreaterThan(0);
    }
  });

  it("keeps each title's length of scheme in step with the duration shown beside it", () => {
    const boston = caseById("case-boston-dental")!;
    expect(boston.title).toContain("six years");
    expect(durationPhrase(boston.durationMonths!)).toBe("6 years");
  });

  it("keeps an inbound billing fraud out of the conflicts it cannot show", () => {
    for (const rule of ["rule-sign-rec", "rule-je-rec", "rule-payroll-rec"]) {
      expect(
        casesForSodRules([rule]).map((c) => c.id),
        rule,
      ).not.toContain("case-stamford-dental-billing");
    }
  });

  it("files spending by an executive as expenses, not as kickbacks", () => {
    const ids = casesForSodRules(["rule-vendor-approve-pay"]).map((c) => c.id);
    expect(ids).not.toContain("case-nonprofit-human-first");
    expect(ids).not.toContain("case-modest-needs-fake-board");
  });

  it("counts a control only against the employer whose loss the record carries", () => {
    expect(casesForControl("background-check-money-handlers").map((c) => c.id)).not.toContain(
      "case-dennys-franchise-vendors",
    );
  });

  it("prints 'at least' before a duration the record calls a floor", () => {
    expect(caseDurationPhrase({ durationMonths: 60, durationIsFloor: true })).toBe(
      "at least 5 years",
    );
    expect(caseDurationPhrase({ durationMonths: 8 })).toBe("8 months");
    expect(caseDurationPhrase({})).toBeNull();
  });

  it("counts the veterinary case as the dental, medical and veterinary template's own", () => {
    const lowell = caseById("case-lowell-animal-hospital-refunds")!;
    expect(lowell.sector).toBe("veterinary");
    expect(isOwnSector(lowell, "dental")).toBe(true);
    expect(sectorPhrase("veterinary")).toBe("at a veterinary practice");
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

  it("flags the range when any counted amount is a floor", () => {
    const mk = (n: number, lossIsFloor: boolean) => ({
      ...CASE_LIBRARY[0],
      id: `f${n}`,
      lossUsd: n,
      lossIsFloor,
    });
    expect(observedLossRange([mk(10, false), mk(20, false)])!.anyFloor).toBe(false);
    expect(observedLossRange([mk(10, false), mk(20, true)])!.anyFloor).toBe(true);
    // A zero placeholder is not counted, so it cannot make the range a floor.
    expect(observedLossRange([mk(10, false), mk(0, true)])!.anyFloor).toBe(false);
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

describe("case ranking", () => {
  const mk = (id: string, over: Partial<CaseStudy>): CaseStudy => ({
    ...CASE_LIBRARY[0],
    id,
    sector: "any",
    schemes: [],
    sodRuleIds: [],
    lossUsd: 1000,
    lossIsFloor: false,
    ...over,
  });

  it("orders by citation, then stated loss, then scheme overlap, then rule overlap, then amount", () => {
    // rule-collect-post enables skimming and cash-larceny.
    const library = [
      mk("related-large", { schemes: ["skimming", "cash-larceny"], lossUsd: 9_000_000 }),
      mk("cites-no-loss", {
        sodRuleIds: ["rule-collect-post"],
        schemes: ["skimming", "cash-larceny"],
        lossUsd: 0,
      }),
      mk("cites-one-scheme-large", {
        sodRuleIds: ["rule-collect-post"],
        schemes: ["skimming"],
        lossUsd: 500_000,
      }),
      mk("cites-two-schemes-small", {
        sodRuleIds: ["rule-collect-post"],
        schemes: ["skimming", "cash-larceny"],
        lossUsd: 20_000,
      }),
      mk("cites-two-schemes-large", {
        sodRuleIds: ["rule-collect-post"],
        schemes: ["skimming", "cash-larceny"],
        lossUsd: 90_000,
      }),
      mk("unrelated", { schemes: ["payroll"] }),
    ];
    expect(casesForSodRules(["rule-collect-post"], library).map((c) => c.id)).toEqual([
      "cites-two-schemes-large",
      "cites-two-schemes-small",
      "cites-one-scheme-large",
      "cites-no-loss",
      "related-large",
    ]);
  });

  it("never leads a rule with a record that states no loss while one with a figure cites it", () => {
    for (const rule of CONFLICT_RULES) {
      const citing = casesCitingSodRules([rule.id]);
      if (!citing.some((c) => c.lossUsd > 0)) continue;
      expect(citing[0].lossUsd, rule.id).toBeGreaterThan(0);
      for (const { id: industry } of INDUSTRIES) {
        expect(
          caseForRule(rule.id, industry)?.study.lossUsd,
          `${rule.id} ${industry}`,
        ).toBeGreaterThan(0);
      }
    }
    // The counter-clerk record, whose source states no loss, used to lead these.
    for (const industry of ["restaurant", "construction", "general", "nonprofit"]) {
      expect(caseForRule("rule-collect-post", industry)?.study.id).not.toBe(
        "case-void-no-sale-counter",
      );
    }
  });

  it("leads every rule with a case that cites it, and never calls a cross-sector case the owner's line", () => {
    for (const rule of CONFLICT_RULES) {
      if (casesCitingSodRules([rule.id]).length === 0) continue;
      const [lead] = casesForSodRules([rule.id]);
      expect(lead?.sodRuleIds, rule.id).toContain(rule.id);
    }
    const anyCase = CASE_LIBRARY.find((c) => c.sector === "any")!;
    expect(isOwnSector(anyCase, "general")).toBe(false);
  });
});

/**
 * Rules no record in the library shows the pair of duties for. Each is shown
 * with a related scheme until someone sources a case that does.
 */
const UNCITED_RULES = [
  "rule-access-export",
  "rule-access-log",
  "rule-access-release",
  "rule-admin-pay",
  "rule-admin-writeoff",
  "rule-card-approve",
  "rule-cash-admin",
  "rule-claims-writeoff",
  "rule-refund-post",
  "rule-writeoff",
];

describe("casesCitingSodRules", () => {
  it("keeps only the cases that cite the rules, in the order casesForSodRules gives", () => {
    for (const rule of CONFLICT_RULES) {
      const citing = casesCitingSodRules([rule.id]);
      for (const c of citing) expect(c.sodRuleIds, `${rule.id} ${c.id}`).toContain(rule.id);
      const ranked = casesForSodRules([rule.id]).filter((c) => c.sodRuleIds.includes(rule.id));
      expect(citing.map((c) => c.id)).toEqual(ranked.map((c) => c.id));
    }
  });

  it("names exactly the rules that no record in the library shows, so they can be sourced", () => {
    const uncited = CONFLICT_RULES.filter((r) => casesCitingSodRules([r.id]).length === 0)
      .map((r) => r.id)
      .sort();
    expect(uncited).toEqual(UNCITED_RULES);
    // Each still has a related scheme to show, under the related-scheme heading.
    for (const id of uncited) {
      const pick = caseForRule(id, "dental");
      expect(pick?.citesRule, id).toBe(false);
    }
  });

  it("returns nothing for a family finding, which no case cites", () => {
    expect(casesForSodRules(["family-custody-recording"]).length).toBeGreaterThan(0);
    expect(casesCitingSodRules(["family-custody-recording"])).toEqual([]);
  });
});

describe("citingCaseStats", () => {
  it("counts and takes the median over citing cases only, never over related schemes", () => {
    const rules = ["rule-collect-post", "family-custody-recording"];
    const stats = citingCaseStats(rules);
    const citing = casesCitingSodRules(rules);
    expect(stats.count).toBe(citing.length);
    expect(stats.cases.map((c) => c.id)).toEqual(citing.map((c) => c.id));
    expect(stats.count).toBeGreaterThan(0);
    expect(stats.loss).toEqual(observedLossRange(citing));
    expect(stats.duration?.n ?? 0).toBe(citing.filter((c) => (c.durationMonths ?? 0) > 0).length);
    expect(stats.detection).toEqual(detectionBreakdown(citing));
    // The broader match carries scheme-only cases that must not enter the count.
    expect(casesForSodRules(rules).length).toBeGreaterThan(stats.count);
  });

  it("returns an empty set, no median and no duration when nothing cites the rules", () => {
    const stats = citingCaseStats(["family-custody-recording"]);
    expect(stats.count).toBe(0);
    expect(stats.loss).toBeNull();
    expect(stats.duration).toBeNull();
    expect(stats.detection).toEqual({ n: 0, known: 0, unknown: 0, byRoute: [] });
  });
});

describe("caseForRule", () => {
  it("shows a citing case from the owner's own line of business when one exists", () => {
    const pick = caseForRule("rule-collect-post", "dental")!;
    expect(pick.citesRule).toBe(true);
    expect(pick.ownSector).toBe(true);
    expect(pick.study.sodRuleIds).toContain("rule-collect-post");
    expect(isOwnSector(pick.study, "dental")).toBe(true);
  });

  it("falls back to a citing case elsewhere, then marks a related scheme as not citing", () => {
    const elsewhere = caseForRule("rule-backup-access", "restaurant")!;
    expect(elsewhere.citesRule).toBe(true);
    expect(elsewhere.ownSector).toBe(false);
    const related = caseForRule("family-custody-recording", "general")!;
    expect(related.citesRule).toBe(false);
    expect(related.study.sodRuleIds).not.toContain("family-custody-recording");
    expect(caseForRule("rule-does-not-exist")).toBeNull();
  });
});

describe("durationPhrase", () => {
  it("says one month in the singular and counts months below a year", () => {
    expect(durationPhrase(1)).toBe("1 month");
    expect(durationPhrase(8)).toBe("8 months");
    expect(durationPhrase(0)).toBe("under a month");
  });

  it("rounds years to a tenth, so nearly 17 years never reads as 17", () => {
    expect(durationPhrase(12)).toBe("1 year");
    expect(durationPhrase(18)).toBe("1.5 years");
    expect(durationPhrase(132)).toBe("11 years");
    expect(durationPhrase(200)).toBe("16.7 years");
  });

  it("rounds months before choosing between months and years", () => {
    expect(durationPhrase(11.6)).toBe("1 year");
    expect(durationPhrase(11.4)).toBe("11 months");
    expect(durationPhrase(0.4)).toBe("under a month");
  });
});

describe("rule attachments", () => {
  it("keeps off the attachments whose records do not show the rule's pair of duties", () => {
    const removed: [string, string][] = [
      ["case-houston-dental-shell", "rule-vendor-create-pay"],
      ["case-nonprofit-human-first", "rule-vendor-create-pay"],
      ["case-bellingham-assistant-manager", "rule-vendor-create-pay"],
      ["case-st-louis-floor-covering", "rule-vendor-create-pay"],
      ["case-st-louis-floor-covering", "rule-invoice-pay"],
      ["case-hutchinson-controller", "rule-vendor-create-pay"],
      ["case-jersey-city-condo-kickbacks", "rule-invoice-pay"],
      ["case-kearny-medical-receptionist", "rule-custody-rec"],
      ["case-kearny-medical-receptionist", "rule-deposit-post"],
      ["case-kearny-medical-receptionist", "rule-payments-adjust"],
      ["case-msp-airport-restaurant-cash", "rule-custody-rec"],
      ["case-void-no-sale-counter", "rule-refund-adjust"],
      ["case-void-no-sale-counter", "rule-writeoff"],
      ["case-void-no-sale-counter", "rule-custody-rec"],
      ["case-dothan-printing-credentials", "rule-access-log"],
      ["case-dennys-franchise-vendors", "rule-order-receive"],
      ["case-caseyville-pediatrics-office-manager-five-ways", "rule-payroll-rec"],
      ["case-duncan-part-time-bookkeeper-found-on-vacation", "rule-admin-pay"],
    ];
    for (const [caseId, ruleId] of removed) {
      expect(caseById(caseId)?.sodRuleIds, `${caseId} ${ruleId}`).not.toContain(ruleId);
    }
    // No record shows system administration held with payment posting, so
    // the rule cites no case and shows a related scheme instead.
    for (const [caseId, ruleId] of [
      ["case-bellingham-assistant-manager", "rule-admin-pay"],
      ["case-modest-needs-fake-board", "rule-admin-pay"],
      ["case-stamford-dental-billing", "rule-claims-writeoff"],
      ["case-stamford-dental-billing", "rule-admin-writeoff"],
      ["case-st-albans-dental-billing", "rule-writeoff"],
      ["case-irvine-consultancy-it-wipe", "rule-access-log"],
      ["case-dothan-printing-credentials", "rule-access-export"],
      ["case-attleboro-expense-padding", "rule-payroll"],
      ["case-msp-airport-restaurant-cash", "rule-deposit-post"],
      ["case-littleton-oral-surgery-fentanyl", "rule-order-receive"],
    ]) {
      expect(caseById(caseId)?.sodRuleIds, `${caseId} ${ruleId}`).not.toContain(ruleId);
    }
    expect(casesCitingSodRules(["rule-admin-pay"])).toEqual([]);
  });

  it("puts check signing and reconciliation on the records that state both", () => {
    for (const id of [
      "case-anderson-indiana-accountant-transfers-gambling",
      "case-lenoir-secret-bank-account",
    ]) {
      expect(caseById(id)?.sodRuleIds, id).toContain("rule-sign-rec");
    }
  });

  it("backs taking payments plus posting adjustments with the records that show it, mapped to schemes", () => {
    expect(CONFLICT_RULES.find((r) => r.id === "rule-collect-adjust")).toMatchObject({
      a: "collect_cash",
      b: "post_adjustments",
      severity: "high",
    });
    expect(
      casesCitingSodRules(["rule-collect-adjust"])
        .map((c) => c.id)
        .sort(),
    ).toEqual([
      "case-burlington-dealership-cash",
      "case-st-albans-dental-billing",
      "case-void-no-sale-counter",
    ]);
    expect(RULE_SCHEMES["rule-collect-adjust"]).toContain("skimming");
    // No record shows a collector approving write-offs or issuing refunds.
    expect(CONFLICT_RULES.some((r) => r.id === "rule-collect-writeoff")).toBe(false);
    expect(CONFLICT_RULES.some((r) => r.id === "rule-collect-refund")).toBe(false);
  });

  it("backs the company card plus its statement review with the records whose insider held the card and kept its books", () => {
    expect(CONFLICT_RULES.find((r) => r.id === "rule-card-review")).toMatchObject({
      a: "hold_company_card",
      b: "review_card_statement",
      severity: "high",
    });
    expect(
      casesCitingSodRules(["rule-card-review"])
        .map((c) => c.id)
        .sort(),
    ).toEqual([
      "case-attleboro-expense-padding",
      "case-bellevue-dental-card",
      "case-bellingham-assistant-manager",
      "case-hutchinson-controller",
    ]);
    expect(RULE_SCHEMES["rule-card-review"]).toEqual(["expense-reimbursement"]);
    // A dentist reads the Bellevue practice card case as their own line of business.
    const pick = caseForRule("rule-card-review", "dental")!;
    expect(pick.citesRule).toBe(true);
    expect(pick.ownSector).toBe(true);
    expect(pick.study.id).toBe("case-bellevue-dental-card");
    // No record shows a cardholder approving expense claims, so that rule shows a related card case.
    const related = caseForRule("rule-card-approve", "professional_services")!;
    expect(related.citesRule).toBe(false);
    expect(related.study.schemes).toContain("expense-reimbursement");
  });

  it("records no duration where the source dates only the employment, and no floor from two estimates", () => {
    expect(
      caseById("case-duncan-part-time-bookkeeper-found-on-vacation")?.durationMonths,
    ).toBeUndefined();
    expect(caseById("case-dennys-franchise-vendors")?.lossIsFloor).toBe(false);
    expect(caseById("case-stamford-dental-billing")?.lossIsFloor).toBe(true);
    expect(caseById("case-houston-dental-shell")?.schemes).not.toContain("billing-shell-vendor");
    expect(caseById("case-bellingham-assistant-manager")?.detection).toBe("unknown");
  });
});

describe("benchmarks and the shared statistics record", () => {
  const bm = (id: string) => BENCHMARK_BY_ID[id];

  it("carry the same figures wherever they state the same statistic", () => {
    expect(DEFAULT_FRAUD_STATS.medianLossAllUsd).toBe(bm("bm-median-loss").numeric);
    expect(DEFAULT_FRAUD_STATS.medianLossSmallOrgUsd).toBe(bm("bm-small-org-losses").numeric);
    expect(DEFAULT_FRAUD_STATS.revenueLossRateAnnual).toBe(bm("bm-revenue-share").numeric);
    expect(DEFAULT_FRAUD_STATS.medianDetectionMonths).toBe(bm("bm-median-duration").numeric);

    const curve = bm("bm-duration-cost-curve").value;
    expect(curve).toContain(`$${DEFAULT_FRAUD_STATS.lossIfCaughtEarlyUsd.toLocaleString("en-US")}`);
    expect(curve).toContain(`$${DEFAULT_FRAUD_STATS.lossIfRunsLongUsd / 1_000_000} million`);

    const spread = bm("bm-duration-distribution").value;
    expect(spread).toContain(`${Math.round(DEFAULT_FRAUD_STATS.shareRunningOverFiveYears * 100)}%`);
    expect(spread).toMatch(/^A third are found within six months/);
    expect(Math.abs(DEFAULT_FRAUD_STATS.shareFoundUnderSixMonths - 1 / 3)).toBeLessThan(0.01);

    expect(DEFAULT_FRAUD_STATS.sourceUrl).toBe(bm("bm-median-loss").source.url);
  });

  it("leaves page and figure empty until someone checks them against the report", () => {
    for (const b of Object.values(BENCHMARK_BY_ID)) {
      expect(b.page, b.id).toBeUndefined();
      expect(b.figure, b.id).toBeUndefined();
    }
  });
});

describe("shared evidence wording", () => {
  it("states a floor loss as 'at least' and an exact loss as the figure", () => {
    expect(lossPhrase({ lossUsd: 1_000_000, lossIsFloor: true })).toBe("at least $1,000,000");
    expect(lossPhrase({ lossUsd: 48_250, lossIsFloor: false })).toBe("$48,250");
  });

  it("places every case in a natural phrase, never 'at a any business'", () => {
    for (const study of CASE_LIBRARY) {
      const phrase = sectorPhrase(study.sector);
      expect(phrase).toMatch(/^at (a|an|another) /);
      expect(phrase).not.toContain(" any ");
      expect(phrase).not.toContain("professional-services business");
    }
    expect(sectorPhrase("any")).toBe("at another business");
  });

  it("labels every detection route and sector the library uses", () => {
    for (const study of CASE_LIBRARY) {
      expect(DETECTION_LABEL[study.detection]).toBeTruthy();
      expect(SECTOR_LABEL[study.sector]).toBeTruthy();
    }
  });
});
