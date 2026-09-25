import * as model from "./profile-model";
import type { IndustryId } from "./industry";
import { browserStorage, type StorageLike } from "./local-data";
import { browserWorkspace, profileOwner } from "./sync/workspace";
import { readInsurance, withInsurance } from "./scoring/dynamic-variables";

export * from "./profile-model";

/** Local provenance is an isolation check, never server authorization. */
export interface PracticeProfile extends model.PracticeProfile {
  workspaceOwnerId?: string | null;
}

function withProvenance(profile: model.PracticeProfile, source?: unknown): PracticeProfile {
  const originalOwner = profileOwner(source);
  const owner = originalOwner === undefined ? browserWorkspace.snapshot()?.owner : originalOwner;
  return owner === undefined ? profile : { ...profile, workspaceOwnerId: owner };
}

export function defaultProfile(industry: IndustryId = "dental"): PracticeProfile {
  return withProvenance(model.defaultProfile(industry));
}

export function normalizeProfile(
  parsed: Partial<PracticeProfile>,
  onboardingCompleteFallback = true,
): PracticeProfile {
  const normalized = model.normalizeProfile(parsed, onboardingCompleteFallback);
  // The legacy numeric normalizer intentionally knows no policy metadata.
  // Preserve only validated v2 facts; never infer provenance from old numbers.
  const riskVariables = withInsurance(
    normalized.riskVariables,
    readInsurance(parsed.riskVariables ?? normalized.riskVariables),
  );
  return withProvenance({ ...normalized, riskVariables }, parsed);
}

export function parseStoredProfile(raw: string | null): PracticeProfile {
  if (!raw) return { ...defaultProfile(), onboardingComplete: false };
  try {
    return normalizeProfile(JSON.parse(raw) as Partial<PracticeProfile>, false);
  } catch {
    return { ...defaultProfile(), onboardingComplete: false };
  }
}

export function loadProfile(storage: StorageLike | null = browserStorage()): PracticeProfile {
  return parseStoredProfile(model.readStoredActiveProfile(storage));
}
