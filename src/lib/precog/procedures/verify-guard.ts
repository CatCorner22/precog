import { RequestError } from "@/lib/request-errors";
import { contentKey, reviewByDate } from "./lifecycle";
import { normalizeProcedures } from "./normalize";
import { verificationBlockers } from "./writing";

/**
 * Who may verify a procedure, checked on the server when a business is saved.
 * A verification is evidence that a second person checked the steps, so a
 * firm preparer cannot record one (a firm reviewer or owner, or the owner of
 * an account outside any firm, can), and one stamped with an account records
 * only the account that saved it, under that account's own name. A stored
 * verification kept on steps that changed, or carried to a later review date
 * by a longer review interval, counts as a new one. A new
 * verification of a procedure whose writing has errors (procedures/writing.ts)
 * is refused too, so the writing standards hold for every client. Verifications
 * already stored on unchanged steps are never re-checked, so an older one
 * without a stamp stays as it is.
 *
 * The save path stores procedures already normalized with the same day limit
 * (profile-requests.ts), so this reads exactly what every client will show.
 */

/** The firm role of whoever saves; null for an account outside any firm. */
export type SaverRole = "owner" | "reviewer" | "preparer" | null;

export const PREPARER_CANNOT_VERIFY =
  "A firm preparer cannot verify a procedure. Ask a firm reviewer or the owner to verify the steps.";
export const WRITING_BLOCKS_VERIFICATION =
  "Nobody can verify a procedure that has writing errors. Fix the errors the best-practice check lists, then verify it.";
export const VERIFICATION_ACCOUNT_MISMATCH =
  "Another account recorded this verification. Reload and verify it again.";

interface Verification {
  verifiedAt: string;
  verifiedBy: string;
  accountId: string;
  accountName: string;
  /** What the verification vouches for: the steps and where they are done. */
  content: string;
  /** The day the verification runs out. */
  reviewBy: string;
  /** Writing errors in the procedure it vouches for. */
  blockers: number;
}

/**
 * Every verification in a profile's procedures, by procedure id, read from
 * untrusted JSON with the normalizer the app loads procedures with, so repeated
 * ids, padded ids and missing fields read the way the app reads them.
 */
function verificationsIn(profile: unknown, latestDay: string): Map<string, Verification> {
  const list =
    profile && typeof profile === "object"
      ? (profile as { procedures?: unknown }).procedures
      : undefined;
  const found = new Map<string, Verification>();
  for (const p of normalizeProcedures(list, latestDay)) {
    if (!p.verifiedAt) continue;
    found.set(p.id, {
      verifiedAt: p.verifiedAt,
      verifiedBy: p.verifiedBy ?? "",
      accountId: p.verifiedByAccountId ?? "",
      accountName: p.verifiedByAccountName ?? "",
      content: contentKey(p),
      reviewBy: reviewByDate(p) ?? "",
      blockers: verificationBlockers(p).length,
    });
  }
  return found;
}

/**
 * The verifications in `nextProfile` that are not in `previousProfile` (the
 * stored profile, or null for a new business): made now, made again, by
 * someone else, under another account or name, kept on steps that changed,
 * or made to run out later. A shorter review interval is no new
 * verification, so anyone may tighten it. Both are whole business profiles, read as untrusted JSON, with no
 * date later than `latestDay`.
 */
export function newVerifications(
  previousProfile: unknown,
  nextProfile: unknown,
  latestDay: string,
): Verification[] {
  const before = verificationsIn(previousProfile, latestDay);
  return [...verificationsIn(nextProfile, latestDay)].flatMap(([id, v]) => {
    const old = before.get(id);
    const same =
      old &&
      old.verifiedAt === v.verifiedAt &&
      old.verifiedBy === v.verifiedBy &&
      old.accountId === v.accountId &&
      old.accountName === v.accountName &&
      old.content === v.content &&
      v.reviewBy <= old.reviewBy;
    return same ? [] : [v];
  });
}

/**
 * Refuses the save when it adds a verification this saver may not record
 * (403), or one of a procedure whose writing has errors (422). Both profiles are whole business profiles, not procedure lists.
 * `saverNames` are the names a stamp may carry for the saver's account (its
 * name and email); a stamp under any other name is refused.
 */
export function assertVerificationsAllowed(input: {
  previousProfile: unknown;
  nextProfile: unknown;
  saverId: string;
  saverRole: SaverRole;
  saverNames: readonly string[];
  latestDay: string;
}): void {
  const fresh = newVerifications(input.previousProfile, input.nextProfile, input.latestDay);
  if (fresh.length === 0) return;
  if (input.saverRole === "preparer") throw new RequestError(403, PREPARER_CANNOT_VERIFY);
  const names = new Set(input.saverNames.map((n) => n.trim().slice(0, 120)).filter(Boolean));
  const mismatch = (v: Verification) =>
    (v.accountId && v.accountId !== input.saverId) || (v.accountName && !names.has(v.accountName));
  if (fresh.some(mismatch)) throw new RequestError(403, VERIFICATION_ACCOUNT_MISMATCH);
  if (fresh.some((v) => v.blockers > 0)) throw new RequestError(422, WRITING_BLOCKS_VERIFICATION);
}
