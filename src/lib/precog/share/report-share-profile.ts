import { defaultProfile, type PracticeProfile } from "../practice-profile";

/**
 * The slice of a business that a shared report link carries: what the
 * printed report reads around a locked version's stored figures, and
 * nothing else. The report prints the stored model for every figure and
 * finding; from the profile it reads only the industry, the printed name,
 * the team size, the process map and register (the map section, the "custom
 * map" wording and whether register freshness is tracked), the month's
 * review results, the books-versus-map scope line and the engagement
 * stamps. The journal's text, planned absences, access checks, places,
 * written procedures, map history and saved blocks are the business's own
 * notes, so a link never hands them to whoever holds it.
 *
 * Starting from the industry's default keeps every other field at its
 * default rather than absent, so the page normalises the projection exactly
 * as it would the merged profile.
 */
export function shareReportProfile(profile: PracticeProfile): PracticeProfile {
  const base = defaultProfile(profile.industry);
  return {
    ...base,
    industry: profile.industry,
    practiceName: profile.practiceName,
    businessId: profile.businessId,
    onboardingComplete: profile.onboardingComplete,
    staff: profile.staff,
    engagement: profile.engagement,
    monthlyReviews: profile.monthlyReviews,
    integrationDriftSummary: profile.integrationDriftSummary,
    // The template source: the map and register the report prints and
    // measures (resolveTemplate, mapSource, registerSource, isMapCustomized).
    customProcesses: profile.customProcesses,
    customPeople: profile.customPeople,
    customKnowledge: profile.customKnowledge,
    customRelations: profile.customRelations,
    mapLayout: profile.mapLayout,
    updatedAt: profile.updatedAt,
  };
}
