import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";
import { resolveClientDate } from "./dates";
import type { IndustryId } from "./industry";
import { isBusinessId, isIndustryId, validateProfileInput } from "./profile-input";
import type { PracticeProfile } from "./practice-profile";

/**
 * What the business server functions (profile-server.ts) accept, checked
 * before any database work: a malformed request is a 4xx, never a server
 * failure. Kept apart from `createServerFn` so each rule has a unit test.
 */

export interface SaveBusinessRequest {
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
}

export function parseSaveBusinessRequest(input: unknown): SaveBusinessRequest {
  const raw = requireObject(input);
  if (typeof raw.expectedAccountId !== "string" || !raw.expectedAccountId)
    throw new RequestError(
      409,
      "Reload this application before saving so the account can be verified.",
    );
  const checked = validateProfileInput(raw.profile);
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
