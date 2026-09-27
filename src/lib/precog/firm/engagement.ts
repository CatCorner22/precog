import { isDemoName } from "../industry";
import { linkedToIndustry } from "../decisions/follow-through";
import type { DecisionEntry } from "../practice-profile";
import type { DetectedConflict } from "../sod/detect";
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

interface PilotMetrics {
  startedAt: string | null;
  mapCompletedAt: string | null;
  /** Whole hours from start to a complete map; null until both stamps exist. */
  hoursToMap: number | null;
  reportSent: boolean;
  reportSentAt: string | null;
  openFindings: number;
  acceptedFindings: number;
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
  "ruleId" | "linkedControlId" | "residualRiskAccepted" | "dualReleaseMitigated"
>;

/** What the pilot metrics read from a logged decision. */
type MetricDecision = Pick<DecisionEntry, "kind" | "linkedId" | "linkedIndustry">;

/**
 * Findings are the detected conflicts. One counts as accepted once the owner
 * has responded to it: residual risk accepted, dual release covering it, or
 * an accept, remediate, monitor or insure decision logged against its rule
 * or control. Open conflicts are the rest, so accepted plus open is every
 * finding and the rate can reach 100%.
 */
export function pilotMetrics(input: {
  engagement?: EngagementStamp;
  conflicts: readonly MetricConflict[];
  decisions: readonly MetricDecision[];
  industry: IndustryId;
}): PilotMetrics {
  const acceptedFindings = input.conflicts.filter((c) =>
    findingAnswered(c, input.decisions, input.industry),
  ).length;
  const openFindings = input.conflicts.length - acceptedFindings;
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
    acceptanceRate: input.conflicts.length === 0 ? null : acceptedFindings / input.conflicts.length,
  };
}

const ACCEPTED_KINDS = new Set<string>(["accept_residual", "remediate", "monitor", "insure"]);

function findingAnswered(
  conflict: MetricConflict,
  decisions: readonly MetricDecision[],
  industry: IndustryId,
): boolean {
  if (conflict.residualRiskAccepted || conflict.dualReleaseMitigated) return true;
  return decisions.some(
    (d) =>
      ACCEPTED_KINDS.has(d.kind) &&
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
