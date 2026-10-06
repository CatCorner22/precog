import { normalizeSetupAnswers } from "../onboarding/setup-answers";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { ReviewRecord } from "../firm/reviews";
import type { KnowledgeItem, Person, ProcessIdea, ProcessNode, ProcessRisk } from "../types";

/**
 * The slice of a business that a shared report link carries: what the
 * printed report reads around a locked version's stored figures, and
 * nothing else. The report prints the stored model for every figure and
 * finding; from the profile it reads only the industry, the printed name,
 * the team size, the process map and register (the map section, the "custom
 * map" wording and whether register freshness is tracked), the month's
 * review results, the books-versus-map scope line, the engagement stamps
 * and the setup answers (which duties sit outside the team, so the "nobody
 * holds" line leaves them out; each answer is a fixed choice, never free
 * text). The journal's text, planned absences, access checks, places,
 * written procedures, map history, saved blocks, process notes and earlier
 * monthly review notes are the business's own notes, so a link never hands
 * them to whoever holds it (share-report.test.ts serialises what a link
 * sends and fails on any of them).
 *
 * `preparedAt` is the version's lock time: the report prints that month's
 * review results only, so the projection keeps the latest result per check
 * for that month and drops every other month. Without it (the firm's own
 * archive, never a public link) the latest result per check and month stays.
 *
 * Starting from the industry's default keeps every other field at its
 * default rather than absent, so the page normalises the projection exactly
 * as it would the merged profile.
 */
export function shareReportProfile(profile: PracticeProfile, preparedAt?: string): PracticeProfile {
  const base = defaultProfile(profile.industry);
  return {
    ...base,
    industry: profile.industry,
    practiceName: profile.practiceName,
    businessId: profile.businessId,
    onboardingComplete: profile.onboardingComplete,
    staff: profile.staff,
    engagement: profile.engagement,
    monthlyReviews: profile.monthlyReviews
      ? shareReviews(profile.monthlyReviews, preparedAt)
      : profile.monthlyReviews,
    integrationDriftSummary: profile.integrationDriftSummary,
    ...shareSetupAnswers(profile),
    // The template source: the map and register the report prints and
    // measures (resolveTemplate, mapSource, registerSource, isMapCustomized).
    customProcesses: profile.customProcesses
      ? profile.customProcesses.map(shareProcess)
      : profile.customProcesses,
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
 * The setup answers, rebuilt from their fixed choices alone
 * (normalizeSetupAnswers), so nothing but those choices travels.
 */
function shareSetupAnswers(profile: PracticeProfile): Pick<PracticeProfile, "setupAnswers"> {
  const answers = normalizeSetupAnswers(profile.setupAnswers);
  return answers ? { setupAnswers: answers } : {};
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

/**
 * A process as the report prints and measures it: the id, name, layer and
 * stage, the owners (mapSource and the map section read them), the controls
 * and dependencies, and as many risks and ideas as it has, since the map
 * section prints their counts. Each risk and idea is a blank placeholder:
 * its id, title, note and scores stay behind (an id can spell out its
 * title). So do the description, evidence and its notes, Lean waste, inputs,
 * outputs, systems, cadence and the procedure's location: the printed report
 * reads none of them, and its figures come from the stored model.
 */
function shareProcess(process: ProcessNode): ProcessNode {
  return {
    id: process.id,
    name: process.name,
    layer: process.layer,
    description: "",
    dependencies: process.dependencies,
    controlIds: process.controlIds,
    ...(process.stage !== undefined ? { stage: process.stage } : {}),
    ...(process.ownerPersonIds !== undefined ? { ownerPersonIds: process.ownerPersonIds } : {}),
    ...(process.risks !== undefined ? { risks: process.risks.map((_, i) => blankRisk(i)) } : {}),
    ...(process.ideas !== undefined ? { ideas: process.ideas.map((_, i) => blankIdea(i)) } : {}),
  };
}

function blankRisk(i: number): ProcessRisk {
  return { id: `r${i + 1}`, title: "", kind: "control", severity: 1, likelihood: 1, note: "" };
}

function blankIdea(i: number): ProcessIdea {
  return {
    id: `i${i + 1}`,
    title: "",
    category: "control",
    effort: "low",
    impact: "low",
    note: "",
    status: "backlog",
  };
}

/** The most hours a reader's clock can sit from UTC (UTC-12 to UTC+14). */
const ZONE_SPREAD_MS = 14 * 60 * 60 * 1000;

/**
 * The review results the report prints: the latest per check (the first in
 * the list, which is newest first, as latestReview reads it) for the
 * report's month. The page works the month out on the reader's clock, so
 * both months a lock near midnight on the 1st can fall in stay; no other
 * month does. Without `preparedAt`, the latest per check and month.
 */
function shareReviews(records: readonly ReviewRecord[], preparedAt?: string): ReviewRecord[] {
  const at = preparedAt ? Date.parse(preparedAt) : Number.NaN;
  const months = Number.isNaN(at)
    ? null
    : new Set(
        [at - ZONE_SPREAD_MS, at + ZONE_SPREAD_MS].map((t) =>
          new Date(t).toISOString().slice(0, 7),
        ),
      );
  const seen = new Set<string>();
  return records.filter((record) => {
    if (months && !months.has(record.period)) return false;
    const key = `${record.key}|${record.period}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
