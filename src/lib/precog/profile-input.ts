import { isIndustryId } from "./industry";
import type { PracticeProfile } from "./practice-profile";
import { RequestError } from "@/lib/request-errors";

/** Largest profile document a single save may carry (bytes of JSON). */
export const MAX_PROFILE_BYTES = 2 * 1024 * 1024;
const BUSINESS_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isBusinessId(value: unknown): value is string {
  return typeof value === "string" && BUSINESS_ID.test(value);
}

export { isIndustryId };

/**
 * The minimum a profile must satisfy before it is stored verbatim as jsonb:
 * an object with a string name and a known industry, under the size cap.
 * Everything else is normalised by `mergeProfile` on the way back out.
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
  const businessId = profile.businessId ?? "biz_default";
  const json = JSON.stringify({ ...profile, businessId });
  if (new TextEncoder().encode(json).length > MAX_PROFILE_BYTES) {
    throw new RequestError(413, "Profile is too large to save (over 2 MB)");
  }
  return { profile: { ...profile, businessId }, businessId, json };
}
