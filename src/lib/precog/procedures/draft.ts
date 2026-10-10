import type { DailyLimitInfo, GrokAccess } from "../llm/types";
import { maskLikelySecrets } from "./credential-guard";
import { PROCEDURE_LIMITS } from "./normalize";

/**
 * Turning the owner's rough notes ("open banking, pick checking, then match
 * each line to the statement...") into numbered steps. `draftLocally` is the
 * draft the owner reads: it splits the notes into one action per step, drops
 * "then", "first" and "I usually", and never adds anything the notes do not
 * say. Precog does not send these notes to a model.
 */

export interface ProcedureDraftInput {
  title: string;
  /** The platform or physical place, by name. */
  placeName: string;
  module: string;
  notes: string;
  industryLabel: string;
}

export interface ProcedureDraft {
  source: "grok" | "local";
  model?: string;
  grokStatus?: GrokAccess;
  /** Which daily ceiling was met, when grokStatus is "daily_limit". */
  dailyLimit?: DailyLimitInfo;
  /** Why the task matters, or "" when the notes do not say. */
  purpose: string;
  prerequisites: string[];
  steps: string[];
}

/** The most notes one draft reads. */
export const DRAFT_NOTES_MAX = 2000;

/**
 * A line that names something needed first: "Need: the bank login", "You'll
 * need the deposit book". "Need to open Banking" is an action, not a
 * prerequisite, so "need" followed by "to" does not count (except "need to
 * have", which names a thing).
 */
const PREREQUISITE =
  /^(?:(?:you(?:'ll| will)? )?need(?:ed)? to have|(?:you(?:'ll| will)? )?need(?:ed)?(?!\s+to\b)|requires?|before you start|have ready|what you need)\b[\s:,-]*/i;
const BULLET = /^\s*(?:[-*•·>]+|\(?\d{1,2}[.):]|step\s+\d{1,2}\s*[.:)-]?)\s*/i;
// Followed by a space, comma or colon, so "Next-day" and "Second-shift" are kept whole.
const FILLER =
  /^(?:first(?:ly)?|second(?:ly)?|then|next|after that|afterwards|after this|finally|lastly|and|so|also|now|ok(?:ay)?)(?=[\s,:]|$)[\s,:-]*/i;
const SUBJECT =
  /^(?:(?:you|we|i|they)(?: then)?(?: (?:usually|always|normally|just|then))?(?: (?:need to|have to|should|must|will|can|go and|go to and))?|please|need to|have to|must)\s+(?=[a-z])/i;
/** Where one action ends and the next begins inside a sentence. */
const ACTION_BREAK = /\s*;\s*|,?\s+(?:and then|then|after that|afterwards)\s+/i;
/** A sentence whose "then" joins a condition to its action, which must stay one step. */
const CONDITION = /^(?:if|when|whenever|once|unless|only if|in case)\b/i;
/** Where a sentence ends: a full stop before a capital, but not after "Dr." or "a.m.". */
const SENTENCE_END =
  /(?<=[.!?])(?<!\b(?:Dr|Mr|Mrs|Ms|St|Jr|Sr|No|vs|etc|e\.g|i\.e|a\.m|p\.m|approx|dept|ext)\.)\s+(?=[A-Z])/;

/** Numbered steps, a purpose and prerequisites from the owner's own words. */
export function draftLocally(input: Pick<ProcedureDraftInput, "notes">): ProcedureDraft {
  const prerequisites: string[] = [];
  const steps: string[] = [];
  for (const line of input.notes.slice(0, DRAFT_NOTES_MAX).split(/\r?\n/)) {
    const bare = line.replace(BULLET, "").trim();
    if (!bare) continue;
    if (PREREQUISITE.test(bare)) {
      const needed = sentence(bare.replace(PREREQUISITE, ""), PROCEDURE_LIMITS.prerequisite);
      if (needed) prerequisites.push(needed.replace(/\.$/, ""));
      continue;
    }
    for (const part of splitActions(bare)) {
      const step = sentence(part, PROCEDURE_LIMITS.stepText);
      if (step && step !== steps[steps.length - 1]) steps.push(step);
    }
  }
  return {
    source: "local",
    purpose: "",
    prerequisites: [...new Set(prerequisites)].slice(0, PROCEDURE_LIMITS.prerequisites),
    steps: steps.slice(0, PROCEDURE_LIMITS.steps),
  };
}

/** One line of notes split into its sentences, then each sentence into its actions. */
function splitActions(line: string): string[] {
  return line
    .split(SENTENCE_END)
    .flatMap((s) => (CONDITION.test(s.trim()) ? s.split(/\s*;\s*/) : s.split(ACTION_BREAK)))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * One cleaned action: leading filler and "I usually" removed, likely secrets
 * masked, first letter capitalised, ending in a full stop, cut to `max`.
 * Empty when fewer than three characters are left.
 */
export function sentence(value: string, max: number): string {
  let s = value.trim();
  for (let i = 0; i < 4; i++) {
    const next = s.replace(FILLER, "").replace(SUBJECT, "").trim();
    if (next === s) break;
    s = next;
  }
  s = maskLikelySecrets(s)
    .replace(/\s+/g, " ")
    .replace(/[,;:\s-]+$/, "");
  if (s.replace(/[^A-Za-z0-9]/g, "").length < 3) return "";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?)"']$/.test(s)) s += ".";
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
