import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import { scoreAllResidualRisks } from "./residual-engine";
import { rawConflictScore, segregationPressure } from "../sod/score";

const template = getIndustryTemplate("dental");
const control = template.controls[0];
function score(notes: string[], segregated = false, accepted = false) {
  const scores = scoreAllResidualRisks({
    ...template,
    controls: [
      {
        ...control,
        starter: false,
        segregated,
        compensatingControls: notes,
        residualRiskAccepted: accepted,
      },
    ],
  });
  return scores.find((s) => s.linkedControlId === control.id)!;
}
const conflict = {
  severity: "high" as const,
  pair: ["create_vendor", "release_payment"] as const,
  accepted: false,
  controlsInPlace: 0,
  dualMitigated: false,
};

describe("control judgments do not reward paperwork or acceptance", () => {
  it("adding free-text measures does not establish operating effectiveness", () => {
    expect(score(["We review payments"]).controlEffectiveness).toBe(score([]).controlEffectiveness);
    expect(score(["We review payments"]).residual).toBe(score([]).residual);
  });
  it("duplicating or adding irrelevant notes cannot reduce residual risk", () => {
    const baseline = score(["Owner reads report"]);
    expect(score(["Owner reads report", "Owner reads report", "Nice office"]).residual).toBe(
      baseline.residual,
    );
  });
  it("keeping explanatory notes does not claim that the measures are tested", () => {
    const row = score(["Owner reads report"]);
    expect(row.drivers.some((d) => /not verified/i.test(d.detail))).toBe(true);
  });
  it("segregation changes the control assessment, not the inherent exposure", () => {
    expect(score([], true).inherent).toBe(score([], false).inherent);
    expect(score([], true).controlEffectiveness).toBeGreaterThan(
      score([], false).controlEffectiveness,
    );
  });
  it("accepting a duty conflict does not lower its score", () => {
    expect(rawConflictScore({ ...conflict, accepted: true })).toBe(rawConflictScore(conflict));
  });
  it("a count of unverified text measures cannot lower a duty-conflict score", () => {
    expect(rawConflictScore({ ...conflict, controlsInPlace: 12 })).toBe(rawConflictScore(conflict));
  });
  it("acceptance does not reduce the team's conflict-pressure index", () => {
    const finding = {
      severity: "high" as const,
      ruleId: "r",
      entitlementA: "create_vendor" as const,
      entitlementB: "release_payment" as const,
      ownerHeld: false,
      residualRiskAccepted: false,
      dualReleaseMitigated: false,
    };
    expect(segregationPressure([{ ...finding, residualRiskAccepted: true }])).toBe(
      segregationPressure([finding]),
    );
  });
});
