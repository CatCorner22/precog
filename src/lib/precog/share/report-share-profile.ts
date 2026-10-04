import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { KnowledgeItem, Person } from "../types";

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
    customPeople: profile.customPeople
      ? profile.customPeople.map(sharePerson)
      : profile.customPeople,
    customKnowledge: profile.customKnowledge
      ? profile.customKnowledge.map(shareKnowledgeItem)
      : profile.customKnowledge,
    customRelations: profile.customRelations,
    mapLayout: profile.mapLayout,
    updatedAt: profile.updatedAt,
  };
}

/**
 * A person as the report names them: the id the map and register point at,
 * the name, the job title, whether they are active, the owner mark and the
 * duties. The roster's employee id and department, years of service and a
 * last day stay behind: the stored model already carries what the leaving
 * section prints.
 */
function sharePerson(person: Person): Person {
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    active: person.active,
    ...(person.owner !== undefined ? { owner: person.owner } : {}),
    ...(person.entitlements !== undefined ? { entitlements: person.entitlements } : {}),
  };
}

/**
 * A register item as the report measures it. The description stays behind.
 * `procedureLocation` is kept on purpose: registerSource compares the list
 * against the industry's starter list field by field (register-state.ts,
 * itemContent), and that comparison decides whether the printed report
 * tracks register freshness, so a location written on an otherwise unchanged
 * starter list has to travel for the shared page to print the same report.
 * The derived procedure links are never stored and are rebuilt empty.
 */
function shareKnowledgeItem(item: KnowledgeItem): KnowledgeItem {
  return {
    id: item.id,
    name: item.name,
    criticality: item.criticality,
    category: item.category,
    description: "",
    linkedProcessIds: item.linkedProcessIds,
    ...(item.kind !== undefined ? { kind: item.kind } : {}),
    ...(item.documented !== undefined ? { documented: item.documented } : {}),
    ...(item.procedureLocation !== undefined ? { procedureLocation: item.procedureLocation } : {}),
    ...(item.confirmedAt !== undefined ? { confirmedAt: item.confirmedAt } : {}),
  };
}
