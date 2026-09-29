import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";
import { latestClientDay, resolveClientDate } from "./dates";
import { normalizePlaces, normalizeProcedures } from "./procedures/normalize";
import { isIndustryId, type IndustryId } from "./industry";
import { isBusinessId, validateProfileInput } from "./profile-input";
import type { PracticeProfile } from "./practice-profile";

/**
 * What the business server functions (profile-server.ts) accept, checked
 * before any database work: a malformed request is a 4xx, never a server
 * failure. Kept apart from `createServerFn` so each rule has a unit test.
 */

interface SaveBusinessRequest {
  profile: PracticeProfile;
  businessId: string;
  /** The profile as it is stored. */
  json: string;
  /** The account the browser believes is signed in; a mismatch is refused. */
  expectedAccountId: string;
  industry: IndustryId;
  /** The account revision the save builds on; null for a business the account has never held. */
  baseRevision: number | null;
  today: string;
  /** The latest day a stored date may carry (see latestClientDay). */
  latestDay: string;
}

export function parseSaveBusinessRequest(input: unknown): SaveBusinessRequest {
  const raw = requireObject(input);
  if (typeof raw.expectedAccountId !== "string" || !raw.expectedAccountId)
    throw new RequestError(409, "Reload Precog before saving so it can verify the account.");
  const latestDay = latestClientDay();
  const checked = storedProcedures(validateProfileInput(raw.profile), latestDay);
  const industry = raw.industry ?? checked.profile.industry;
  if (!isIndustryId(industry)) throw new RequestError(400, "Unknown industry");
  const baseRevision = raw.baseRevision ?? null;
  if (
    baseRevision !== null &&
    (typeof baseRevision !== "number" || !Number.isSafeInteger(baseRevision) || baseRevision < 1)
  )
    throw invalidRequest();
  return {
    ...checked,
    expectedAccountId: raw.expectedAccountId,
    industry,
    baseRevision,
    today: resolveClientDate(raw.today),
    latestDay,
  };
}

/**
 * The profile with its places and procedures as the app will load them
 * (normalized, within the byte budget, no date after `latestDay`), so what is
 * stored is exactly what the verification check reads and what every client
 * shows, however the request was built.
 */
function storedProcedures(
  checked: { profile: PracticeProfile; businessId: string; json: string },
  latestDay: string,
): { profile: PracticeProfile; businessId: string; json: string } {
  const raw = checked.profile as PracticeProfile & Record<string, unknown>;
  if (raw.procedures === undefined && raw.places === undefined) return checked;
  const profile: PracticeProfile = {
    ...checked.profile,
    ...(raw.places !== undefined ? { places: normalizePlaces(raw.places) } : {}),
    ...(raw.procedures !== undefined
      ? { procedures: normalizeProcedures(raw.procedures, latestDay) }
      : {}),
  };
  return {
    profile,
    businessId: checked.businessId,
    json: JSON.stringify({ ...profile, businessId: checked.businessId }),
  };
}

/** One business to open, by id. */
export function parseOpenBusinessRequest(input: unknown): { id: string; today: string } {
  const raw = requireObject(input);
  if (!isBusinessId(raw.id)) throw new RequestError(400, "Unknown business id");
  return { id: raw.id, today: resolveClientDate(raw.today) };
}

/** One business to delete, from the account the browser believes is signed in. */
export function parseDeleteBusinessRequest(input: unknown): {
  id: string;
  expectedAccountId: string;
} {
  const raw = requireObject(input);
  if (!isBusinessId(raw.id)) throw new RequestError(400, "Unknown business id");
  if (typeof raw.expectedAccountId !== "string" || !raw.expectedAccountId) throw invalidRequest();
  return { id: raw.id, expectedAccountId: raw.expectedAccountId };
}
