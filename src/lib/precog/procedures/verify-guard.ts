import { RequestError } from "@/lib/request-errors";
import { normalizeProcedures } from "./normalize";

/**
 * Who may verify a procedure, checked on the server when a business is saved.
 * A verification is evidence that a second person checked the steps, so a
 * firm preparer cannot record one (a firm reviewer or owner, or the owner of
 * an account outside any firm, can), and one stamped with an account records
 * only the account that saved it. Verifications already stored are never
 * re-checked, so an older one without a stamp stays as it is.
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
}

/** Later than any real day, so a verification dated in the future still counts. */
const ANY_DAY = "9999-12-31";

/**
 * Every verification in a profile's procedures, by procedure id, read from
 * untrusted JSON with the same normalizer the app loads procedures with (no
 * date limit), so the guard sees exactly the verifications the app will show,
 * however the JSON repeats ids or leaves fields out.
 */
function verificationsIn(profile: unknown): Map<string, Verification> {
  const list =
    profile && typeof profile === "object"
      ? (profile as { procedures?: unknown }).procedures
      : undefined;
  const found = new Map<string, Verification>();
  for (const p of normalizeProcedures(list, ANY_DAY)) {
    if (!p.verifiedAt) continue;
    found.set(p.id, {
      verifiedAt: p.verifiedAt,
      verifiedBy: p.verifiedBy ?? "",
      accountId: p.verifiedByAccountId ?? "",
    });
  }
  return found;
}

/**
 * The verifications in `nextProfile` that are not in `previousProfile` (the
 * stored profile, or null for a new business): made now, made again, by
 * someone else, or under another account. Both are whole business profiles,
 * read as untrusted JSON.
 */
export function newVerifications(previousProfile: unknown, nextProfile: unknown): Verification[] {
  const before = verificationsIn(previousProfile);
  return [...verificationsIn(nextProfile)].flatMap(([id, v]) => {
    const old = before.get(id);
    const same =
      old &&
      old.verifiedAt === v.verifiedAt &&
      old.verifiedBy === v.verifiedBy &&
      old.accountId === v.accountId;
    return same ? [] : [v];
  });
}

/**
 * Refuses the save (403) when it adds a verification this saver may not
 * record. Both profiles are whole business profiles, not procedure lists.
 */
export function assertVerificationsAllowed(input: {
  previousProfile: unknown;
  nextProfile: unknown;
  saverId: string;
  saverRole: SaverRole;
}): void {
  const fresh = newVerifications(input.previousProfile, input.nextProfile);
  if (fresh.length === 0) return;
  if (input.saverRole === "preparer") throw new RequestError(403, PREPARER_CANNOT_VERIFY);
  if (fresh.some((v) => v.accountId && v.accountId !== input.saverId)) {
    throw new RequestError(403, VERIFICATION_ACCOUNT_MISMATCH);
  }
}
