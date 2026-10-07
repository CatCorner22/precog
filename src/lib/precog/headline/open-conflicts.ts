import { decidedOn } from "../decisions/decided-on";
import type { IndustryId } from "../industry";
import type { DecisionEntry } from "../practice-profile";
import type { DetectedConflict } from "../sod/detect";
import { dualReleaseSplit, openFindings } from "../sod/open-findings";

/** The parts of a finding the headline reads. */
type HeadlineFinding = Pick<
  DetectedConflict,
  "ruleId" | "severity" | "ownerHeld" | "dualReleaseMitigated" | "residualRiskAccepted"
> &
  Partial<Pick<DetectedConflict, "id">>;

/**
 * Every figure a screen prints about open duty conflicts, counted once
 * through sod/open-findings `openFindings`. Start here, the report, the
 * duty-conflict screen and the firm's client list read this one model, so a
 * reader never meets two numbers for the same thing.
 */
export interface OpenConflictHeadline<T extends HeadlineFinding = DetectedConflict> {
  /** The open findings themselves, one row each, as the report's conflict table lists them. */
  findings: T[];
  /** How many findings are open: the one denominator every count uses. */
  open: number;
  critical: number;
  high: number;
  medium: number;
  /** Findings on two duties of one family ("Related duties"). */
  family: number;
  /** Open findings neither critical nor high: medium and related duties. */
  other: number;
  /** Open findings dual release covers only above a threshold: part of `open`. */
  reducedNotClosed: number;
  /** Open findings whose risk the business accepted, by setting or by a logged decision: part of `open`. */
  acceptedOpen: number;
  /** Pairs the sole owner holds: listed apart, never in `open`. */
  ownerHeld: number;
  /** Staff pairs dual release covers at every amount: never in `open`. */
  closedByDualRelease: number;
}

/**
 * The open duty conflicts among a detection report's findings, with their
 * breakdown. `partial` is the rules dual release covers only above a
 * threshold (sod/open-findings `partialDualReleaseCoverage`); `acceptedOn`
 * holds the dated acceptance decisions by finding id (`acceptanceDates`).
 */
export function openConflictHeadline<T extends HeadlineFinding>(
  report: { conflicts: readonly T[] },
  partial: ReadonlyMap<string, number>,
  acceptedOn: ReadonlyMap<string, string> = new Map(),
): OpenConflictHeadline<T> {
  const findings = openFindings(report.conflicts, partial);
  const bySeverity = (s: DetectedConflict["severity"]) =>
    findings.filter((c) => c.severity === s).length;
  const critical = bySeverity("critical");
  const high = bySeverity("high");
  const split = dualReleaseSplit(report.conflicts, partial);
  return {
    findings,
    open: findings.length,
    critical,
    high,
    medium: bySeverity("medium"),
    family: bySeverity("family"),
    other: findings.length - critical - high,
    reducedNotClosed: split.reduced,
    acceptedOpen: findings.filter(
      (c) => c.residualRiskAccepted || (c.id !== undefined && acceptedOn.has(c.id)),
    ).length,
    ownerHeld: report.conflicts.filter((c) => c.ownerHeld).length,
    closedByDualRelease: split.closed,
  };
}

const ACCEPT_KINDS: ReadonlySet<string> = new Set(["accept_residual"]);

/**
 * The day each finding's risk was accepted: the newest "accept residual"
 * decision logged against its rule or control (decisions/decided-on), as a
 * calendar day, keyed by finding id. A finding with no such decision has no
 * entry, whatever its control's setting says.
 */
export function acceptanceDates(
  conflicts: readonly Pick<DetectedConflict, "id" | "ruleId" | "linkedControlId">[],
  decisions: readonly DecisionEntry[],
  industry: IndustryId,
): Map<string, string> {
  // The newest acceptance logged against each rule or control id, in one
  // pass. decidedOn, given the decision's own link as the rule, checks all but
  // the link; a finding then takes the newer of its rule's and its control's.
  const newestOn = new Map<string, string>();
  for (const d of decisions) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(d.createdAt) || !d.linkedId) continue;
    if (!decidedOn({ ruleId: d.linkedId }, ACCEPT_KINDS, [d], industry)) continue;
    if (d.createdAt > (newestOn.get(d.linkedId) ?? "")) newestOn.set(d.linkedId, d.createdAt);
  }
  const dates = new Map<string, string>();
  for (const finding of conflicts) {
    const byRule = newestOn.get(finding.ruleId) ?? "";
    const byControl = (finding.linkedControlId && newestOn.get(finding.linkedControlId)) || "";
    const newest = byControl > byRule ? byControl : byRule;
    if (newest) dates.set(finding.id, newest.slice(0, 10));
  }
  return dates;
}
