import type { IndustryTemplate } from "../templates";
import type { PracticeProfile } from "../practice-profile";
import { buildThreatAssessment } from "../threat-scoring";
import { portfolioSummary } from "../scoring/residual-engine";
import { DEFAULT_WEIGHTS } from "../scoring/weights";
import { confirmedScenarioIds, isOwnBusiness } from "../scoring/scope";
import { insuranceFigureNote } from "../scoring/dynamic-variables";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { coverageReport } from "../continuity/coverage";
import { checkInPlan, staleItems } from "../continuity/staleness";
import { contingencyCards } from "../continuity/absence-impact";
import { documentationDebt } from "../continuity/documentation";
import { plannedAbsenceReport } from "../continuity/planned-absence";
import { leaveDebriefs } from "../continuity/leave-debrief";
import { leavers as leaversReport } from "../continuity/leavers";
import { continuityCommitments, continuitySlips } from "../decisions/follow-through";
import { assessCoso } from "../coso";
import {
  casesForSodRules,
  citingCaseStats,
  detectionBreakdown,
  isOwnSector,
  observedLossRange,
  recommendedStepsForRules,
} from "../evidence";
import { buildWeeklyActions } from "../weekly-actions/build";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";

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
  });
  const sod = detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease));
  const continuity = coverageReport(tpl);
  const staleness = staleItems(tpl, today);
  const checkIns = checkInPlan(tpl, today);
  const cards = contingencyCards(tpl);
  const leave = plannedAbsenceReport(tpl, profile.plannedAbsences ?? [], profile.industry, today);
  const debriefs = leaveDebriefs(
    tpl,
    profile.plannedAbsences ?? [],
    profile.decisions,
    profile.industry,
    today,
  );
  const leaving = leaversReport(tpl, profile.decisions, today);
  const slips = continuitySlips(profile.decisions, tpl);
  const committed = continuityCommitments(profile.decisions, tpl, today);
  const coso = assessCoso(tpl, profile.staff, {
    riskVariables: profile.riskVariables,
    confirmedScenarioIds: confirmed,
    dualRelease: profile.dualRelease,
  });
  const policyNote = insuranceFigureNote(profile.riskVariables, isOwnBusiness(tpl));
  const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
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
  });
  const issues = validateProcessMap(
    tpl.processes,
    tpl.people,
    new Set(tpl.controls.map((c) => c.id)),
    profile.mapLayout ?? {},
  );
  const mapHealth = computeMapHealth(snapshots, issues, { customized: mapCustomized });
  const openRuleIds = [
    ...new Set(
      sod.conflicts
        .filter((c) => !c.residualRiskAccepted && !c.dualReleaseMitigated)
        .map((c) => c.ruleId),
    ),
  ];
  const matched = casesForSodRules(openRuleIds);
  // Same line of business first; the reader's own sector is the part they
  // check, so it should not sit at the end of the list.
  const evidence = [
    ...matched.filter((c) => isOwnSector(c, profile.industry)),
    ...matched.filter((c) => !isOwnSector(c, profile.industry)),
  ];
  const steps = recommendedStepsForRules(openRuleIds).slice(0, 6);
  // Count, median and detection routes describe the cases whose records
  // show these gaps; cases that only share a scheme are listed but not
  // counted as matches.
  const citing = citingCaseStats(openRuleIds);
  const statsFrom = citing.count > 0 ? citing.cases : evidence;
  const lossRange = observedLossRange(statsFrom);
  const found = detectionBreakdown(statsFrom);
  const docs = documentationDebt(tpl);
  return {
    threat,
    portfolio,
    sod,
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
    coso,
    actions,
    mapHealth,
    issues,
    evidence,
    citing,
    steps,
    lossRange,
    found,
    policyNote,
  };
}

export type ControlReportModel = ReturnType<typeof buildControlReportModel>;
