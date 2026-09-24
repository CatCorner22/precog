import { resolveTemplate, type TemplateSource } from "./active-template";
import { INDUSTRIES, type IndustryId } from "./industry";
import { OWN_BUSINESS_FALLBACK_NAME, ownBusinessProfile } from "./onboarding/own-team";
import { defaultDualReleasePolicy } from "./controls/dual-release";
import { defaultProfile, hasUserWork, type PracticeProfile } from "./practice-profile";
import { getIndustryTemplate } from "./templates";
import type { Person, ProcessNode } from "./types";
import { MAX_BUSINESSES_PER_USER } from "./business-store";

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
 * Businesses one signed-in account may keep: the server refuses to save one
 * more (MAX_BUSINESSES_PER_USER in business-store), so the app stops creating
 * one locally at the same point instead of letting it fail to sync. One
 * number, read from the server's store module.
 */
export const MAX_BUSINESSES_PER_ACCOUNT = MAX_BUSINESSES_PER_USER;

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
  return {
    ...ownBusinessProfile(
      { ...defaultProfile(input.industry), decisions: [] },
      { practiceName: input.practiceName, people: input.people },
    ),
    engagement: { startedAt: new Date().toISOString() },
  };
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

/**
 * True when `next` replaces the sample team with the owner's own people (a
 * roster pasted into the sample), rather than editing the sample's people:
 * none of the sample's people is left.
 */
export function replacesSampleTeam(
  profile: Pick<PracticeProfile, "customPeople" | "industry">,
  next: readonly Person[] | null,
): boolean {
  if (profile.customPeople || !next || next.length === 0) return false;
  const sampleIds = new Set(getIndustryTemplate(profile.industry).people.map((p) => p.id));
  return !next.some((person) => sampleIds.has(person.id));
}

/**
 * The owner's own people take over a business that started as the sample:
 * the same clean slate setup gives. The sample's name gives way to a neutral
 * one the owner is asked to change, the sample's control decisions (its
 * supplier waiver) and its who-knows-what marks go, and the dual-release
 * approver seats are read off the owner's people. The owner's own settings
 * and exceptions stay.
 */
export function adoptOwnTeam(profile: PracticeProfile, people: Person[]): PracticeProfile {
  const ownTemplate = resolveTemplate({ ...profile, customPeople: people, customRelations: [] });
  const seats = defaultDualReleasePolicy(ownTemplate, profile.staff).rules;
  const dualRelease = {
    ...profile.dualRelease,
    rules: profile.dualRelease.rules.map((rule) => {
      const seat = seats.find((r) => r.channel === rule.channel);
      return seat
        ? {
            ...rule,
            firstApproverRoles: seat.firstApproverRoles,
            secondApproverRoles: seat.secondApproverRoles,
          }
        : rule;
    }),
    exceptions: profile.dualRelease.exceptions.filter((e) => !e.sample),
  };
  return {
    ...profile,
    practiceName: ownBusinessName(profile) || OWN_BUSINESS_FALLBACK_NAME,
    customPeople: people,
    customRelations: [],
    dualRelease,
  };
}

/** True when the owner's own business still carries the neutral name setup gave it. */
export function needsOwnName(
  profile: Pick<PracticeProfile, "practiceName" | "onboardingComplete">,
): boolean {
  return (
    profile.onboardingComplete !== false && profile.practiceName === OWN_BUSINESS_FALLBACK_NAME
  );
}

/**
 * True when what a page prints describes a sample business rather than the
 * owner's: the sample's people are in use, or no business is set up yet
 * (the sample behind the setup dialog).
 */
export function isSampleBusiness(
  profile: Pick<PracticeProfile, "customPeople" | "onboardingComplete">,
): boolean {
  return !profile.customPeople || profile.onboardingComplete === false;
}

/**
 * The business name a report prints. Until setup is finished the figures are
 * the sample's, so they go out under the sample's name, never under a name
 * the owner typed for a business not set up yet.
 */
export function printedBusinessName(
  profile: Pick<PracticeProfile, "practiceName" | "industry" | "onboardingComplete">,
): string {
  return profile.onboardingComplete === false
    ? getIndustryTemplate(profile.industry).businessName
    : profile.practiceName;
}
