import { describe, expect, it } from "vitest";
import { pilotMetrics, pilotMetricsCsv } from "../firm/engagement";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { withDecision, type DecisionInput } from "../profile-actions";
import { resolveTemplate } from "../active-template";
import { detectSodConflicts, sodDetectionOptions, type DetectedConflict } from "../sod/detect";
import { partialDualReleaseCoverage } from "../sod/open-findings";
import { conflictDecisionEntry, notValidEntry, notValidReady } from "./conflict-entries";
import { decisionsDue } from "./follow-through";
import { cardDecision, findingsWithoutDecision, ruleSeverity } from "./not-valid";

const NOW = new Date("2026-09-15T12:00:00.000Z");

function figures(profile: PracticeProfile) {
  const tpl = resolveTemplate(profile);
  const conflicts = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  ).conflicts;
  const partial = partialDualReleaseCoverage(profile.dualRelease, conflicts);
  return {
    conflicts,
    noDecision: findingsWithoutDecision(conflicts, partial, profile.decisions, profile.industry)
      .length,
    metrics: pilotMetrics({
      conflicts,
      partialCoverage: partial,
      decisions: profile.decisions,
      industry: profile.industry,
    }),
  };
}

const log = (profile: PracticeProfile, input: DecisionInput, id: string) =>
  withDecision(profile, input, id, NOW);

/** A sample with an open finding of each wanted severity, and no decisions yet. */
function sampleWith(pick: (c: DetectedConflict) => boolean) {
  for (const industry of ["dental", "general", "retail", "restaurant"] as const) {
    const profile = { ...defaultProfile(industry), decisions: [] };
    const base = figures(profile);
    const finding = base.conflicts.find(
      (c) => pick(c) && !c.ownerHeld && !c.dualReleaseMitigated && !c.residualRiskAccepted,
    );
    // The finding's rule is its own: no other open finding shares it.
    if (finding && base.conflicts.filter((c) => c.ruleId === finding.ruleId).length === 1) {
      return { profile, base, finding };
    }
  }
  throw new Error("no sample has such a finding");
}

describe("a decision logged on a duty-conflict card", () => {
  it("moves No decision yet and the pilot metrics together", () => {
    const { profile, base, finding } = sampleWith((c) => c.severity === "high");
    const after = figures(
      log(profile, conflictDecisionEntry(finding, "remediate", "Move it", 90, NOW), "d1"),
    );
    expect(after.noDecision).toBe(base.noDecision - 1);
    expect(after.metrics.actedOnFindings).toBe(base.metrics.actedOnFindings + 1);
    expect(after.metrics.openFindings).toBe(base.metrics.openFindings);
    const accepted = figures(
      log(profile, conflictDecisionEntry(finding, "accept_residual", "", 90, NOW), "d2"),
    );
    expect(accepted.noDecision).toBe(base.noDecision - 1);
    expect(accepted.metrics.acceptedFindings).toBe(base.metrics.acceptedFindings + 1);
  });

  it("reads back on the card as the decision and its review date", () => {
    const { profile, finding } = sampleWith((c) => c.severity === "high");
    const p = log(profile, conflictDecisionEntry(finding, "monitor", "", 30, NOW), "d1");
    const shown = cardDecision(finding, p.decisions, p.industry);
    expect(shown?.type).toBe("decision");
    expect(shown?.entry.kind).toBe("monitor");
    expect(shown?.entry.reviewBy).toBe("2026-10-15");
  });
});

describe("a duty conflict judged not valid", () => {
  const by = { userId: "u1", name: "Ana Ruiz" };

  it("needs a reason, and a note for Other", () => {
    expect(notValidReady(null, "")).toBe(false);
    expect(notValidReady("duty_not_held", "")).toBe(true);
    expect(notValidReady("other", "  ")).toBe(false);
    expect(notValidReady("other", "Seasonal help only")).toBe(true);
  });

  it("stays open, moves no decision figure, and is counted with its reason", () => {
    const { profile, base, finding } = sampleWith((c) => c.severity !== "critical");
    const p = log(profile, notValidEntry(finding, "controlled_elsewhere", "", by, NOW), "nv");
    const entry = p.decisions[0];
    expect(entry.kind).toBe("monitor");
    expect(entry.reviewBy).toBeUndefined();
    expect(entry.linkedTab).toBe("sod");
    expect(entry.linkedId).toBe(finding.ruleId);
    expect(entry.linkedIndustry).toBe(profile.industry);
    expect(entry.disposition).toMatchObject({
      verdict: "not_valid",
      reason: "controlled_elsewhere",
      by,
    });

    const after = figures(p);
    expect(after.metrics.openFindings).toBe(base.metrics.openFindings);
    expect(after.metrics.acceptedFindings).toBe(base.metrics.acceptedFindings);
    expect(after.metrics.actedOnFindings).toBe(base.metrics.actedOnFindings);
    expect(after.metrics.acceptanceRate).toBe(base.metrics.acceptanceRate);
    expect(after.metrics.notValidFindings).toBe(1);
    expect(after.metrics.notValidReasons.controlled_elsewhere).toBe(1);
    const findings = base.conflicts.filter((c) => !c.ownerHeld).length;
    expect(after.metrics.validRate).toBeCloseTo((findings - 1) / findings);
    expect(pilotMetricsCsv("Own", after.metrics)).toContain("\nnotValidFindings,1\n");
    // A non-critical finding judged not valid has a decision for the tile.
    expect(after.noDecision).toBe(base.noDecision - 1);
    // It has no review date, so it never falls due.
    const due = decisionsDue(p.decisions, "2027-06-01");
    expect([...due.overdue, ...due.dueSoon].map((d) => d.id)).not.toContain("nv");
    expect(cardDecision(finding, p.decisions, p.industry)?.type).toBe("not_valid");
  });

  it("leaves a critical finding pending until a second person confirms it", () => {
    const { profile, base, finding } = sampleWith((c) => c.severity === "critical");
    expect(ruleSeverity(finding.ruleId)).toBe("critical");
    const p = log(profile, notValidEntry(finding, "rule_does_not_fit", "", null, NOW), "nv");
    expect(p.decisions[0].disposition?.by).toBeUndefined();
    const after = figures(p);
    expect(after.noDecision).toBe(base.noDecision);
    expect(after.metrics.notValidFindings).toBe(0);
    expect(after.metrics.validRate).toBe(base.metrics.validRate);
    expect(after.metrics.openFindings).toBe(base.metrics.openFindings);
  });
});
