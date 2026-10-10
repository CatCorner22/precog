import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { IndustryTemplate } from "../templates";
import { gapBadge } from "../coach/first-steps";
import { UNANSWERED } from "../onboarding/setup-answers";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { entitlementLabel } from "../sod/conflict-rules";
import { buildControlReportModel } from "../report/build-control-report";
import { buildStartHereModel, LONG_SERVICE_YEARS } from "./model";

const TODAY = new Date(2026, 8, 26);

function sample(industry: PracticeProfile["industry"] = "dental") {
  const profile = defaultProfile(industry);
  const template = resolveTemplate(profile);
  return { profile, template };
}

/** The sample's own policy switched on: vendor pay closed at every amount, write-offs above $150. */
function withDualRelease(profile: PracticeProfile): PracticeProfile {
  return { ...profile, dualRelease: { ...profile.dualRelease, enabled: true } };
}

/** A team of people holding exactly the duties given. */
function team(
  base: IndustryTemplate,
  people: { id: string; name: string; duties: string[]; tenureYears?: number }[],
): IndustryTemplate {
  return {
    ...base,
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      role: "Clerk",
      active: true,
      entitlements: p.duties,
      tenureYears: p.tenureYears,
    })),
    relations: [],
    roleTemplates: {},
  };
}

describe("buildStartHereModel on the dental sample", () => {
  const { profile, template } = sample();
  const model = buildStartHereModel({ profile, template, today: TODAY });

  it("groups the findings into one gap per rule, unmitigated and worst first", () => {
    // The sample's accepted pairs (payments vs reconciliation) stay open.
    expect(model.exposure.openConflicts).toHaveLength(20);
    expect(model.exposure.gaps).toHaveLength(14);
    expect(model.exposure.topThree.map((g) => g.conflict.ruleId)).toEqual([
      "rule-cash-rec",
      "rule-vendor-create-pay",
      "rule-writeoff",
    ]);
    expect(
      model.exposure.topThree.map((g) =>
        gapBadge(g.conflict, model.exposure.partialCoverage.get(g.conflict.ruleId)),
      ),
    ).toEqual(["Critical", "Critical", "Critical"]);
    expect(model.exposure.gaps.some((g) => g.conflict.dualReleaseMitigated)).toBe(false);
  });

  it("counts only the cases that show the open gaps, and quotes their median", () => {
    expect(model.cost.citing.count).toBe(36);
    expect(model.cost.citing.loss?.median).toBe(453_877);
    expect(model.cost.evidenceCount).toBeGreaterThan(model.cost.citing.count);
    expect(model.footer.citingIds.size).toBe(36);
    expect(model.footer.cases.filter((c) => model.footer.citingIds.has(c.id))).toHaveLength(36);
  });

  it("uses the small-organization benchmark for a team under 100", () => {
    expect(model.cost.smallOrg).toBe(true);
    expect(model.cost.medianLoss?.id).toBe("bm-small-org-losses");
    expect(model.cost.medianLossValue).toBe("$126,000");
    expect(model.cost.medianLoss?.caveat).toBeTruthy();
  });

  it("ranks first steps by the open findings they answer", () => {
    const answers = model.firstSteps.steps.map((s) => s.answers);
    expect(answers).toEqual([...answers].sort((a, b) => b - a));
    expect(model.firstSteps.steps[0]?.control.id).toBe("split-one-duty-out");
    expect(model.firstSteps.hotlineGap?.id).toBe("bm-small-org-hotline-gap");
  });

  it("places the long-service note on the first top gap a long-serving person holds", () => {
    const note = model.exposure.tenureNote;
    expect(note?.ruleId).toBe("rule-vendor-create-pay");
    expect(note?.longServing.every((p) => p.years >= LONG_SERVICE_YEARS)).toBe(true);
  });

  it("reuses a duty-conflict report the shell passes in", () => {
    const sod = detectSodConflicts(
      template,
      profile.staff,
      sodDetectionOptions(template, profile.dualRelease),
    );
    const reused = buildStartHereModel({ profile, template, today: TODAY, sod });
    expect(reused.exposure.openConflicts).toEqual(model.exposure.openConflicts);
  });
});

describe("buildStartHereModel unheld duties", () => {
  it("omits an outside bank reconciliation but keeps a nobody-reconciles gap", () => {
    const { profile: baseProfile, template: baseTemplate } = sample();
    const template = team(baseTemplate, [
      { id: "owner", name: "Owner", duties: ["schedule_patients"] },
    ]);
    const profile = { ...baseProfile, customPeople: template.people };
    const unheldWithBankRec = (bankRec: "outside" | "nobody") =>
      buildStartHereModel({
        profile: { ...profile, setupAnswers: { ...UNANSWERED, bankRec } },
        template,
        today: TODAY,
      }).exposure.unheld;
    const bankReconciliation = entitlementLabel("bank_reconcile");

    expect(unheldWithBankRec("outside")).not.toContain(bankReconciliation);
    expect(unheldWithBankRec("nobody")).toContain(bankReconciliation);
  });
});

describe("buildStartHereModel with dual release on", () => {
  const { profile: base, template } = sample();
  const profile = withDualRelease(base);
  const model = buildStartHereModel({ profile, template, today: TODAY });

  it("marks a threshold-only rule as reduced, not closed, at its lowest threshold", () => {
    const writeoff = model.exposure.gaps.find((g) => g.conflict.ruleId === "rule-writeoff");
    expect(model.exposure.partialCoverage.get("rule-writeoff")).toBe(150);
    expect(writeoff && gapBadge(writeoff.conflict, 150)).toBe("Reduced, not closed");
    expect(
      model.exposure.gaps.filter((g) => model.exposure.partialCoverage.has(g.conflict.ruleId))
        .length,
    ).toBeGreaterThan(0);
  });

  it("closes a rule any channel covers at every amount", () => {
    expect(model.exposure.partialCoverage.has("rule-vendor-create-pay")).toBe(false);
    expect(
      model.exposure.gaps.filter(
        (g) =>
          g.conflict.dualReleaseMitigated && !model.exposure.partialCoverage.has(g.conflict.ruleId),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("gives the same case count and median as the printed report", () => {
    const report = buildControlReportModel({
      tpl: template,
      profile,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: true,
      businessName: "Sample",
    });
    expect(report.citing.count).toBe(model.cost.citing.count);
    expect(report.lossRange?.median).toBe(model.cost.citing.loss?.median);
    expect(report.steps.map((s) => s.control.id)).toEqual(
      model.firstSteps.steps.slice(0, 6).map((s) => s.control.id),
    );
  });
});

describe("buildStartHereModel tenure", () => {
  it("keeps two people with one name apart", () => {
    const { profile, template: base } = sample();
    const template = team(base, [
      { id: "x2", name: "Chris Lee", duties: ["create_vendor", "release_payment"], tenureYears: 1 },
      { id: "x1", name: "Chris Lee", duties: ["schedule_patients"], tenureYears: 20 },
    ]);
    const model = buildStartHereModel({
      profile: { ...profile, customPeople: template.people },
      template,
      today: TODAY,
    });
    expect(model.exposure.topThree[0]?.conflict.ruleId).toBe("rule-vendor-create-pay");
    expect(model.exposure.tenureNote).toBeNull();
  });
});

describe("buildStartHereModel continuity and first steps", () => {
  it("reports an unassessed sample register without figures", () => {
    const { profile, template } = sample("general");
    const model = buildStartHereModel({ profile, template, today: TODAY });
    expect(model.continuity.registerSize).toBe(template.knowledge.length);
    expect(model.continuity.industryLabel).toBe(model.continuity.industryLabel.toLowerCase());
    expect(model.preamble.isSampleTeam).toBe(true);
  });
});
