import type { DualReleasePolicy } from "../controls/dual-release-policy";
import type { OpenSeverityCounts } from "../scoring/bands";
import { count, verb } from "../text";
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
export function openFindings<
  T extends Pick<
    DetectedConflict,
    "ruleId" | "ownerHeld" | "residualRiskAccepted" | "dualReleaseMitigated"
  >,
>(conflicts: readonly T[], partial: ReadonlyMap<string, number>): T[] {
  return conflicts.filter(
    (c) =>
      !c.residualRiskAccepted && !c.ownerHeld && (!c.dualReleaseMitigated || partial.has(c.ruleId)),
  );
}

/** Open critical and high findings, with how many of each dual release covers only above a threshold. */
export interface OpenSodCounts extends OpenSeverityCounts {
  criticalBelowThreshold: number;
  highBelowThreshold: number;
}

/**
 * The open critical and high findings among a team's conflicts, counted by
 * the rule above with the policy's partial dual-release coverage: what caps
 * the segregation band word (scoring/bands `segregationLevel`). The
 * detector's summary counts a pair dual release narrows as narrowed at any
 * threshold, so the below-threshold counts say why the two differ.
 */
export function openSeverityCounts(
  conflicts: readonly DetectedConflict[],
  policy: DualReleasePolicy,
): OpenSodCounts {
  const open = openFindings(conflicts, partialDualReleaseCoverage(policy, conflicts));
  const critical = open.filter((c) => c.severity === "critical");
  const high = open.filter((c) => c.severity === "high");
  // An open finding dual release narrows is one it covers only above a threshold.
  const below = (findings: DetectedConflict[]) => findings.filter((c) => c.dualReleaseMitigated);
  return {
    openCritical: critical.length,
    openHigh: high.length,
    criticalBelowThreshold: below(critical).length,
    highBelowThreshold: below(high).length,
  };
}

/**
 * The open findings behind the segregation band word, for the hint beside the
 * index: the critical ones, or the high ones while no critical one is open.
 * Counted as the cap counts them, so the hint and the word agree.
 */
export function openSodHint(open: OpenSodCounts): string {
  return open.openCritical > 0 || open.openHigh === 0
    ? count(open.openCritical, "open critical duty conflict")
    : count(open.openHigh, "open high duty conflict");
}

/**
 * Why the band word counts a conflict as open that the duty-conflict screen
 * lists as narrowed by dual release: dual release covers it only above a
 * threshold. Null when no such conflict sets the word.
 */
export function belowThresholdNote(open: OpenSodCounts): string | null {
  const critical = open.openCritical > 0;
  const n = critical ? open.criticalBelowThreshold : open.highBelowThreshold;
  if (n === 0) return null;
  return `Dual release covers ${count(n, `${critical ? "critical" : "high"} duty conflict`)} only above a threshold. Below the threshold one person still acts alone, so ${verb(n, "it counts", "they count")} as open.`;
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
