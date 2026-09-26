import { useMemo } from "react";
import { LONG_SERVICE_YEARS } from "./start-here-copy";
import { usePractice } from "@/lib/precog/practice-context";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { continuitySlips, decisionsDue, localDateKey } from "@/lib/precog/decisions/follow-through";
import { useToday } from "@/lib/precog/decisions/use-today";
import { checkInPlan, staleItems } from "@/lib/precog/continuity/staleness";
import { coverageReport } from "@/lib/precog/continuity/coverage";
import { documentationDebt } from "@/lib/precog/continuity/documentation";
import { registerAssessed, registerSource } from "@/lib/precog/continuity/register-state";
import { todayBrief } from "@/lib/precog/continuity/today";
import { findKnowledgeRisks } from "@/lib/precog/engine";
import {
  BENCHMARK_BY_ID,
  CASE_LIBRARY,
  casesForSodRules,
  citingCaseStats,
  recommendedStepsForRules,
  tenureExamples,
} from "@/lib/precog/evidence";
import { ownerHeldPairs, rankFirstSteps } from "@/lib/precog/coach/first-steps";
import { concentrationHeadline, separatedPairs } from "@/lib/precog/sod/verdict";
import { entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import { titleDutiesSentence } from "@/lib/precog/onboarding/own-team";
import { locationsById, locationText } from "@/lib/precog/person-location";

export function useStartHere() {
  const { profile, template } = usePractice();
  const isSampleTeam = !profile.customPeople;
  const industryId = profile.industry;
  const today = useToday();
  const { overdue } = useMemo(
    () => decisionsDue(profile.decisions, today),
    [profile.decisions, today],
  );
  const slipped = useMemo(
    () => continuitySlips(profile.decisions, template),
    [profile.decisions, template],
  );
  const registerFrom = registerSource(profile);
  const registerReady = registerAssessed(template);
  const trackFreshness = registerFrom !== "sample" && registerReady;
  const continuityReadiness = useMemo(() => {
    const coverage = coverageReport(template);
    return {
      coverageIndex: coverage.coverageIndex,
      documentationIndex: documentationDebt(template).documentedIndex,
      freshness: staleItems(template, localDateKey(today)),
      checkIns: checkInPlan(template, localDateKey(today)),
      mostDepended: coverage.people.find((load) => load.person.active && load.dependence > 0),
    };
  }, [template, today]);
  const staffingToday = useMemo(
    () =>
      todayBrief(
        template,
        profile.plannedAbsences ?? [],
        profile.decisions,
        profile.industry,
        localDateKey(today),
      ),
    [template, profile.plannedAbsences, profile.decisions, profile.industry, today],
  );

  const sod = useMemo(
    () =>
      detectSodConflicts(
        template,
        profile.staff,
        sodDetectionOptions(template, profile.dualRelease),
      ),
    [template, profile.staff, profile.dualRelease],
  );

  const openConflicts = useMemo(
    () =>
      sod.conflicts
        .filter((c) => !c.residualRiskAccepted && !c.ownerHeld)
        .sort(
          (a, b) =>
            Number(a.dualReleaseMitigated) - Number(b.dualReleaseMitigated) || b.score - a.score,
        ),
    [sod.conflicts],
  );
  const ownerHeld = useMemo(() => ownerHeldPairs(sod.conflicts), [sod.conflicts]);
  const placesOf = useMemo(() => locationsById(template.people), [template.people]);
  const atPlaces = (name: string, id: string) => {
    const places = placesOf.get(id);
    return places ? `${name} (${locationText(places)})` : name;
  };
  const gapPlaces = (ids: readonly string[]) => [
    ...new Set(ids.flatMap((id) => placesOf.get(id) ?? [])),
  ];
  const headline = useMemo(() => concentrationHeadline(sod.conflicts), [sod.conflicts]);
  const keptApart = useMemo(
    () => separatedPairs(sod.conflicts, sod.assignments),
    [sod.conflicts, sod.assignments],
  );
  const titleDuties = isSampleTeam ? "" : titleDutiesSentence(template.people);
  const unheld = sod.summary.unheldDuties.map((d) => entitlementLabel(d));

  const partialCoverage = useMemo(() => {
    const byRuleId = new Map<string, number[]>();
    if (profile.dualRelease.enabled) {
      for (const r of profile.dualRelease.rules) {
        if (!r.enabled) continue;
        for (const id of r.mitigatesRuleIds) {
          const list = byRuleId.get(id) ?? [];
          list.push(r.thresholdUsd);
          byRuleId.set(id, list);
        }
      }
    }
    const partial = new Map<string, number>();
    const mitigated = new Set(
      sod.conflicts.filter((c) => c.dualReleaseMitigated).map((c) => c.ruleId),
    );
    for (const [ruleId, thresholds] of byRuleId) {
      const gapThresholds = thresholds.filter((t) => t > 0);
      if (
        mitigated.has(ruleId) &&
        gapThresholds.length === thresholds.length &&
        gapThresholds.length > 0
      ) {
        partial.set(ruleId, Math.min(...gapThresholds));
      }
    }
    return partial;
  }, [profile.dualRelease, sod.conflicts]);

  const gaps = useMemo(() => {
    const byRule = new Map<
      string,
      { people: string[]; ids: string[]; conflict: (typeof openConflicts)[number] }
    >();
    for (const c of openConflicts) {
      const existing = byRule.get(c.ruleId);
      if (existing) {
        if (!existing.ids.includes(c.personId)) {
          existing.people.push(c.personName);
          existing.ids.push(c.personId);
        }
        if (existing.conflict.dualReleaseMitigated && !c.dualReleaseMitigated) {
          existing.conflict = c;
        }
      } else {
        byRule.set(c.ruleId, { people: [c.personName], ids: [c.personId], conflict: c });
      }
    }
    const rank = (c: (typeof openConflicts)[number]) =>
      !c.dualReleaseMitigated ? 0 : partialCoverage.has(c.ruleId) ? 1 : 2;
    return [...byRule.values()].sort(
      (a, b) => rank(a.conflict) - rank(b.conflict) || b.conflict.score - a.conflict.score,
    );
  }, [openConflicts, partialCoverage]);

  const topThree = gaps.slice(0, 3);
  const narrowed = useMemo(
    () =>
      gaps.filter(
        (g) =>
          partialCoverage.has(g.conflict.ruleId) &&
          !topThree.some((t) => t.conflict.ruleId === g.conflict.ruleId),
      ),
    [gaps, partialCoverage, topThree],
  );
  const narrowedCount = gaps.filter((g) => partialCoverage.has(g.conflict.ruleId)).length;
  const coveredCount = gaps.filter(
    (g) => g.conflict.dualReleaseMitigated && !partialCoverage.has(g.conflict.ruleId),
  ).length;
  const openRuleIds = useMemo(() => gaps.map((g) => g.conflict.ruleId), [gaps]);
  const stillOpen = useMemo(
    () => openConflicts.filter((c) => !c.dualReleaseMitigated || partialCoverage.has(c.ruleId)),
    [openConflicts, partialCoverage],
  );

  const evidence = useMemo(() => casesForSodRules(openRuleIds), [openRuleIds]);
  const citing = useMemo(() => citingCaseStats(openRuleIds), [openRuleIds]);
  const lossRange = citing.loss;
  const duration = citing.duration;
  const found = citing.detection;
  const caseById = useMemo(() => new Map(evidence.map((c) => [c.id, c])), [evidence]);
  const steps = useMemo(
    () => rankFirstSteps(recommendedStepsForRules(openRuleIds), stillOpen),
    [openRuleIds, stillOpen],
  );

  const tenureByName = new Map<string, number>();
  for (const person of template.people) {
    if (typeof person.tenureYears === "number") tenureByName.set(person.name, person.tenureYears);
  }
  const tenureCases = useMemo(() => tenureExamples(CASE_LIBRARY), []);
  const tenureNoteRuleId =
    topThree.find(({ people }) =>
      people.some((name) => (tenureByName.get(name) ?? 0) >= LONG_SERVICE_YEARS),
    )?.conflict.ruleId ?? null;

  const soleKnowledge = useMemo(
    () => findKnowledgeRisks(template).filter((r) => r.soleOwner),
    [template],
  );

  const smallOrg = Math.max(profile.staff.teamSize, template.people.length) < 100;
  const medianLoss = BENCHMARK_BY_ID[smallOrg ? "bm-small-org-losses" : "bm-median-loss"];
  const medianLossValue =
    smallOrg && typeof medianLoss?.numeric === "number"
      ? `$${medianLoss.numeric.toLocaleString("en-US")}`
      : medianLoss?.value;
  const medianDuration = BENCHMARK_BY_ID["bm-median-duration"];
  const delayCurve = BENCHMARK_BY_ID["bm-duration-cost-curve"];
  const tips = BENCHMARK_BY_ID["bm-tips"];

  return {
    profile,
    template,
    isSampleTeam,
    industryId,
    overdue,
    slipped,
    registerReady,
    trackFreshness,
    continuityReadiness,
    staffingToday,
    openConflicts,
    ownerHeld,
    placesOf,
    atPlaces,
    gapPlaces,
    headline,
    keptApart,
    titleDuties,
    unheld,
    partialCoverage,
    gaps,
    topThree,
    narrowed,
    narrowedCount,
    coveredCount,
    evidence,
    citing,
    lossRange,
    duration,
    found,
    caseById,
    steps,
    tenureByName,
    tenureCases,
    tenureNoteRuleId,
    soleKnowledge,
    smallOrg,
    medianLoss,
    medianLossValue,
    medianDuration,
    delayCurve,
    tips,
    dualRelease: profile.dualRelease,
  };
}

export type StartHereModel = ReturnType<typeof useStartHere>;
