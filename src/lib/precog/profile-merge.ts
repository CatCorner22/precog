import type { IndustryId } from "./industry";
import { normalizeProfile, type PracticeProfile } from "./practice-profile";
import { isRecord } from "./profile-entries";

/**
 * A stored profile row as the server hands it back: the stored document with
 * the row's name and industry, run through the one normaliser the client
 * uses, with `today` (the owner's calendar day the request carried) as the
 * latest day a register confirmation may carry. Manual staff markers
 * (`segregationSource`, `bankRecSource`) come back as they were saved.
 */
export function mergeProfile(
  row: {
    name: string;
    industry: string;
    profile: PracticeProfile;
  },
  today: string,
): PracticeProfile {
  const stored: Partial<PracticeProfile> = isRecord(row.profile) ? row.profile : {};
  return normalizeProfile(
    {
      ...stored,
      practiceName: row.name || stored.practiceName,
      industry: (row.industry || stored.industry) as IndustryId,
    },
    { today },
  );
}
