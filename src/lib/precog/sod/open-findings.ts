import type { DualReleasePolicy } from "../controls/dual-release-policy";
import type { DetectedConflict } from "./detect";

/**
 * One definition of an open duty-conflict finding, shared by Start here and
 * the printed report so both count the same cases and quote the same median.
 *
 * A finding is open when the owner has not accepted the risk, the pair is not
 * the owner's own (an owner cannot steal from themselves), and dual release
 * does not close it at every amount. A pair dual release covers only above a
 * threshold stays open: below the threshold one person still acts alone.
 */
export function openFindings(
  conflicts: readonly DetectedConflict[],
  partial: ReadonlyMap<string, number>,
): DetectedConflict[] {
  return conflicts.filter(
    (c) =>
      !c.residualRiskAccepted && !c.ownerHeld && (!c.dualReleaseMitigated || partial.has(c.ruleId)),
  );
}

/** The distinct rules behind a list of findings, in first-seen order. */
export function ruleIdsOf(findings: readonly DetectedConflict[]): string[] {
  return [...new Set(findings.map((c) => c.ruleId))];
}

/**
 * Rules that dual release covers only above a threshold, with the lowest
 * threshold that applies: rule id to dollars. A rule any enabled channel
 * covers at every amount (threshold 0) is closed, so it is left out.
 */
export function partialDualReleaseCoverage(
  policy: DualReleasePolicy,
  conflicts: readonly DetectedConflict[],
): Map<string, number> {
  const partial = new Map<string, number>();
  if (!policy.enabled) return partial;
  const thresholdsByRule = new Map<string, number[]>();
  for (const rule of policy.rules) {
    if (!rule.enabled) continue;
    for (const id of rule.mitigatesRuleIds) {
      thresholdsByRule.set(id, [...(thresholdsByRule.get(id) ?? []), rule.thresholdUsd]);
    }
  }
  const mitigated = new Set(conflicts.filter((c) => c.dualReleaseMitigated).map((c) => c.ruleId));
  for (const [ruleId, thresholds] of thresholdsByRule) {
    if (mitigated.has(ruleId) && thresholds.length > 0 && thresholds.every((t) => t > 0)) {
      partial.set(ruleId, Math.min(...thresholds));
    }
  }
  return partial;
}
