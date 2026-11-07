/**
 * The owner's answers to the blind-spot checks, as the profile stores them.
 * Depends on the id list only, so the profile normalizer never loads the
 * library text.
 */
import { isBlindSpotId } from "./ids";

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

/** Normalizes stored answers: known ids, known answers, a calendar day, newest kept. */
export function normalizeBlindSpotAnswers(
  value: unknown,
  isCalendarDate: (day: string) => boolean,
): BlindSpotRecord[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, BlindSpotRecord>();
  for (const entry of value.slice(0, MAX_STORED_BLIND_SPOT_RECORDS)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    if (!isBlindSpotId(raw.id)) continue;
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
  if (!isBlindSpotId(id)) return [...records];
  return [...records.filter((r) => r.id !== id), { id, answer, on }];
}
