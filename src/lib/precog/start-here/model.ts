import type { IndustryTemplate } from "../templates";
import type { PracticeProfile } from "../practice-profile";
import type { Benchmark, CaseStudy } from "../evidence";
import {
  BENCHMARK_BY_ID,
  CASE_LIBRARY,
  casesForSodRules,
  citingCaseStats,
  recommendedStepsForRules,
  tenureExamples,
} from "../evidence";
import {
  detectSodConflicts,
  sodDetectionOptions,
  type DetectedConflict,
  type SodDetectionReport,
} from "../sod/detect";
import { openFindings, partialDualReleaseCoverage, ruleIdsOf } from "../sod/open-findings";
import { concentrationHeadline, separatedPairs } from "../sod/verdict";
import { entitlementLabel } from "../sod/conflict-rules";
import { ownerHeldPairs, rankFirstSteps } from "../coach/first-steps";
import { continuitySlips, decisionsDue } from "../decisions/follow-through";
import { checkInPlan, staleItems } from "../continuity/staleness";
import { coverageReport } from "../continuity/coverage";
import { documentationDebt } from "../continuity/documentation";
import { registerAssessed, trackRegisterFreshness } from "../continuity/register-state";
import { todayBrief } from "../continuity/today";
import { findKnowledgeRisks } from "../engine";
import { titleDutiesSentence } from "../sod/title-duties";
import { locationsById } from "../person-location";
import { industryMeta } from "../industry";
import { localDateKey } from "../dates";
import { joinWithAnd } from "../text";
import { formatUsd } from "../../utils";

/**
 * What Start here shows, one part per section in page order. Each section
 * component reads only its own part.
 */
export interface StartHereModel {
  preamble: StartHerePreambleModel;
  continuity: StartHereContinuityModel;
  exposure: StartHereExposureModel;
  cost: StartHereCostModel;
  firstSteps: StartHereFirstStepsModel;
  footer: StartHereFooterModel;
}

interface StartHereInput {
  profile: PracticeProfile;
  template: IndustryTemplate;
  today: Date;
  /**
   * The duty-conflict report the shell already computed on the same profile
   * and template, so the detector runs once per edit. Computed here when absent.
   */
  sod?: SodDetectionReport;
}

/** One duty-conflict rule and everyone who holds both of its duties. */
interface StartHereGap {
  people: string[];
  ids: string[];
  /** The conflict that stands for the rule: an unmitigated one when there is one. */
  conflict: DetectedConflict;
}

/** The long-service note beside the first top gap a long-serving person holds. */
export interface TenureNoteModel {
  ruleId: string;
  longServing: { name: string; years: number }[];
  cases: ReturnType<typeof tenureExamples>;
}

interface StartHerePreambleModel {
  overdue: ReturnType<typeof decisionsDue>["overdue"];
  slipped: ReturnType<typeof continuitySlips>;
  isSampleTeam: boolean;
  industryId: PracticeProfile["industry"];
  /** The line of business in lower case, for "the loaded dental example". */
  industryLabel: string;
}

interface StartHereContinuityModel {
  isSampleTeam: boolean;
  industryLabel: string;
  /** Items on the knowledge register, assessed or not. */
  registerSize: number;
  slippedCount: number;
  registerReady: boolean;
  trackFreshness: boolean;
  readiness: {
    coverageIndex: number;
    documentationIndex: number;
    freshness: ReturnType<typeof staleItems>;
    checkIns: ReturnType<typeof checkInPlan>;
    mostDepended: ReturnType<typeof coverageReport>["people"][number] | undefined;
  };
  staffingToday: ReturnType<typeof todayBrief>;
}

interface StartHereExposureModel {
  industryId: PracticeProfile["industry"];
  dualRelease: PracticeProfile["dualRelease"];
  /** Conflicts not accepted and not the owner's own, unmitigated first. */
  openConflicts: DetectedConflict[];
  /** One entry per rule, worst first: unmitigated, then narrowed, then covered. */
  gaps: StartHereGap[];
  topThree: StartHereGap[];
  /** Narrowed gaps below the top three. */
  narrowed: StartHereGap[];
  narrowedCount: number;
  coveredCount: number;
  /** Rules dual release covers only above a threshold: rule id to the lowest threshold. */
  partialCoverage: Map<string, number>;
  headline: ReturnType<typeof concentrationHeadline>;
  keptApart: ReturnType<typeof separatedPairs>;
  ownerHeld: ReturnType<typeof ownerHeldPairs>;
  titleDuties: string;
  unheld: string[];
  placesOf: Map<string, string[]>;
  /** "Maya (Main St and Elm St)", or the name alone for a one-site team. */
  atPlaces: (name: string, id: string) => string;
  /** Every site the given people work at, once each. */
  gapPlaces: (ids: readonly string[]) => string[];
  tenureNote: TenureNoteModel | null;
}

interface StartHereCostModel {
  /** Cases whose records show one of the open findings, with their statistics. */
  citing: ReturnType<typeof citingCaseStats>;
  /** Cases listed at the foot of the page: citing plus those sharing a scheme. */
  evidenceCount: number;
  smallOrg: boolean;
  medianLoss: Benchmark | undefined;
  medianLossValue: string | undefined;
  medianDuration: Benchmark | undefined;
  delayCurve: Benchmark | undefined;
}

interface StartHereFirstStepsModel {
  steps: ReturnType<typeof rankFirstSteps<ReturnType<typeof recommendedStepsForRules>[number]>>;
  caseById: Map<string, CaseStudy>;
  tips: Benchmark | undefined;
  /** Small organizations with a reporting channel, against larger ones. */
  hotlineGap: Benchmark | undefined;
  soleKnowledge: ReturnType<typeof findKnowledgeRisks>;
}

interface StartHereFooterModel {
  cases: CaseStudy[];
  /** Cases whose records show one of the open findings, as opposed to sharing a scheme. */
  citingIds: Set<string>;
  industryId: PracticeProfile["industry"];
}

/** Years of service at which the departure model calls a person long-serving. */
export const LONG_SERVICE_YEARS = 5;

/** Organizations under this many employees read the small-organization benchmarks. */
const SMALL_ORG_EMPLOYEES = 100;

const TENURE_CASES = tenureExamples(CASE_LIBRARY);

/** Start here's figures for one business on one day. Pure: no React, no storage. */
export function buildStartHereModel({
  profile,
  template,
  today,
  sod: given,
}: StartHereInput): StartHereModel {
  const day = localDateKey(today);
  const isSampleTeam = !profile.customPeople;
  const industryLabel = industryMeta(profile.industry).label.toLowerCase();
  const sod =
    given ??
    detectSodConflicts(template, profile.staff, sodDetectionOptions(template, profile.dualRelease));

  // Continuity.
  const slipped = continuitySlips(profile.decisions, template);
  const coverage = coverageReport(template);
  const continuity: StartHereContinuityModel = {
    isSampleTeam,
    industryLabel,
    registerSize: template.knowledge.length,
    slippedCount: slipped.length,
    registerReady: registerAssessed(template),
    trackFreshness: trackRegisterFreshness(profile, template),
    readiness: {
      coverageIndex: coverage.coverageIndex,
      documentationIndex: documentationDebt(template).documentedIndex,
      freshness: staleItems(template, day),
      checkIns: checkInPlan(template, day),
      mostDepended: coverage.people.find((load) => load.person.active && load.dependence > 0),
    },
    staffingToday: todayBrief(
      template,
      profile.plannedAbsences ?? [],
      profile.decisions,
      profile.industry,
      day,
    ),
  };

  // Exposure.
  const partialCoverage = partialDualReleaseCoverage(profile.dualRelease, sod.conflicts);
  const openConflicts = sod.conflicts
    .filter((c) => !c.residualRiskAccepted && !c.ownerHeld)
    .sort(
      (a, b) =>
        Number(a.dualReleaseMitigated) - Number(b.dualReleaseMitigated) || b.score - a.score,
    );
  const gaps = groupGaps(openConflicts, partialCoverage);
  const topThree = gaps.slice(0, 3);
  const placesOf = locationsById(template.people);
  const exposure: StartHereExposureModel = {
    industryId: profile.industry,
    dualRelease: profile.dualRelease,
    openConflicts,
    gaps,
    topThree,
    narrowed: gaps.slice(3).filter((g) => partialCoverage.has(g.conflict.ruleId)),
    narrowedCount: gaps.filter((g) => partialCoverage.has(g.conflict.ruleId)).length,
    coveredCount: gaps.filter(
      (g) => g.conflict.dualReleaseMitigated && !partialCoverage.has(g.conflict.ruleId),
    ).length,
    partialCoverage,
    headline: concentrationHeadline(sod.conflicts),
    keptApart: separatedPairs(sod.conflicts, sod.assignments),
    ownerHeld: ownerHeldPairs(sod.conflicts),
    titleDuties: isSampleTeam ? "" : titleDutiesSentence(template.people),
    unheld: sod.summary.unheldDuties.map((d) => entitlementLabel(d)),
    placesOf,
    atPlaces: (name, id) => {
      const places = placesOf.get(id);
      return places ? `${name} (${joinWithAnd(places)})` : name;
    },
    gapPlaces: (ids) => [...new Set(ids.flatMap((id) => placesOf.get(id) ?? []))],
    tenureNote: tenureNote(topThree, template.people),
  };

  // What these gaps have cost: the open findings, as the report counts them.
  const open = openFindings(sod.conflicts, partialCoverage);
  const openRuleIds = ruleIdsOf(open);
  const evidence = casesForSodRules(openRuleIds);
  const citing = citingCaseStats(openRuleIds);
  const smallOrg = Math.max(profile.staff.teamSize, template.people.length) < SMALL_ORG_EMPLOYEES;
  const medianLoss = BENCHMARK_BY_ID[smallOrg ? "bm-small-org-losses" : "bm-median-loss"];
  const cost: StartHereCostModel = {
    citing,
    evidenceCount: evidence.length,
    smallOrg,
    medianLoss,
    medianLossValue:
      smallOrg && typeof medianLoss?.numeric === "number"
        ? formatUsd(medianLoss.numeric)
        : medianLoss?.value,
    medianDuration: BENCHMARK_BY_ID["bm-median-duration"],
    delayCurve: BENCHMARK_BY_ID["bm-duration-cost-curve"],
  };

  return {
    preamble: {
      overdue: decisionsDue(profile.decisions, localDateKey(today)).overdue,
      slipped,
      isSampleTeam,
      industryId: profile.industry,
      industryLabel,
    },
    continuity,
    exposure,
    cost,
    firstSteps: {
      steps: rankFirstSteps(recommendedStepsForRules(openRuleIds), open),
      caseById: new Map(evidence.map((c) => [c.id, c])),
      tips: BENCHMARK_BY_ID["bm-tips"],
      hotlineGap: BENCHMARK_BY_ID["bm-small-org-hotline-gap"],
      soleKnowledge: findKnowledgeRisks(template).filter((r) => r.soleOwner),
    },
    footer: {
      cases: evidence,
      citingIds: new Set(citing.cases.map((c) => c.id)),
      industryId: profile.industry,
    },
  };
}

/**
 * One gap per rule, listing everyone who holds it. A rule's stand-in conflict
 * is an unmitigated one when any is, so a rule half covered by dual release
 * still reads as open. Unmitigated rules lead, then narrowed, then covered.
 */
function groupGaps(
  openConflicts: readonly DetectedConflict[],
  partialCoverage: ReadonlyMap<string, number>,
): StartHereGap[] {
  const byRule = new Map<string, StartHereGap>();
  for (const c of openConflicts) {
    const existing = byRule.get(c.ruleId);
    if (!existing) {
      byRule.set(c.ruleId, { people: [c.personName], ids: [c.personId], conflict: c });
      continue;
    }
    if (!existing.ids.includes(c.personId)) {
      existing.people.push(c.personName);
      existing.ids.push(c.personId);
    }
    if (existing.conflict.dualReleaseMitigated && !c.dualReleaseMitigated) existing.conflict = c;
  }
  const rank = (c: DetectedConflict) =>
    !c.dualReleaseMitigated ? 0 : partialCoverage.has(c.ruleId) ? 1 : 2;
  return [...byRule.values()].sort(
    (a, b) => rank(a.conflict) - rank(b.conflict) || b.conflict.score - a.conflict.score,
  );
}

/**
 * The long-service note, placed on the first of the top gaps held by someone
 * with LONG_SERVICE_YEARS or more. People are matched by id, so two people
 * with one name keep their own tenure.
 */
function tenureNote(
  topThree: readonly StartHereGap[],
  people: IndustryTemplate["people"],
): TenureNoteModel | null {
  if (!TENURE_CASES.longest) return null;
  const tenureById = new Map<string, number>();
  for (const person of people) {
    if (typeof person.tenureYears === "number") tenureById.set(person.id, person.tenureYears);
  }
  for (const gap of topThree) {
    const longServing = gap.ids
      .map((id, i) => ({ name: gap.people[i], years: tenureById.get(id) ?? 0 }))
      .filter((p) => p.years >= LONG_SERVICE_YEARS);
    if (longServing.length > 0) {
      return { ruleId: gap.conflict.ruleId, longServing, cases: TENURE_CASES };
    }
  }
  return null;
}
