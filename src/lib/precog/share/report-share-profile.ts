import { utcDateKey } from "../dates";
import type { OnboardingFacts } from "../onboarding/decision-model";
import { normalizeSetupAnswers } from "../onboarding/setup-answers";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { OTHER_PROBLEM_KEY, reportPeriod, type ReviewRecord } from "../firm/reviews";
import type { KnowledgeItem, Person, ProcessIdea, ProcessNode, ProcessRisk } from "../types";
import type { ReportScope } from "../report/report-scope";
import { printsLayoutSeven, REPORT_LAYOUT_VERSION } from "../report/stored-model";

/**
 * The slice of a business that a shared report link carries: what the
 * printed report reads around a locked version's stored figures, and
 * nothing else. The report prints the stored model for every figure and
 * finding; from the profile it reads only the industry, the printed name,
 * the team size, the process map and register (the map section, the "custom
 * map" wording and whether register freshness is tracked), the month's
 * review results, the books-versus-map scope line, the engagement stamps,
 * the setup answers (which duties sit outside the team, so the "nobody
 * holds" line leaves them out; each answer is a fixed choice, never free
 * text) and the setup headcount (`shareOnboardingFacts`). The journal's
 * text, planned absences, access checks, places,
 * written procedures, map history, saved blocks, process notes and earlier
 * monthly review notes are the business's own notes, so a link never hands
 * them to whoever holds it (share-report.test.ts serialises what a link
 * sends and fails on any of them).
 *
 * The public loader passes the frozen `scope` and the layout the version
 * prints under, so only the results that layout prints for that period
 * travel (`shareReviews`). `preparedAt` without scope is a version that
 * recalculates under the current layout: the month that layout gives the
 * lock's UTC day. Without either (the firm's archive) the latest result per
 * check and month stays.
 *
 * Starting from the industry's default keeps every other field at its
 * default rather than absent, so the page normalises the projection exactly
 * as it would the merged profile.
 */
export function shareReportProfile(
  profile: PracticeProfile,
  preparedAt?: string,
  scope?: Pick<ReportScope, "period"> | null,
  layoutVersion: number = REPORT_LAYOUT_VERSION,
): PracticeProfile {
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
      ? shareReviews(profile.monthlyReviews, preparedAt, scope?.period, layoutVersion)
      : profile.monthlyReviews,
    integrationDriftSummary: profile.integrationDriftSummary,
    ...shareSetupAnswers(profile),
    ...(profile.onboardingFacts
      ? { onboardingFacts: shareOnboardingFacts(profile.onboardingFacts) }
      : {}),
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
 * The setup facts the header prints: the workforce band and count (layout
 * 7's "(setup: 7–30 people)"), each a fixed choice or a number, for a
 * version locked before the model stored them (stored-model
 * `setupHeadcount`). Who set the business up, its locations, the mapping
 * scope, the setup method and the complexity answers stay behind.
 */
function shareOnboardingFacts(facts: OnboardingFacts): OnboardingFacts {
  return {
    schemaVersion: facts.schemaVersion,
    ...(facts.workforceBand !== undefined ? { workforceBand: facts.workforceBand } : {}),
    ...(facts.workforceCount !== undefined ? { workforceCount: facts.workforceCount } : {}),
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

/**
 * The review results the report prints under `layoutVersion`: the latest
 * per check (the first in the list, which is newest first, as latestReview
 * reads it) for the report's exact frozen period when supplied, and, from
 * layout 7, the month's other problems as the report prints them
 * (`sharedOtherProblems`); layouts 1 to 6 print no other problem, so none
 * travels. Without scope the version recalculates under the current
 * layout, which prints the month that layout gives the lock's UTC day
 * (`reportPeriod` from layout 5: last month through the 10th; the lock
 * day's own month before it). Without `preparedAt`, the latest per check
 * and month.
 */
function shareReviews(
  records: readonly ReviewRecord[],
  preparedAt: string | undefined,
  period: string | undefined,
  layoutVersion: number,
): ReviewRecord[] {
  const at = preparedAt ? Date.parse(preparedAt) : Number.NaN;
  const month =
    period ?? (Number.isNaN(at) ? null : printedMonth(utcDateKey(new Date(at)), layoutVersion));
  const printed = records.filter((record) => !month || record.period === month);
  const problems = printsLayoutSeven(layoutVersion)
    ? sharedOtherProblems(printed)
    : new Map<ReviewRecord, ReviewRecord>();
  const seen = new Set<string>();
  return printed.flatMap((record) => {
    if (record.key === OTHER_PROBLEM_KEY) {
      const shared = problems.get(record);
      return shared ? [shared] : [];
    }
    const key = `${record.key}|${record.period}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [record];
  });
}

/** The month a report printed under `layoutVersion` on `day` prints its checks for. */
function printedMonth(day: string, layoutVersion: number): string {
  return layoutVersion >= 5 ? reportPeriod(day) : day.slice(0, 7);
}

/**
 * Another problem's records as the report prints them (`otherProblems`,
 * `otherProblemReportLine`): each Exception, and the Done that resolves it
 * when one does. The report then prints the Done's line alone, so the
 * Exception travels without its note and who found it; an Exception nobody
 * resolved travels whole, since its line is printed. A Done that resolves
 * no Exception of its month, and any Skipped, is never printed and stays
 * behind. Keyed by the stored record, so the caller keeps the list's order.
 */
function sharedOtherProblems(records: readonly ReviewRecord[]): Map<ReviewRecord, ReviewRecord> {
  const mine = records.filter((record) => record.key === OTHER_PROBLEM_KEY);
  const shared = new Map<ReviewRecord, ReviewRecord>();
  for (const problem of mine) {
    if (problem.result !== "exception") continue;
    const resolved = mine.find(
      (r) =>
        r.result === "done" && r.period === problem.period && r.resolves === problem.recordedAt,
    );
    if (!resolved) {
      shared.set(problem, problem);
      continue;
    }
    shared.set(resolved, resolved);
    shared.set(problem, { ...problem, ownerName: "", notes: "" });
  }
  return shared;
}
