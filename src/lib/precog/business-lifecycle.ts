import { resolveTemplate, type TemplateSource } from "./active-template";
import { INDUSTRIES, type IndustryId } from "./industry";
import { ownBusinessProfile } from "./onboarding/own-team";
import { defaultProfile, hasUserWork, type PracticeProfile } from "./practice-profile";
import { getIndustryTemplate } from "./templates";
import type { Person, ProcessNode } from "./types";

/**
 * The process map an edit starts from: the business's own map, or the
 * template's with owners limited to people on this team. Seeding from the raw
 * template saved the sample's owner ids (p1…p6) into an owner's map, where a
 * later import holding those ids would have brought the sample's owners back.
 */
export function processesToEdit(source: TemplateSource): ProcessNode[] {
  return source.customProcesses ?? resolveTemplate(source).processes;
}

/**
 * Businesses one signed-in account may keep: the server refuses to save a
 * 51st (MAX_BUSINESSES_PER_USER in business-store), so the app stops creating
 * one locally at the same point instead of letting it fail to sync.
 */
export const MAX_BUSINESSES_PER_ACCOUNT = 50;

/**
 * A business the owner adds. Its setup is not finished, so the setup dialog
 * opens for it with the name and line of business already filled in; it
 * never shows the sample's people under the owner's name.
 */
export function newBusinessProfile(industry: IndustryId, name?: string): PracticeProfile {
  const fresh = defaultProfile(industry);
  return {
    ...fresh,
    practiceName: name?.trim().slice(0, 80) || fresh.practiceName,
    onboardingComplete: false,
  };
}

/** The name the owner typed for a business, or "" while it still has a sample's name. */
export function ownBusinessName(profile: Pick<PracticeProfile, "practiceName">): string {
  return SAMPLE_NAMES.has(profile.practiceName) ? "" : profile.practiceName;
}

/**
 * Setup finished with the owner's own team. The business always gets an id
 * of its own: two tabs that both finished setup used to share the id of the
 * unfinished business they had both loaded, and the second replaced the first.
 */
export function ownSetupProfile(input: {
  industry: IndustryId;
  practiceName: string;
  people: Person[];
}): PracticeProfile {
  return ownBusinessProfile(
    { ...defaultProfile(input.industry), decisions: [] },
    { practiceName: input.practiceName, people: input.people },
  );
}

/** Setup finished by loading the sample: also a business of its own. */
export function sampleSetupProfile(
  industry: IndustryId,
  previous: PracticeProfile,
): PracticeProfile {
  return { ...defaultProfile(industry), decisions: previous.decisions, onboardingComplete: true };
}

/**
 * What happens to the unfinished business a setup replaces. Normally it is
 * only the sample behind the dialog and goes away. A copy saved by an older
 * version of the app can hold real work with setup unfinished; that is kept
 * as a business of its own rather than dropped.
 */
export function unfinishedBusinessToKeep(previous: PracticeProfile): PracticeProfile | null {
  if (previous.onboardingComplete !== false) return null;
  const sampleName = getIndustryTemplate(previous.industry).businessName;
  return hasUserWork({ ...previous, practiceName: sampleName })
    ? { ...previous, onboardingComplete: true }
    : null;
}

/** True when a signed-in account already holds as many businesses as it may keep. */
export function atBusinessLimit(businessCount: number): boolean {
  return businessCount >= MAX_BUSINESSES_PER_ACCOUNT;
}

const SAMPLE_NAMES = new Set(INDUSTRIES.map((i) => i.demoName));
