import { RequestError } from "@/lib/request-errors";
import { contentKey } from "./lifecycle";
import { normalizeProcedures } from "./normalize";

/**
 * Who may verify a procedure, checked on the server when a business is saved.
 * A verification is evidence that a second person checked the steps, so a
 * firm preparer cannot record one (a firm reviewer or owner, or the owner of
 * an account outside any firm, can), and one stamped with an account records
 * only the account that saved it, under that account's own name. A stored
 * verification kept on steps that changed counts as a new one. Verifications
 * already stored on unchanged steps are never re-checked, so an older one
 * without a stamp stays as it is.
 *
 * The save path stores procedures already normalized with the same day limit
 * (profile-requests.ts), so this reads exactly what every client will show.
 */

/** The firm role of whoever saves; null for an account outside any firm. */
export type SaverRole = "owner" | "reviewer" | "preparer" | null;

export const PREPARER_CANNOT_VERIFY =
  "A firm preparer cannot verify a procedure. Ask a firm reviewer or the owner to check the steps.";
export const VERIFICATION_ACCOUNT_MISMATCH =
  "This verification was recorded under another account. Reload and verify it again.";

interface Verification {
  verifiedAt: string;
  verifiedBy: string;
  accountId: string;
  accountName: string;
  /** What the verification vouches for: the steps and where they are done. */
  content: string;
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
    });
  }
  return found;
}

/**
 * The verifications in `nextProfile` that are not in `previousProfile` (the
 * stored profile, or null for a new business): made now, made again, by
 * someone else, under another account or name, or kept on steps that
 * changed. Both are whole business profiles, read as untrusted JSON, with no
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
      old.content === v.content;
    return same ? [] : [v];
  });
}

/**
 * Refuses the save (403) when it adds a verification this saver may not
 * record. Both profiles are whole business profiles, not procedure lists.
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
}
