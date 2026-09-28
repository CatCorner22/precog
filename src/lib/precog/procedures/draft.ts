import type { GrokAccess } from "../llm/types";
import { maskLikelySecrets } from "./credential-guard";
import { PROCEDURE_LIMITS } from "./normalize";

/**
 * Turning the owner's rough notes ("open banking, pick checking, then match
 * each line to the statement...") into numbered steps. Grok does it when it
 * can (procedures/draft-server.ts); `draftLocally` is the offline answer and
 * the fallback, and only rearranges the owner's own words: it splits the
 * notes into one action per step, drops "then", "first" and "I usually", and
 * never adds anything the notes do not say.
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
  /** Why the task matters, or "" when the notes do not say. */
  purpose: string;
  prerequisites: string[];
  steps: string[];
}

/** The most notes one draft reads. */
export const DRAFT_NOTES_MAX = 2000;

/** A line that names something needed first: "Need: the bank login", "You'll need the deposit book". */
const PREREQUISITE =
  /^(?:you(?:'ll| will)? need|you need to have|need(?:ed)?|requires?|before you start|have ready|what you need)\b[\s:,-]*/i;
const BULLET = /^\s*(?:[-*•·>]+|\(?\d{1,2}[.):]|step\s+\d{1,2}\s*[.:)-]?)\s*/i;
const FILLER =
  /^(?:first(?:ly)?|second(?:ly)?|then|next|after that|afterwards|after this|finally|lastly|and|so|also|now|ok(?:ay)?)\b[\s,:-]*/i;
const SUBJECT =
  /^(?:(?:you|we|i|they)(?: then)?(?: (?:usually|always|normally|just|then))?(?: (?:need to|have to|should|must|will|can|go and|go to and))?|please)\s+(?=[a-z])/i;
/** Where one action ends and the next begins inside a sentence. */
const ACTION_BREAK = /\s*;\s*|,?\s+(?:and then|then|after that|afterwards)\s+/i;

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
    .split(/(?<=[.!?])\s+(?=[A-Za-z])/)
    .flatMap((s) => s.split(ACTION_BREAK))
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
