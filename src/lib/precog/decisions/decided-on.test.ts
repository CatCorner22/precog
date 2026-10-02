import { describe, expect, it } from "vitest";
import { INDUSTRIES, type IndustryId } from "../industry";
import { pilotMetrics } from "../firm/engagement";
import { defaultProfile, type DecisionEntry, type DecisionKind } from "../practice-profile";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { partialDualReleaseCoverage } from "../sod/open-findings";
import { getIndustryTemplate } from "../templates";
import { decidedOn, isNotValid } from "./decided-on";
import { decisionsDue } from "./follow-through";

const ANY_KIND: ReadonlySet<string> = new Set([
  "accept_residual",
  "remediate",
  "monitor",
  "insure",
]);

const entry = (over: Partial<DecisionEntry>): DecisionEntry => ({
  id: "d",
  createdAt: "2026-09-01T12:00:00.000Z",
  subject: "A duty conflict",
  kind: "monitor",
  note: "",
  linkedTab: "sod",
  ...over,
});

const notValid = (linkedId: string, over: Partial<DecisionEntry> = {}): DecisionEntry =>
  entry({
    id: `nv-${linkedId}`,
    linkedId,
    disposition: { verdict: "not_valid", reason: "rule_does_not_fit", at: "2026-09-02" },
    ...over,
  });

describe("decidedOn", () => {
  const finding = { ruleId: "rule-1", linkedControlId: "c-1" };

  it("counts a decision linked to the finding's rule or control", () => {
    expect(decidedOn(finding, ANY_KIND, [entry({ linkedId: "rule-1" })], "dental")).toBe(true);
    expect(decidedOn(finding, ANY_KIND, [entry({ linkedId: "c-1" })], "dental")).toBe(true);
    expect(decidedOn(finding, ANY_KIND, [entry({ linkedId: "other" })], "dental")).toBe(false);
  });

  it("does not count an entry that judges the finding not valid", () => {
    const judged = notValid("rule-1");
    expect(isNotValid(judged)).toBe(true);
    expect(decidedOn(finding, ANY_KIND, [judged], "dental")).toBe(false);
    expect(isNotValid(entry({ linkedId: "rule-1" }))).toBe(false);
  });

  it("follows a decision only under the industry it was logged for", () => {
    const logged = entry({ linkedId: "rule-1", linkedIndustry: "retail" });
    expect(decidedOn(finding, ANY_KIND, [logged], "dental")).toBe(false);
    expect(decidedOn(finding, ANY_KIND, [logged], "retail")).toBe(true);
  });
});

describe("decisionsDue", () => {
  it("never lists an entry that judges a finding not valid", () => {
    const today = "2026-10-01";
    const due = decisionsDue(
      [
        notValid("rule-1", { reviewBy: "2026-09-01" }),
        entry({ id: "real", linkedId: "rule-2", reviewBy: "2026-09-01" }),
      ],
      today,
    );
    expect(due.overdue.map((d) => d.id)).toEqual(["real"]);
    expect(due.dueSoon).toEqual([]);
  });
});

/** The pilot figures for one sample, with one decision of each kind on its first findings. */
function sampleFigures(industry: IndustryId, extra: DecisionEntry[] = []) {
  const profile = defaultProfile(industry);
  const tpl = getIndustryTemplate(industry);
  const conflicts = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  ).conflicts;
  const kinds: DecisionKind[] = ["accept_residual", "remediate", "monitor", "insure"];
  const decisions = [
    ...conflicts
      .filter((c) => !c.ownerHeld)
      .slice(0, kinds.length)
      .map((c, i) => entry({ id: `d${i}`, kind: kinds[i], linkedId: c.ruleId })),
    ...extra,
  ];
  const metrics = pilotMetrics({
    conflicts,
    partialCoverage: partialDualReleaseCoverage(profile.dualRelease, conflicts),
    decisions,
    industry,
  });
  return { conflicts, decisions, metrics };
}

describe("the shared rule leaves every sample's figures where they were", () => {
  it.each(INDUSTRIES.map((i) => i.id))("%s", (industry) => {
    const before = sampleFigures(industry);
    // Judging every finding not valid moves none of the pilot figures, because
    // the rule leaves those entries out.
    const judged = before.conflicts.map((c) => notValid(c.ruleId));
    const after = sampleFigures(industry, judged);
    expect(after.metrics.acceptedFindings).toBe(before.metrics.acceptedFindings);
    expect(after.metrics.actedOnFindings).toBe(before.metrics.actedOnFindings);
    expect(after.metrics.acceptanceRate).toBe(before.metrics.acceptanceRate);
    expect(after.metrics.openFindings).toBe(before.metrics.openFindings);
    expect(decisionsDue(after.decisions, "2026-10-01")).toEqual(
      decisionsDue(before.decisions, "2026-10-01"),
    );
  });

  it("counts the samples' decisions as before the rule moved", () => {
    let acceptedAcrossSamples = 0;
    for (const { id } of INDUSTRIES) {
      const { conflicts, decisions, metrics } = sampleFigures(id);
      const findings = conflicts.filter((c) => !c.ownerHeld);
      // The rule as it stood in firm/engagement.ts, before dispositions existed.
      const linked = (ruleId: string, kind: string) =>
        decisions.some((d) => d.kind === kind && d.linkedId === ruleId);
      const accepted = findings.filter((c) => linked(c.ruleId, "accept_residual")).length;
      expect(metrics.acceptedFindings).toBe(accepted);
      acceptedAcrossSamples += accepted;
      expect(metrics.acceptanceRate).toBe(findings.length ? accepted / findings.length : null);
    }
    // The samples carry findings, so the comparison is not vacuous.
    expect(acceptedAcrossSamples).toBeGreaterThan(0);
  });
});
