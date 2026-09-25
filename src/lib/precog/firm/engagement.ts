import { isDemoName } from "../industry";
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
  openFindings: number;
  acceptedFindings: number;
  /** Accepted responses divided by accepted plus still-open conflicts. Null when there is nothing to judge. */
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

/**
 * A finding counts as accepted when the owner logged a decision about it:
 * accept, remediate, monitor, or insure. Open conflicts are whatever the
 * detector still reports.
 */
const ACCEPTED_KINDS = new Set(["accept_residual", "remediate", "monitor", "insure"]);

/** A logged accept, remediate, monitor, or insure decision is a response to a finding. */
function acceptedFindingCount(decisions: readonly { kind: string }[]): number {
  return decisions.filter((d) => ACCEPTED_KINDS.has(d.kind)).length;
}

export function pilotMetrics(input: {
  engagement?: EngagementStamp;
  openFindings: number;
  decisions: readonly { kind: string }[];
}): PilotMetrics {
  const acceptedFindings = acceptedFindingCount(input.decisions);
  const openFindings = Math.max(0, Math.round(input.openFindings));
  const denom = acceptedFindings + openFindings;
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
    acceptanceRate: denom === 0 ? null : acceptedFindings / denom,
  };
}

/** Fill a missing start or map-complete stamp. Existing stamps stay. */
export function advanceEngagement(
  current: EngagementStamp | undefined,
  input: { now: string; people: readonly Person[] | null | undefined; ownTeam: boolean },
): EngagementStamp | undefined {
  let startedAt = current?.startedAt;
  let mapCompletedAt = current?.mapCompletedAt;
  if (input.ownTeam && !startedAt) startedAt = input.now;
  if (input.ownTeam && mapIsComplete(input.people) && !mapCompletedAt) {
    mapCompletedAt = input.now;
  }
  if (startedAt === current?.startedAt && mapCompletedAt === current?.mapCompletedAt)
    return current;
  return { ...current, startedAt, mapCompletedAt };
}
