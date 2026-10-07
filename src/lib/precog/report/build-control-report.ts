import type { IndustryTemplate } from "../templates";
import type { PracticeProfile } from "../practice-profile";
import { teamSource } from "../team-source";
import { buildThreatAssessment } from "../threat-scoring";
import { portfolioSummary } from "../scoring/residual-engine";
import { DEFAULT_WEIGHTS } from "../scoring/weights";
import { confirmedScenarioIds, isOwnBusiness, residualScope } from "../scoring/scope";
import { insuranceFigureNote } from "../scoring/dynamic-variables";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { handSetFigures } from "../sod/derive-staff";
import { segregationLevel } from "../scoring/bands";
import { coverageReport } from "../continuity/coverage";
import { checkInPlan, staleItems } from "../continuity/staleness";
import { contingencyCards } from "../continuity/absence-impact";
import { documentationDebt } from "../continuity/documentation";
import { procedureSummary } from "../procedures/attention";
import { plannedAbsenceReport } from "../continuity/planned-absence";
import { leaveDebriefs } from "../continuity/leave-debrief";
import { leavers as leaversReport } from "../continuity/leavers";
import { profileStandInConflicts } from "../continuity/standin-conflicts";
import { continuityCommitments, continuitySlips } from "../decisions/follow-through";
import {
  BENCHMARK_BY_ID,
  benchmarkCitation,
  casesForSodRules,
  citingCaseStats,
  isOwnSector,
  recommendedStepsForRules,
} from "../evidence";
import {
  openFindings,
  openSeverityCounts,
  partialDualReleaseCoverage,
  ruleIdsOf,
} from "../sod/open-findings";
import { openConflictHeadline } from "../headline/open-conflicts";
import { rankFirstSteps } from "../coach/first-steps";
import { withNamedSplitStep } from "../actions/do-next";
import { buildWeeklyActions } from "../weekly-actions/build";
import { buildProcessMapGraph } from "../process-graph";
import { scoreMap } from "../builder/scored-map";
import { registerAssessed } from "../continuity/register-state";
import { setupInPlaceControls } from "../onboarding/setup-answers";
import {
  continuityFollowThrough,
  decisionLog,
  executiveSummary,
  handSetNotes,
} from "./report-summary";
import { findingResponses } from "./finding-responses";

/**
 * Everything the printed report shows, computed once from the template and
 * the profile. Pure, so the report page and a locked version render the
 * same figures and a test can check them without React.
 */
export interface ControlReportInput {
  tpl: IndustryTemplate;
  profile: PracticeProfile;
  /** Whether the process map differs from the industry template. */
  mapCustomized: boolean;
  /** The calendar day the report is generated for (a locked version keeps its own). */
  today: string;
  trackFreshness: boolean;
  /** Whether the map has an owner on at least one process (see builder/map-state). */
  mapReady: boolean;
  /** The business name to print; the sample's while none has been set. */
  businessName: string;
}

export function buildControlReportModel({
  tpl,
  profile,
  mapCustomized,
  today,
  trackFreshness,
  mapReady,
  businessName,
}: ControlReportInput) {
  // Starter scenarios count only once the owner confirms them, on every
  // figure this report prints, as on the screens it summarises.
  const confirmed = confirmedScenarioIds(profile.decisions, profile.industry);
  const threat = buildThreatAssessment({
    tpl,
    practiceName: businessName,
    staff: profile.staff,
    riskVariables: profile.riskVariables,
    dualRelease: profile.dualRelease,
    confirmedScenarioIds: confirmed,
  });
  const portfolio = portfolioSummary(tpl, profile.staff, DEFAULT_WEIGHTS, {
    confirmedScenarioIds: confirmed,
    riskVariables: profile.riskVariables,
  });
  const sodOptions = sodDetectionOptions(tpl, profile.dualRelease);
  const sod = detectSodConflicts(tpl, profile.staff, sodOptions);
  // The band word beside the duty separation index, capped while a critical
  // or high finding is open, as on the duty-conflict screen; the hint counts
  // the open findings by the same rule.
  const sodOpen = openSeverityCounts(sod.conflicts, profile.dualRelease);
  const sodLevel = segregationLevel(sod.summary.segregationHealth, sodOpen);
  // A segregation score or bank-reconciliation answer set by hand on a
  // sample moves the priority and residual figures without any change in
  // who does what, so the report says so. An own team's come from its duties.
  const handSet = handSetNotes(
    handSetFigures(profile.staff, { ownTeam: teamSource(profile) === "own" }),
  );
  const continuity = coverageReport(tpl);
  const staleness = staleItems(tpl, today);
  const checkIns = checkInPlan(tpl, today);
  const cards = contingencyCards(tpl);
  // Stand-ins whose cover would create a duty conflict come last and are flagged.
  const conflictsFor = profileStandInConflicts(tpl, profile);
  const leave = plannedAbsenceReport(
    tpl,
    profile.plannedAbsences ?? [],
    profile.industry,
    today,
    conflictsFor,
  );
  const debriefs = leaveDebriefs(
    tpl,
    profile.plannedAbsences ?? [],
    profile.decisions,
    profile.industry,
    today,
    conflictsFor,
  );
  const leaving = leaversReport(tpl, profile.decisions, today, conflictsFor);
  const slips = continuitySlips(profile.decisions, tpl);
  const committed = continuityCommitments(profile.decisions, tpl, today);
  const policyNote = insuranceFigureNote(profile.riskVariables, isOwnBusiness(tpl));
  const { snapshots } = buildProcessMapGraph(tpl, profile.staff, {}, residualScope(profile));
  // Score the map as the map screen scores it: a starter process the owner
  // has not touched yet stays out of the health figure and its issues, so
  // the printed score matches the map pill and the stored history it is
  // compared with below. Weekly actions keep the full graph snapshots.
  const scored = scoreMap(tpl, tpl.processes, profile.staff, {
    profile: { industry: profile.industry, customPeople: profile.customPeople },
    people: tpl.people,
    layout: profile.mapLayout ?? {},
    customized: mapCustomized,
  });
  const issues = scored.issues;
  const mapHealth = scored.health;
  const actions = buildWeeklyActions({
    tpl,
    staff: profile.staff,
    dualRelease: profile.dualRelease,
    mapSnapshots: snapshots,
    today,
    trackFreshness,
    mapAssessed: mapReady,
    decisions: profile.decisions,
    plannedAbsences: profile.plannedAbsences,
    procedures: profile.procedures,
    integrationDriftSummary: profile.integrationDriftSummary,
    accessReconciliation: profile.accessReconciliation,
  });
  // Open as every screen counts it: not the owner's own pair and not closed by
  // dual release at every amount. The KPI hint, the duty-conflict section and
  // this summary give the same count; the status column reads the same map.
  const partialCoverage = partialDualReleaseCoverage(profile.dualRelease, sod.conflicts);
  const open = openFindings(sod.conflicts, partialCoverage);
  const openRuleIds = ruleIdsOf(open);
  const matched = casesForSodRules(openRuleIds);
  // Same line of business first; the reader's own sector is the part they
  // check, so it should not sit at the end of the list.
  const evidence = [
    ...matched.filter((c) => isOwnSector(c, profile.industry)),
    ...matched.filter((c) => !isOwnSector(c, profile.industry)),
  ];
  // Ranked as Start here ranks its "Do these first" list, so the screen and
  // the printed report lead with the same step: first by how many of the
  // open findings each control answers. The split step names the person and
  // the duty as Start here's does (actions/do-next `withNamedSplitStep`).
  const inPlace = setupInPlaceControls(profile.setupAnswers);
  const steps = withNamedSplitStep(
    rankFirstSteps(
      recommendedStepsForRules(openRuleIds, profile.industry).filter(
        (step) => !inPlace.has(step.control.id),
      ),
      open,
    ),
    open,
  ).slice(0, 6);
  // Count, median and detection routes describe only the cases whose records
  // show these gaps. Cases that merely share a scheme are listed but never
  // counted, so when no case shows the gaps the report gives no loss figure.
  const citing = citingCaseStats(openRuleIds);
  const lossRange = citing.loss;
  const found = citing.detection;
  // How many stated losses are only a floor ("at least $X"), so the report
  // can say so beside the median.
  const statsScope = {
    count: citing.count,
    floors: citing.cases.filter((c) => c.lossUsd > 0 && c.lossIsFloor).length,
  };
  const docs = documentationDebt(tpl);
  const firstPoint = profile.mapCompletenessHistory?.[0];
  const healthDelta =
    mapReady && firstPoint && mapHealth.score !== firstPoint.score
      ? { points: mapHealth.score - firstPoint.score, since: firstPoint.at }
      : null;
  const registerReady = registerAssessed(tpl);
  const summary = executiveSummary({
    // The rows and the count the conflict table prints, with the owner's own
    // pairs and the pairs dual release closes counted apart, as that section does.
    conflicts: openConflictHeadline(sod, partialCoverage),
    firstStep: steps[0]?.control.label ?? null,
    firstStepId: steps[0]?.control.id ?? null,
    registerReady,
    coverageIndex: continuity.coverageIndex,
    singlePoints: continuity.singlePoints.length,
    mapHealth: mapReady ? mapHealth : null,
    topPriority: threat.targetDeck[0]?.label ?? null,
  });
  return {
    summary,
    threat,
    portfolio,
    sod,
    sodOpen,
    sodLevel,
    /** Rules dual release covers only above a threshold, for the status column. */
    partialCoverage,
    handSet,
    continuity,
    staleness,
    checkIns,
    docs,
    cards,
    leave,
    debriefs,
    leaving,
    slips,
    committed,
    actions,
    mapHealth,
    issues,
    evidence,
    citing,
    steps,
    lossRange,
    found,
    statsScope,
    /** The published median the evidence section leads with, as it stood at lock (layout 4). */
    benchmark: smallOrgBenchmark(),
    policyNote,
    healthDelta,
    registerReady,
    procedures: procedureSummary(
      profile.procedures ?? [],
      tpl.knowledge,
      tpl.people,
      profile.industry,
      today,
    ),
    decisionLog: decisionLog(profile.decisions),
    /** The decision on each duty-conflict finding and the findings judged not valid (layout 3). */
    responses: findingResponses(sod.conflicts, profile.decisions, profile.industry),
    followThrough: continuityFollowThrough(profile.decisions, profile.industry),
  };
}

export type ControlReportModel = ReturnType<typeof buildControlReportModel>;

/**
 * The published figure the evidence section leads with: the median loss at
 * organizations under 100 employees, the size of business Precog is for,
 * with its publisher and citation.
 */
export interface ReportBenchmark {
  medianUsd: number;
  publisher: string;
  citation: string;
}

const SMALL_ORG_BENCHMARK = "bm-small-org-losses";

export function smallOrgBenchmark(): ReportBenchmark | null {
  const benchmark = BENCHMARK_BY_ID[SMALL_ORG_BENCHMARK];
  if (!benchmark || typeof benchmark.numeric !== "number") return null;
  return {
    medianUsd: benchmark.numeric,
    publisher: benchmark.source.publisher,
    citation: benchmarkCitation(benchmark),
  };
}
