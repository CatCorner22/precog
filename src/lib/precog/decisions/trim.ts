import type { IndustryId } from "../industry";
import type { DecisionEntry } from "../practice-profile";

/** The parts of a journal entry the trim reads. */
export type TrimmableDecision = Pick<
  DecisionEntry,
  "kind" | "linkedId" | "linkedIndustry" | "disposition"
>;

/**
 * Whether the trim keeps this entry whatever its age: it links to a finding
 * of the business's current industry (templates reuse ids, so a link made
 * under another industry points at no current finding), it judges a finding
 * not valid, or it accepts a risk. Without `industry`, every link counts.
 */
export function decisionStaysOnTrim(entry: TrimmableDecision, industry?: IndustryId): boolean {
  if (entry.kind === "accept_residual") return true;
  if (entry.disposition?.verdict === "not_valid") return true;
  if (!entry.linkedId) return false;
  return !industry || !entry.linkedIndustry || entry.linkedIndustry === industry;
}

/**
 * The journal (newest first) cut to `cap` entries. The oldest entries that
 * no current finding uses go first; an entry `decisionStaysOnTrim` keeps goes
 * only when those alone still exceed `cap`, oldest first again. `dropped` is
 * how many entries went, so the caller can tell the owner.
 */
export function trimDecisions<T extends TrimmableDecision>(
  entries: readonly T[],
  cap: number,
  industry?: IndustryId,
): { kept: T[]; dropped: number } {
  const limit = Math.max(0, Math.floor(cap));
  if (entries.length <= limit) return { kept: [...entries], dropped: 0 };
  const stays = entries.map((entry) => decisionStaysOnTrim(entry, industry));
  let excess = entries.length - limit;
  const drop = new Set<number>();
  for (const pass of [false, true]) {
    for (let i = entries.length - 1; i >= 0 && excess > 0; i--) {
      if (stays[i] !== pass) continue;
      drop.add(i);
      excess--;
    }
  }
  return { kept: entries.filter((_, i) => !drop.has(i)), dropped: drop.size };
}
