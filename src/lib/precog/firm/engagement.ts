import { isDemoName } from "../industry";
import { csvCell } from "../import/csv";
import { linkedToIndustry } from "../decisions/follow-through";
import type { DecisionEntry } from "../practice-profile";
import type { DetectedConflict } from "../sod/detect";
import { openFindings as sharedOpenFindings } from "../sod/open-findings";
import type { IndustryId } from "../industry";
import type { Person } from "../types";

/** True when this profile is the owner's team rather than an industry sample. */
export function isOwnTeam(profile: {
  customPeople?: readonly Person[] | null;
  practiceName: string;
}): boolean {
  return Boolean(profile.customPeople?.length) && !isDemoName(profile.practiceName);
}

/** Stamps that measure a pilot engagement. Once set, a stamp is not cleared. */
export interface EngagementStamp {
  startedAt?: string;
  mapCompletedAt?: string;
  reportSentAt?: string;
}

export interface PilotMetrics {
  startedAt: string | null;
  mapCompletedAt: string | null;
  /** Whole hours from start to a complete map; null until both stamps exist. */
  hoursToMap: number | null;
  reportSent: boolean;
  reportSentAt: string | null;
  /** Findings open as Start here and the report count them. A decision of any kind does not close one. */
  openFindings: number;
  /** Findings with an explicit "accept residual" decision logged against them. They stay open. */
  acceptedFindings: number;
  /**
   * Findings acted on without an acceptance: closed by dual release at every
   * amount, or carrying a remediate, monitor or insure decision.
   */
  actedOnFindings: number;
  /** Accepted findings divided by every finding. Null when there is nothing to judge. */
  acceptanceRate: number | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;

function stamp(value: unknown): string | undefined {
  return typeof value === "string" && ISO.test(value) ? value.slice(0, 40) : undefined;
}

export function normalizeEngagement(value: unknown): EngagementStamp | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const startedAt = stamp(raw.startedAt);
  const mapCompletedAt = stamp(raw.mapCompletedAt);
  const reportSentAt = stamp(raw.reportSentAt);
  if (!startedAt && !mapCompletedAt && !reportSentAt) return undefined;
  return { startedAt, mapCompletedAt, reportSentAt };
}

/** CSV export for design-partner pilot reviews. */
export function pilotMetricsCsv(businessName: string, metrics: PilotMetrics): string {
  const row = (label: string, value: string | number | null) =>
    `${csvCell(label)},${csvCell(value === null ? "" : String(value))}`;
  return [
    row("business", businessName),
    row("startedAt", metrics.startedAt),
    row("mapCompletedAt", metrics.mapCompletedAt),
    row("hoursToMap", metrics.hoursToMap),
    row("reportSent", metrics.reportSent ? "yes" : "no"),
    row("reportSentAt", metrics.reportSentAt),
    row("openFindings", metrics.openFindings),
    row("acceptedFindings", metrics.acceptedFindings),
    row("actedOnFindings", metrics.actedOnFindings),
    row("acceptanceRate", metrics.acceptanceRate === null ? "" : metrics.acceptanceRate.toFixed(3)),
  ].join("\n");
}

/** A map is complete once two named, active people each hold at least one duty. */
export function mapIsComplete(people: readonly Person[] | null | undefined): boolean {
  if (!people) return false;
  const ready = people.filter(
    (p) => p.active !== false && p.name.trim().length > 0 && (p.entitlements?.length ?? 0) > 0,
  );
  return ready.length >= 2;
}

/** What the pilot metrics read from a detected conflict. */
type MetricConflict = Pick<
  DetectedConflict,
  "ruleId" | "linkedControlId" | "ownerHeld" | "residualRiskAccepted" | "dualReleaseMitigated"
>;

/** What the pilot metrics read from a logged decision. */
type MetricDecision = Pick<DecisionEntry, "kind" | "linkedId" | "linkedIndustry">;

/**
 * Findings are the detected conflicts other than the owner's own pairs, which
 * are no theft risk to judge. Open is the count Start here and the report
 * show (sod/open-findings); no decision closes a finding, an acceptance
 * included. Accepted counts only findings with an explicit "accept residual"
 * decision logged against their rule or control. Acted on counts the others
 * that something answered: dual release closes them at every amount, or a
 * remediate, monitor or insure decision is logged against them. A finding is
 * in at most one of accepted and acted on.
 */
export function pilotMetrics(input: {
  engagement?: EngagementStamp;
  conflicts: readonly MetricConflict[];
  /** Rules dual release covers only above a threshold (`partialDualReleaseCoverage`). */
  partialCoverage: ReadonlyMap<string, number>;
  decisions: readonly MetricDecision[];
  industry: IndustryId;
}): PilotMetrics {
  const all = input.conflicts.filter((c) => !c.ownerHeld);
  const findings = all.length;
  const decided = (c: MetricConflict, kinds: ReadonlySet<string>) =>
    decidedOn(c, kinds, input.decisions, input.industry);
  const accepted = all.filter((c) => decided(c, ACCEPT_KINDS));
  const dualReleaseCloses = (c: MetricConflict) =>
    c.dualReleaseMitigated && !input.partialCoverage.has(c.ruleId);
  const actedOn = all.filter(
    (c) => !decided(c, ACCEPT_KINDS) && (dualReleaseCloses(c) || decided(c, ACTED_ON_KINDS)),
  );
  const openFindings = sharedOpenFindings(input.conflicts, input.partialCoverage).length;
  const acceptedFindings = accepted.length;
  const started = input.engagement?.startedAt ? Date.parse(input.engagement.startedAt) : NaN;
  const completed = input.engagement?.mapCompletedAt
    ? Date.parse(input.engagement.mapCompletedAt)
    : NaN;
  const hoursToMap =
    Number.isFinite(started) && Number.isFinite(completed) && completed >= started
      ? Math.round((completed - started) / 3_600_000)
      : null;
  return {
    startedAt: input.engagement?.startedAt ?? null,
    mapCompletedAt: input.engagement?.mapCompletedAt ?? null,
    hoursToMap,
    reportSent: Boolean(input.engagement?.reportSentAt),
    reportSentAt: input.engagement?.reportSentAt ?? null,
    openFindings,
    acceptedFindings,
    actedOnFindings: actedOn.length,
    acceptanceRate: findings === 0 ? null : acceptedFindings / findings,
  };
}

const ACCEPT_KINDS: ReadonlySet<string> = new Set(["accept_residual"]);
const ACTED_ON_KINDS: ReadonlySet<string> = new Set(["remediate", "monitor", "insure"]);

/** A decision of one of `kinds` is logged against the finding's rule or control, under this industry. */
function decidedOn(
  conflict: MetricConflict,
  kinds: ReadonlySet<string>,
  decisions: readonly MetricDecision[],
  industry: IndustryId,
): boolean {
  return decisions.some(
    (d) =>
      kinds.has(d.kind) &&
      Boolean(d.linkedId) &&
      linkedToIndustry(d, industry) &&
      (d.linkedId === conflict.ruleId || d.linkedId === conflict.linkedControlId),
  );
}

/**
 * Fill a missing start or map-complete stamp. Existing stamps stay. Setup
 * stamps the start; a business that reaches this without one gets it here
 * only while its map is still incomplete, because a start stamped after the
 * map was finished would report a map built in no time.
 */
export function advanceEngagement(
  current: EngagementStamp | undefined,
  input: { now: string; people: readonly Person[] | null | undefined; ownTeam: boolean },
): EngagementStamp | undefined {
  let startedAt = current?.startedAt;
  let mapCompletedAt = current?.mapCompletedAt;
  const complete = mapIsComplete(input.people);
  if (input.ownTeam && !startedAt && !complete && !mapCompletedAt) startedAt = input.now;
  if (input.ownTeam && complete && !mapCompletedAt) mapCompletedAt = input.now;
  if (startedAt === current?.startedAt && mapCompletedAt === current?.mapCompletedAt)
    return current;
  return { ...current, startedAt, mapCompletedAt };
}
