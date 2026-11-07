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

export {
  BLIND_SPOT_ANSWERS,
  MAX_STORED_BLIND_SPOT_RECORDS,
  isBlindSpotAnswer,
  normalizeBlindSpotAnswers,
  withBlindSpotAnswer,
  type BlindSpotAnswer,
  type BlindSpotRecord,
} from "./answers";
import type { BlindSpotAnswer, BlindSpotRecord } from "./answers";

export type HeadcountSource = "setup" | "band" | "team";

export interface HeadcountBasis {
  count: number;
  /** An exact count from setup, the low end of a setup range, or the mapped team. */
  source: HeadcountSource;
  /** The setup range, when that is what the owner gave. */
  band?: string;
}

/** The low and high ends of a setup range such as "7-30" or "250+" (no high end). */
function bandBounds(band: string): { low: number; high?: number } {
  const [lowText, highText] = band.split("-");
  const low = Number.parseInt(lowText, 10);
  const high = highText === undefined ? undefined : Number.parseInt(highText, 10);
  return {
    low: Number.isFinite(low) ? low : 0,
    ...(high !== undefined && Number.isFinite(high) ? { high } : {}),
  };
}

/**
 * People on payroll: the exact setup count or the mapped team, whichever is
 * larger (a team that grew past its setup count counts as it is today); else
 * the low end of the setup range, if the mapped team is not larger.
 */
export function headcountBasis(profile: PracticeProfile): HeadcountBasis {
  const team = Math.max(0, Math.floor(profile.staff.teamSize));
  const facts = profile.onboardingFacts;
  const exact = facts?.workforceCount;
  if (typeof exact === "number" && Number.isFinite(exact) && exact > 0) {
    const count = Math.floor(exact);
    return count >= team ? { count, source: "setup" } : { count: team, source: "team" };
  }
  const bounds = facts?.workforceBand ? bandBounds(facts.workforceBand) : null;
  if (bounds && facts?.workforceBand && bounds.low > team) {
    return { count: bounds.low, source: "band", band: facts.workforceBand };
  }
  return { count: team, source: "team" };
}

export function headcountOf(profile: PracticeProfile): number {
  return headcountBasis(profile).count;
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
  headcountSource: HeadcountSource;
  /** The setup range the head count came from, when it did. */
  headcountBand?: string;
  tiers: { tier: BlindSpotTier; spots: SelectedBlindSpot[] }[];
  /** Thresholds at or below the head count, highest first. */
  crossed: HeadcountThreshold[];
  /** The next thresholds above the head count, nearest first. */
  ahead: HeadcountThreshold[];
  counts: { total: number; handled: number; notYet: number; unsure: number; open: number };
}

export function selectBlindSpots(profile: PracticeProfile): BlindSpotSelection {
  const basis = headcountBasis(profile);
  const headcount = basis.count;
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
  const thresholds = HEADCOUNT_THRESHOLDS.filter(
    (t) => !t.industries || t.industries.includes(profile.industry),
  );
  return {
    headcount,
    headcountSource: basis.source,
    ...(basis.band ? { headcountBand: basis.band } : {}),
    tiers,
    crossed: thresholds.filter((t) => t.at <= headcount).sort((a, b) => b.at - a.at),
    ahead: thresholds.filter((t) => t.at > headcount).sort((a, b) => a.at - b.at),
    counts: { total: all.length, handled, notYet, unsure, open: all.length - handled },
  };
}

/** "At 12 on payroll" for a count; "At 7 or more on payroll (7-30 at setup)" for a range. */
export function headcountPhrase(selection: BlindSpotSelection): string {
  const { headcount, headcountBand } = selection;
  return headcountBand
    ? `${headcount} or more on payroll (${headcountBand} at setup)`
    : `${headcount} on payroll`;
}

/** One sentence on where the head count sits against the next rule. */
export function nextThresholdLine(selection: BlindSpotSelection): string | null {
  const next = selection.ahead[0];
  if (!next) return null;
  if (selection.headcountBand) {
    const { high } = bandBounds(selection.headcountBand);
    const inRange = selection.ahead.filter((t) => high === undefined || t.at <= high);
    if (inRange.length > 0) {
      const ats = inRange.map((t) => `${t.at} (${t.rule})`);
      const list =
        ats.length === 1 ? ats[0] : `${ats.slice(0, -1).join(", ")} and ${ats[ats.length - 1]}`;
      return `At ${headcountPhrase(selection)}, the rules at ${list} may already apply; the exact head count on setup tells which.`;
    }
    return `At ${headcountPhrase(selection)}, the next rule starts at ${next.at}: ${next.rule}.`;
  }
  const gap = next.at - selection.headcount;
  const hires = gap === 1 ? "one more hire" : `${gap} more hires`;
  return `At ${headcountPhrase(selection)}, ${hires} switches on: ${next.rule}.`;
}
