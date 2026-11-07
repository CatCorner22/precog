/**
 * Which blind spots a business sees, and where its head count stands against
 * the thresholds. Pure functions over the profile, so the Start here section
 * and the tests read the same list.
 */
import type { PracticeProfile } from "../practice-profile";
import {
  BLIND_SPOTS,
  HEADCOUNT_THRESHOLDS,
  TIER_ORDER,
  type BlindSpot,
  type BlindSpotTier,
  type HeadcountThreshold,
} from "./library";

export const BLIND_SPOT_ANSWERS = ["handled", "not_yet", "unsure"] as const;
export type BlindSpotAnswer = (typeof BLIND_SPOT_ANSWERS)[number];

export function isBlindSpotAnswer(value: unknown): value is BlindSpotAnswer {
  return typeof value === "string" && (BLIND_SPOT_ANSWERS as readonly string[]).includes(value);
}

/** The owner's answer to one blind spot's check question, dated. */
export interface BlindSpotRecord {
  id: string;
  answer: BlindSpotAnswer;
  /** Calendar day the answer was given. */
  on: string;
}

export const MAX_STORED_BLIND_SPOT_RECORDS = 200;

/** People on payroll: the onboarding head count when given, else the mapped team. */
export function headcountOf(profile: PracticeProfile): number {
  const workforce = profile.onboardingFacts?.workforceCount;
  if (typeof workforce === "number" && Number.isFinite(workforce) && workforce > 0) {
    return Math.floor(workforce);
  }
  return Math.max(0, Math.floor(profile.staff.teamSize));
}

export function appliesTo(spot: BlindSpot, profile: PracticeProfile, headcount: number): boolean {
  if (spot.industries && !spot.industries.includes(profile.industry)) return false;
  if (spot.minHeadcount !== undefined && headcount < spot.minHeadcount) return false;
  return true;
}

export interface SelectedBlindSpot {
  spot: BlindSpot;
  record?: BlindSpotRecord;
}

export interface BlindSpotSelection {
  headcount: number;
  tiers: { tier: BlindSpotTier; spots: SelectedBlindSpot[] }[];
  /** Thresholds at or below the head count, highest first. */
  crossed: HeadcountThreshold[];
  /** The next thresholds above the head count, nearest first. */
  ahead: HeadcountThreshold[];
  counts: { total: number; handled: number; notYet: number; unsure: number; open: number };
}

export function selectBlindSpots(profile: PracticeProfile): BlindSpotSelection {
  const headcount = headcountOf(profile);
  const records = new Map((profile.blindSpotAnswers ?? []).map((r) => [r.id, r]));
  const tiers = TIER_ORDER.map((tier) => ({
    tier,
    spots: BLIND_SPOTS.filter((s) => s.tier === tier && appliesTo(s, profile, headcount)).map(
      (spot) => ({ spot, record: records.get(spot.id) }),
    ),
  })).filter((t) => t.spots.length > 0);
  const all = tiers.flatMap((t) => t.spots);
  const count = (answer: BlindSpotAnswer) => all.filter((s) => s.record?.answer === answer).length;
  const handled = count("handled");
  const notYet = count("not_yet");
  const unsure = count("unsure");
  return {
    headcount,
    tiers,
    crossed: HEADCOUNT_THRESHOLDS.filter((t) => t.at <= headcount).sort((a, b) => b.at - a.at),
    ahead: HEADCOUNT_THRESHOLDS.filter((t) => t.at > headcount).sort((a, b) => a.at - b.at),
    counts: { total: all.length, handled, notYet, unsure, open: all.length - handled },
  };
}

/** One sentence on where the head count sits against the next rule. */
export function nextThresholdLine(selection: BlindSpotSelection): string | null {
  const next = selection.ahead[0];
  if (!next) return null;
  const gap = next.at - selection.headcount;
  const hires = gap === 1 ? "one more hire" : `${gap} more hires`;
  return `At ${selection.headcount} on payroll, ${hires} switches on: ${next.rule}.`;
}

/** Normalizes stored answers: known ids, known answers, a calendar day, newest kept. */
export function normalizeBlindSpotAnswers(
  value: unknown,
  isCalendarDate: (day: string) => boolean,
): BlindSpotRecord[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(BLIND_SPOTS.map((s) => s.id));
  const byId = new Map<string, BlindSpotRecord>();
  for (const entry of value.slice(0, MAX_STORED_BLIND_SPOT_RECORDS)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || !known.has(raw.id)) continue;
    if (!isBlindSpotAnswer(raw.answer)) continue;
    if (typeof raw.on !== "string" || !isCalendarDate(raw.on)) continue;
    byId.set(raw.id, { id: raw.id, answer: raw.answer, on: raw.on });
  }
  return [...byId.values()];
}

/** The answers with one replaced or added. */
export function withBlindSpotAnswer(
  records: readonly BlindSpotRecord[],
  id: string,
  answer: BlindSpotAnswer,
  on: string,
): BlindSpotRecord[] {
  if (!BLIND_SPOTS.some((s) => s.id === id)) return [...records];
  return [...records.filter((r) => r.id !== id), { id, answer, on }];
}
