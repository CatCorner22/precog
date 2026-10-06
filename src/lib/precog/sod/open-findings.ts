import type { DualReleasePolicy } from "../controls/dual-release-policy";
import type { OpenSeverityCounts } from "../scoring/bands";
import { count, verb } from "../text";
import type { DetectedConflict } from "./detect";

/**
 * The one definition of an open duty-conflict finding. The detector's summary
 * counts, the duty-conflict tiles, Start here, the printed report, the coach
 * and the AI's case evidence all count through it, so every screen gives the
 * same number.
 *
 * A finding is open when the pair is not the owner's own (an owner cannot
 * steal from themselves) and dual release does not close it at every amount.
 * A pair dual release covers only above a threshold stays open: below the
 * threshold one person still acts alone. Accepting the risk records a
 * decision; it never closes a finding, so an accepted finding stays open.
 */
export function openFindings<
  T extends Pick<DetectedConflict, "ruleId" | "ownerHeld" | "dualReleaseMitigated">,
>(conflicts: readonly T[], partial: ReadonlyMap<string, number>): T[] {
  return conflicts.filter(
    (c) => !c.ownerHeld && (!c.dualReleaseMitigated || partial.has(c.ruleId)),
  );
}

/**
 * Where a finding stands, in the words the report's status column prints. A
 * pair dual release covers only above a threshold reads "Reduced, not
 * closed", as its Start here badge does, and an accepted finding stays open
 * and says so. The data holds no date for an acceptance yet, so the status
 * names none.
 */
export function conflictStatus(
  c: Pick<
    DetectedConflict,
    "ruleId" | "ownerHeld" | "residualRiskAccepted" | "dualReleaseMitigated"
  >,
  partial: ReadonlyMap<string, number>,
): string {
  if (c.ownerHeld) return "Owner's own duties";
  if (c.dualReleaseMitigated && !partial.has(c.ruleId)) return "Covered by dual release";
  if (c.dualReleaseMitigated) {
    return c.residualRiskAccepted ? "Reduced, not closed; risk accepted" : "Reduced, not closed";
  }
  return c.residualRiskAccepted ? "Open, risk accepted" : "Open";
}

/**
 * The findings dual release touches, split as the status column reads them:
 * covered at every amount ("Covered by dual release"), or reduced but still
 * open because one person acts alone below the threshold ("Reduced, not
 * closed"). `reduced` is part of the open count; `closed` is not. An owner's
 * own pair reads "Owner's own duties" whatever dual release covers, so it is
 * in neither: the executive summary counts it apart, and the duty-conflict
 * section's count agrees with it.
 */
export function dualReleaseSplit(
  conflicts: readonly Pick<DetectedConflict, "ruleId" | "ownerHeld" | "dualReleaseMitigated">[],
  partial: ReadonlyMap<string, number>,
): { closed: number; reduced: number } {
  const touched = conflicts.filter((c) => c.dualReleaseMitigated && !c.ownerHeld);
  return {
    closed: touched.filter((c) => !partial.has(c.ruleId)).length,
    reduced: touched.filter((c) => partial.has(c.ruleId)).length,
  };
}

/** Open critical and high findings, with how many of each dual release covers only above a threshold. */
export interface OpenSodCounts extends OpenSeverityCounts {
  criticalBelowThreshold: number;
  highBelowThreshold: number;
}

/**
 * The open critical and high findings among a team's conflicts, counted by
 * the rule above with the policy's partial dual-release coverage: what caps
 * the segregation band word (scoring/bands `segregationLevel`). They equal
 * the detector's summary counts; the below-threshold counts say how many of
 * them the duty-conflict screen also lists as narrowed by dual release.
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
  conflicts: readonly Pick<DetectedConflict, "ruleId" | "dualReleaseMitigated">[],
): Map<string, number> {
  const mitigated = new Set(conflicts.filter((c) => c.dualReleaseMitigated).map((c) => c.ruleId));
  return new Map([...thresholdCoverage(policy)].filter(([ruleId]) => mitigated.has(ruleId)));
}

/**
 * The same rules read from the policy alone, before any conflict is found:
 * what the detector's summary counts with. `openFindings` asks about a rule
 * only for a pair dual release narrows, so both maps give the same findings.
 */
export function thresholdCoverage(policy: DualReleasePolicy): Map<string, number> {
  const partial = new Map<string, number>();
  if (!policy.enabled) return partial;
  const thresholdsByRule = new Map<string, number[]>();
  for (const rule of policy.rules) {
    if (!rule.enabled) continue;
    for (const id of rule.mitigatesRuleIds) {
      thresholdsByRule.set(id, [...(thresholdsByRule.get(id) ?? []), rule.thresholdUsd]);
    }
  }
  for (const [ruleId, thresholds] of thresholdsByRule) {
    if (thresholds.length > 0 && thresholds.every((t) => t > 0)) {
      partial.set(ruleId, Math.min(...thresholds));
    }
  }
  return partial;
}
