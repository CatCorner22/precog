import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile, normalizeProfile, type PracticeProfile } from "../practice-profile";
import { assessCoso } from "../coso";
import { portfolioSummary } from "../scoring/residual-engine";
import type { IndustryTemplate } from "../templates";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { conflictStatus } from "../sod/open-findings";
import { healthLevel } from "../scoring/bands";
import { coverageReport } from "../continuity/coverage";
import { isOwnSector } from "../evidence";
import { withDerivedSegregation, withStaff } from "../profile-actions";
import type { Person } from "../types";
import { buildControlReportModel, type ControlReportInput } from "./build-control-report";

function input(
  industry: PracticeProfile["industry"],
  overrides: Partial<ControlReportInput> = {},
): ControlReportInput {
  const profile = defaultProfile(industry);
  return {
    tpl: resolveTemplate(profile),
    profile,
    mapCustomized: false,
    today: "2026-09-26",
    trackFreshness: false,
    mapReady: true,
    businessName: "Sample",
    ...overrides,
  };
}

describe("buildControlReportModel", () => {
  it.each(INDUSTRIES.map((i) => i.id))("%s sample: prints the dashboard's figures", (industry) => {
    const args = input(industry);
    const model = buildControlReportModel(args);
    const sod = detectSodConflicts(
      args.tpl,
      args.profile.staff,
      sodDetectionOptions(args.tpl, args.profile.dualRelease),
    );
    expect(model.sod.summary).toEqual(sod.summary);
    expect(model.continuity.coverageIndex).toBe(coverageReport(args.tpl).coverageIndex);
    expect(model.sod.recommendations.length).toBeGreaterThan(0);
  });

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: lists its own sector's cases first and counts only citing cases",
    (industry) => {
      const model = buildControlReportModel(input(industry));
      const own = model.evidence.map((c) => isOwnSector(c, industry));
      expect(own).toEqual([...own].sort((a, b) => Number(b) - Number(a)));
      expect(model.citing.count).toBeLessThanOrEqual(model.evidence.length);
      expect(model.statsScope.count).toBe(model.citing.count);
      expect(model.lossRange?.n ?? 0).toBeLessThanOrEqual(model.citing.count);
    },
  );

  it("a later day leaves the duty-conflict counts and cases unchanged", () => {
    const early = buildControlReportModel(input("dental", { today: "2026-09-26" }));
    const late = buildControlReportModel(input("dental", { today: "2027-09-26" }));
    expect(late.sod.summary).toEqual(early.sod.summary);
    expect(late.citing.count).toBe(early.citing.count);
  });

  it("gives no loss figure when no case shows the open gaps", () => {
    const base = input("dental");
    const tpl: IndustryTemplate = {
      ...base.tpl,
      people: [
        {
          id: "x1",
          name: "Solo Clerk",
          role: "Clerk",
          active: true,
          entitlements: ["approve_writeoffs", "edit_patient_master"],
        },
      ],
      relations: [],
      roleTemplates: {},
    };
    const model = buildControlReportModel({ ...base, tpl, mapReady: false });
    expect(model.sod.conflicts.some((c) => c.ruleId.startsWith("family-"))).toBe(false);
    expect(model.citing.count).toBe(0);
    expect(model.lossRange).toBeNull();
    expect(model.found.n).toBe(0);
  });

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: never bands the duty separation index strong or adequate with a critical finding open",
    (industry) => {
      const { sodOpen, sodLevel } = buildControlReportModel(input(industry));
      if (sodOpen.openCritical > 0) expect(["strong", "adequate"]).not.toContain(sodLevel);
      if (sodOpen.openHigh > 0) expect(sodLevel).not.toBe("strong");
    },
  );

  it("counts a critical pair dual release covers only above a threshold as open, beside a weak band", () => {
    // The write-off rule's threshold is $150: below it Ana still approves and
    // posts her own write-offs, so the pair stays open.
    const profile: PracticeProfile = {
      ...defaultProfile("dental"),
      practiceName: "Reyes Dental",
      customPeople: [
        {
          id: "o",
          name: "Olga Reyes",
          role: "Owner",
          active: true,
          owner: true,
          entitlements: ["release_payment"],
        },
        {
          id: "a",
          name: "Ana Diaz",
          role: "Bookkeeper",
          active: true,
          entitlements: ["approve_writeoffs", "post_adjustments"],
        },
      ],
    };
    profile.dualRelease = { ...profile.dualRelease, enabled: true };
    const model = buildControlReportModel({
      ...input("dental"),
      profile,
      tpl: resolveTemplate(profile),
    });
    const health = model.sod.summary.segregationHealth;
    expect(healthLevel(health)).toBe("strong");
    expect(model.sodLevel).toBe("weak");
    // The detector's summary counts it open too, as the band word does, and
    // the status column says dual release only reduces it.
    expect(model.sod.summary.critical).toBe(1);
    const pair = model.sod.conflicts.find((c) => c.severity === "critical")!;
    expect(conflictStatus(pair, model.partialCoverage)).toBe("Reduced, not closed");
    expect(model.sodOpen).toEqual({
      openCritical: 1,
      openHigh: 0,
      criticalBelowThreshold: 1,
      highBelowThreshold: 0,
    });
  });
});

describe("figures set by hand", () => {
  const team: Person[] = [
    {
      id: "a",
      name: "Ada Park",
      role: "Owner",
      active: true,
      owner: true,
      entitlements: ["approve_payroll", "sign_checks"],
    },
    {
      id: "b",
      name: "Ben Ortiz",
      role: "Bookkeeper",
      active: true,
      entitlements: ["enter_invoices", "release_payment", "bank_reconcile"],
    },
  ];
  const own = (): PracticeProfile => ({
    ...defaultProfile("dental"),
    practiceName: "Ortiz Dental Studio",
    customPeople: team,
  });
  const report = (profile: PracticeProfile) =>
    buildControlReportModel({ ...input("dental"), profile, tpl: resolveTemplate(profile) });

  it("never sets an own team's segregation score or bank reconciliation answer by hand", () => {
    const derived = withDerivedSegregation(own());
    const tried = withStaff(derived, {
      ...derived.staff,
      segregationScore: 95,
      independentBankRec: !derived.staff.independentBankRec,
    });
    expect(tried.staff.segregationScore).toBe(derived.staff.segregationScore);
    expect(tried.staff.independentBankRec).toBe(derived.staff.independentBankRec);
    expect(tried.staff.segregationSource).not.toBe("manual");
    expect(tried.staff.bankRecSource).not.toBe("manual");
    expect(report(tried).handSet).toEqual([]);
  });

  it("scores an own team saved with hand-set figures from its duties, and discloses nothing", () => {
    const derived = withDerivedSegregation(own());
    const saved: PracticeProfile = {
      ...derived,
      staff: {
        ...derived.staff,
        segregationScore: 95,
        segregationSource: "manual",
        independentBankRec: true,
        bankRecSource: "manual",
      },
    };
    const loaded = normalizeProfile(saved);
    expect(loaded.staff.segregationScore).toBe(derived.staff.segregationScore);
    expect(loaded.staff.independentBankRec).toBe(derived.staff.independentBankRec);
    expect(loaded.riskVariables.hasIndependentBankRec).toBe(derived.staff.independentBankRec);
    // Residual, COSO and the priority figures are those the duties give.
    const tpl = resolveTemplate(derived);
    expect(portfolioSummary(tpl, loaded.staff)).toEqual(portfolioSummary(tpl, derived.staff));
    expect(assessCoso(tpl, loaded.staff)).toEqual(assessCoso(tpl, derived.staff));
    expect(report(loaded).handSet).toEqual([]);
    expect(report(loaded).threat).toEqual(report(derived).threat);
  });

  it("discloses a segregation score and bank reconciliation answer set by hand on a sample", () => {
    const sample = defaultProfile("dental");
    const manual = withStaff(sample, {
      ...sample.staff,
      segregationScore: 95,
      independentBankRec: !sample.staff.independentBankRec,
    });
    expect(manual.staff.segregationScore).toBe(95);
    expect(manual.staff.segregationSource).toBe("manual");
    expect(manual.staff.bankRecSource).toBe("manual");
    expect(buildControlReportModel({ ...input("dental"), profile: manual }).handSet).toEqual([
      "Segregation score set by hand: 95. The priority list and residual risk scores in this report use the score set by hand; duty separation reads the duties.",
      `Bank reconciliation answer set by hand: ${manual.staff.independentBankRec ? "someone" : "nobody"} independent reconciles the bank account.`,
    ]);
  });

  it("prints no disclosure while both figures follow the team, or for a sample", () => {
    expect(report(own()).handSet).toEqual([]);
    expect(report(withDerivedSegregation(own())).handSet).toEqual([]);
    expect(buildControlReportModel(input("dental")).handSet).toEqual([]);
  });
});
