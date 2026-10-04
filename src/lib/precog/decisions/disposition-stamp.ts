import type { DecisionEntry, PracticeProfile } from "../practice-profile";
import { stableStringify } from "../text";

/**
 * Who judged a finding not valid, stamped on the server when a business is
 * saved. A "Not valid" judgement names its judge in the decision register
 * and in exported workpapers, so the name must come from the verified saver,
 * never from the browser: a forged name would pin a judgement on a colleague
 * who never made it. Judgements already stored stay as they are — a later
 * save by someone else never re-attributes them — and only a new or changed
 * judgement takes the saver's stamp.
 */

export interface DispositionStamper {
  id: string;
  name: string;
}

function sameDisposition(
  a: DecisionEntry["disposition"],
  b: DecisionEntry["disposition"],
): boolean {
  return stableStringify(a ?? null) === stableStringify(b ?? null);
}

/**
 * The profile with every new or changed "Not valid" judgement stamped by
 * `saver`. `previous` is the stored profile, or null for a new business.
 * Pure, so the save path and a test read the same rule.
 */
export function stampDispositions(
  next: PracticeProfile,
  previous: PracticeProfile | null,
  saver: DispositionStamper,
): PracticeProfile {
  const before = new Map((previous?.decisions ?? []).map((d) => [d.id, d.disposition]));
  let changed = false;
  const decisions = (next.decisions ?? []).map((entry) => {
    if (!entry.disposition || sameDisposition(before.get(entry.id), entry.disposition)) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      disposition: {
        ...entry.disposition,
        by: { userId: saver.id.slice(0, 80), name: saver.name.slice(0, 120) },
      },
    };
  });
  return changed ? { ...next, decisions } : next;
}
