import { isIndustryId } from "./industry";
import { normalizeDecisions, type PracticeProfile } from "./practice-profile";
import { malformedList } from "./profile-entries";
import { RequestError } from "@/lib/request-errors";
import { DEFAULT_BUSINESS_ID, isBusinessId } from "./business-id";
export { isBusinessId } from "./business-id";

/**
 * What a save gets back when one of its lists holds something the readers
 * cannot use (see malformedList). The owner's own device rebuilds such a copy
 * when it reads it, so a reload sends a readable one.
 */
export const UNREADABLE_PROFILE_MESSAGE =
  "This business has data Precog cannot read. Reload the page and try again.";

/** Largest profile document a single save may carry (bytes of JSON). */
export const MAX_PROFILE_BYTES = 2 * 1024 * 1024;

/**
 * What a profile must satisfy before it is stored as jsonb: an object with a
 * string name, a known industry, lists whose every entry passes the checks
 * the client's normaliser applies (see profile-entries), under the size cap.
 * The team, the processes and the register must come back from those checks
 * unchanged, duty lists, risks and register words included, so a stored row
 * reads back as it was saved, in the advisor's view and the nightly digest
 * too. Decisions are trimmed here, not compared (see normalizeDecisions).
 * Scalars are bounded by `normalizeProfile` on the way back out.
 */
export function validateProfileInput(input: unknown): {
  profile: PracticeProfile;
  businessId: string;
  json: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestError(400, "Profile must be an object");
  }
  const profile = input as PracticeProfile;
  if (typeof profile.practiceName !== "string") {
    throw new RequestError(400, "Profile needs a business name");
  }
  if (!isIndustryId(profile.industry)) {
    throw new RequestError(400, "Profile has an unknown industry");
  }
  if (profile.businessId !== undefined && !isBusinessId(profile.businessId)) {
    throw new RequestError(400, "Business id must be 1–64 letters, digits, '_' or '-'");
  }
  if (malformedList(input as Record<string, unknown>)) {
    throw new RequestError(400, UNREADABLE_PROFILE_MESSAGE);
  }
  const businessId = profile.businessId ?? DEFAULT_BUSINESS_ID;
  const rawJson = JSON.stringify({ ...profile, businessId });
  if (new TextEncoder().encode(rawJson).length > MAX_PROFILE_BYTES) {
    throw new RequestError(413, "Profile is too large to save (over 2 MB)");
  }
  const json = JSON.stringify({
    ...profile,
    businessId,
    decisions: normalizeDecisions(profile.decisions),
  });
  return { profile: JSON.parse(json) as PracticeProfile, businessId, json };
}
