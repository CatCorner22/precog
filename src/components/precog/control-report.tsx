import { INDEX_BASIS } from "@/lib/precog/scoring/bands";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { industryMeta } from "@/lib/precog/industry";
import { buildThreatAssessment } from "@/lib/precog/threat-scoring";
import { portfolioSummary } from "@/lib/precog/scoring/residual-engine";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { mitigatedSodRuleIds } from "@/lib/precog/controls/dual-release";
import {
  contingencyCards,
  coverageReport,
  DOCUMENTATION_LABEL,
  documentationDebt,
  documentationState,
  checkInPlan,
  firstName,
  LEVEL_LABEL,
  staleItems,
  STATUS_LABEL,
  CONFIRMATION_MAX_AGE_DAYS,
} from "@/lib/precog/continuity/coverage";
import { registerAssessed, trackRegisterFreshness } from "@/lib/precog/continuity/register-state";
import { mapAssessed, mapNotAssessedNote, mapSource } from "@/lib/precog/builder/map-state";
import {
  formatDateRange,
  handoffDeadline,
  leadLabel,
  plannedAbsenceReport,
  procedurePointer,
} from "@/lib/precog/continuity/planned-absence";
import { leaveDebriefs, standInAlreadyStrong } from "@/lib/precog/continuity/leave-debrief";
import {
  handoverDeadline,
  leaverLead,
  leavers as leaversReport,
} from "@/lib/precog/continuity/leavers";
import {
  continuityCommitments,
  continuitySlips,
  continuityStepKey,
  handoffCommitment,
  isDecisionOpen,
  type ContinuityCommitment,
  linkedContinuityStep,
  linkedKnowledgeId,
  localDateKey,
  slipLabels,
} from "@/lib/precog/decisions/follow-through";
import { assessCoso } from "@/lib/precog/coso";
import {
  METHOD_CAVEATS,
  casesForSodRules,
  citingCaseStats,
  detectionBreakdown,
  observedLossRange,
  recommendedStepsForRules,
  isOwnSector,
} from "@/lib/precog/evidence";
import { buildWeeklyActions } from "@/components/precog/weekly-action-plan-data";
import {
  buildProcessMapGraph,
  computeMapHealth,
  validateProcessMap,
} from "@/lib/precog/process-graph";
import { DECISION_KIND_LABEL } from "@/lib/precog/practice-profile";
import { PRIORITY_BAND_LABEL } from "@/lib/precog/map-vision";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Marks a recommended step the owner has already logged in the Journal, so it reads as follow-up, not fresh advice. */
function CommitmentTag({ c }: { c: ContinuityCommitment | undefined }) {
  if (!c) return null;
  const first = c.person ? firstName(c.person.name) : undefined;
  return (
    <span className={`ml-1 text-xs ${c.overdue ? "text-amber-700" : "text-neutral-500"}`}>
      {c.overdue
        ? `— review overdue since ${c.reviewBy}: did it happen? Close it in the Journal`
        : `— in progress${first && c.step === "cover" ? ` (${first})` : ""} since ${c.decision.createdAt.slice(0, 10)}${c.reviewBy ? `, review ${c.reviewBy}` : ""}`}
    </span>
  );
}

/** Print-friendly control priorities report — File → Print → Save as PDF. */
export function ControlReport() {
  const { profile, mapCustomized } = usePractice();
  const tpl = useTemplate();
  const industry = industryMeta(profile.industry);
  const generated = new Date();
  const today = localDateKey(generated);
  const registerReady = registerAssessed(tpl);
  const trackFreshness = trackRegisterFreshness(profile, tpl);
  // The starter map with nobody assigned, or an empty map, has no health,
  // ownership, documentation or issues to print; one sentence says why.
  const mapReady = mapAssessed(profile);
  const mapNote = mapNotAssessedNote(profile);
  const mapFrom = mapSource(profile);

  const data = useMemo(() => {
    const threat = buildThreatAssessment({
      tpl,
      practiceName: profile.practiceName,
      staff: profile.staff,
      riskVariables: profile.riskVariables,
      dualRelease: profile.dualRelease,
    });
    const portfolio = portfolioSummary(tpl, profile.staff);
    const sod = detectSodConflicts(tpl, profile.staff, {
      dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(profile.dualRelease, tpl),
    });
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
    const coso = assessCoso(tpl);
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
    };
  }, [tpl, profile, mapCustomized, today, trackFreshness, mapReady]);

  const {
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
  } = data;
  const caseById = new Map(evidence.map((c) => [c.id, c]));
  const history = profile.mapHealthHistory ?? [];
  const firstPoint = history[0];
  const healthDelta = mapReady && firstPoint ? mapHealth.score - firstPoint.score : null;
  const top = threat.targetDeck.slice(0, 12);
  const openDecisions = profile.decisions.slice(0, 10);
  const continuityDecisions = profile.decisions.filter((d) =>
    linkedKnowledgeId(d, profile.industry),
  );
  const openContinuity = continuityDecisions
    .filter((d) => isDecisionOpen(d))
    .sort((a, b) => (a.reviewBy ?? "").localeCompare(b.reviewBy ?? ""));
  const doneContinuity = continuityDecisions.filter(
    (d) => !isDecisionOpen(d) && d.reviews?.[d.reviews.length - 1]?.outcome === "done",
  ).length;
  const droppedContinuity = continuityDecisions.filter(
    (d) => !isDecisionOpen(d) && d.reviews?.[d.reviews.length - 1]?.outcome !== "done",
  ).length;

  return (
    <div className="report min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-white text-neutral-900">
      <div className="print:hidden sticky top-[var(--grok-banner-h,0px)] z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
          >
            <ArrowLeft className="size-4" /> Back to dashboard
          </Link>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-4xl px-6 py-8 print:px-0 print:py-0">
        <header className="border-b-2 border-neutral-900 pb-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">
            Internal control priorities
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{profile.practiceName}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {industry.label} · {profile.staff.teamSize}-person {industry.teamLabel} ·{" "}
            {mapFrom === "starter"
              ? "starter process map"
              : mapCustomized
                ? "custom process map"
                : "industry template map"}{" "}
            · generated{" "}
            {generated.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kpi
            label="Map health"
            value={mapReady ? String(mapHealth.score) : "—"}
            hint={mapReady ? mapHealth.bandLabel : "Not assessed yet"}
          />
          <Kpi
            label="Threat index"
            value={String(threat.overallThreatIndex)}
            hint={threat.classificationLabel}
          />
          <Kpi
            label="Avg residual"
            value={String(portfolio.averageResidual)}
            hint={`${portfolio.criticalPath} on critical path`}
          />
          <Kpi
            label="SoD health"
            value={String(sod.summary.segregationHealth)}
            hint={`${sod.summary.critical} critical conflicts`}
          />
          <Kpi label="COSO" value={String(coso.overall)} hint={coso.overallStatus} />
        </section>
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">{INDEX_BASIS}</p>

        <Section title="Process map health">
          {mapNote ? (
            <p className="text-sm text-neutral-700">Not assessed yet. {mapNote}</p>
          ) : (
            <>
              <p className="text-sm text-neutral-700">
                {mapHealth.summary}{" "}
                {healthDelta !== null && healthDelta !== 0 && firstPoint
                  ? `Score has moved ${healthDelta > 0 ? "+" : ""}${healthDelta} points since ${fmtDate(firstPoint.at)}.`
                  : ""}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {mapHealth.dimensions.map((d) => (
                  <div key={d.id} className="rounded border border-neutral-300 p-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium">{d.label}</span>
                      <span className="text-sm font-bold tabular">{d.score}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-200">
                      <div
                        className="h-full rounded-full bg-neutral-800"
                        style={{ width: `${d.score}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-neutral-600">{d.hint}</p>
                  </div>
                ))}
              </div>
              {issues.filter((i) => i.severity !== "info").length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-neutral-700">
                  {issues
                    .filter((i) => i.severity !== "info")
                    .slice(0, 6)
                    .map((i) => (
                      <li key={i.id}>{i.message}</li>
                    ))}
                </ul>
              )}
            </>
          )}
        </Section>

        <Section title="Executive summary">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {threat.missionBrief.slice(0, 5).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Section>

        <Section title="This week's actions">
          <ol className="space-y-2">
            {actions.map((a, i) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="w-5 shrink-0 font-semibold tabular text-neutral-500">
                  {i + 1}.
                </span>
                <div>
                  <p className="font-medium">
                    {a.title}{" "}
                    <span className="ml-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
                      {a.effort} effort
                    </span>
                  </p>
                  <p className="text-neutral-600">{a.why}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Priority stack">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
                <th className="py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Target</th>
                <th className="py-1.5 pr-2">Type</th>
                <th className="py-1.5 pr-2">Band</th>
                <th className="py-1.5 pr-2 text-right">Priority</th>
                <th className="py-1.5 text-right">Exposure</th>
              </tr>
            </thead>
            <tbody>
              {top.map((t, i) => (
                <tr key={`${t.kind}-${t.id}`} className="border-b border-neutral-200 align-top">
                  <td className="py-1.5 pr-2 tabular text-neutral-500">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs text-neutral-600">{t.impactHint}</p>
                  </td>
                  <td className="py-1.5 pr-2 capitalize text-neutral-700">{t.kind}</td>
                  <td className="py-1.5 pr-2">
                    <span
                      className={
                        t.band === "white_hot" || t.band === "critical"
                          ? "font-semibold text-red-700"
                          : t.band === "elevated"
                            ? "font-medium text-amber-700"
                            : "text-neutral-600"
                      }
                    >
                      {PRIORITY_BAND_LABEL[t.band]}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular">{t.priority}</td>
                  <td className="py-1.5 text-right tabular text-neutral-700">
                    {t.expectedLoss ? formatUsd(t.expectedLoss) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Segregation of duties">
          <p className="text-sm text-neutral-700">
            {sod.summary.critical} critical, {sod.summary.high} high, {sod.summary.medium} medium
            conflicts across {sod.summary.peopleWithConflicts} of {sod.assignments.length} people.{" "}
            {sod.summary.dualReleaseMitigated} mitigated by dual release.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {sod.recommendations.slice(0, 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>

        {evidence.length > 0 && (
          <Section title="What these gaps have cost other businesses">
            <p className="text-sm text-neutral-700">
              {citing.count > 0
                ? `${citing.count} prosecuted ${citing.count === 1 ? "case shows" : "cases show"} the open duty conflicts above${
                    evidence.length > citing.count
                      ? `; ${evidence.length - citing.count} more share their schemes`
                      : ""
                  }.`
                : `No prosecuted case in the library shows these exact conflicts; the ${evidence.length} below share their schemes.`}
              {lossRange
                ? ` Median loss ${formatUsd(lossRange.median)}, from ${formatUsd(lossRange.low)} to ${formatUsd(lossRange.high)} across ${lossRange.n} cases with a stated figure.`
                : ""}
              {found.known > 0
                ? ` How they came to light, where the source says: ${found.byRoute
                    .map(
                      (r) => `${(REPORT_DETECTION[r.route] ?? r.route).toLowerCase()} (${r.count})`,
                    )
                    .join(", ")}.`
                : ""}
              {/* Stated even when every case is silent: a missing fact is itself a finding. */}
              {found.n > 0 ? ` Not stated in the source: ${found.unknown} of ${found.n}.` : ""}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
              These describe other organizations, not this business, and they are prosecuted cases,
              so small thefts are absent. They are a reference class, not a forecast.
            </p>

            <h3 className="mt-4 text-sm font-semibold text-neutral-800">Do these first</h3>
            <p className="text-xs text-neutral-500">
              Ordered by how many of the matching cases each control would plausibly have caught, in
              our reading of the record. That reading is ours, not a finding from any case.
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
              {steps.map((st) => (
                <li key={st.control.id}>
                  <span className="font-medium">{st.control.label}</span>
                  <span className="text-neutral-600"> — {st.control.why}</span>
                  <ul className="mt-1 list-disc pl-5 text-xs text-neutral-600">
                    {st.supportingCaseIds.map((id) => {
                      const c = caseById.get(id);
                      return c ? (
                        <li key={id}>
                          {c.title}
                          {c.lossUsd > 0
                            ? ` (${c.lossIsFloor ? "at least " : ""}${formatUsd(c.lossUsd)})`
                            : ""}
                        </li>
                      ) : null;
                    })}
                  </ul>
                </li>
              ))}
            </ol>

            <h3 className="mt-4 text-sm font-semibold text-neutral-800">
              Cases cited, matched to these gaps in our reading of the record
            </h3>
            <ul className="mt-1 space-y-1 text-xs text-neutral-600">
              {evidence.map((c) => (
                <li key={c.id}>
                  {c.title}
                  {c.resolvedYear ? ` (${c.resolvedYear})` : ""} — {c.source.publisher},{" "}
                  <span className="break-all">{c.source.url}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1 text-xs text-neutral-500">
              {METHOD_CAVEATS.slice(0, 3).map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Continuity of operations">
          {!registerReady ? (
            <p className="text-sm text-neutral-700">
              Not assessed yet.{" "}
              {tpl.knowledge.length === 0
                ? "The register is empty: the business has not yet listed the duties, tasks and know-how it runs on."
                : `The register holds ${tpl.knowledge.length} starter items from the ${industry.label.toLowerCase()} example with nobody marked on any of them, so no continuity figure is reported.`}
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-700">
                <strong>{continuity.coverageIndex}%</strong> of work (weighted by criticality) has
                two or more people who can run it alone. {continuity.counts.uncovered} item
                {continuity.counts.uncovered === 1 ? "" : "s"} nobody can run,{" "}
                {continuity.counts.single} with exactly one person, {continuity.counts.thin} with
                one person plus a learner.
              </p>
              {continuity.singlePoints.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-600">
                  No critical or important item is uncovered or relies on one person without a
                  learner.
                </p>
              ) : (
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {continuity.singlePoints.map((s) => (
                    <li key={s.item.id} className="border-b border-neutral-200 py-1">
                      <div className="flex justify-between gap-2">
                        <span>
                          {s.item.name}
                          <span className="text-neutral-500">
                            {" "}
                            · {s.primaries[0]?.name ?? "nobody"}
                          </span>
                        </span>
                        <span className="text-xs text-neutral-600">{STATUS_LABEL[s.status]}</span>
                      </div>
                      {s.suggestedBackups[0] && (
                        <div className="text-xs text-neutral-500">
                          Train next: {s.suggestedBackups[0].person.name} (
                          {s.suggestedBackups[0].reasons[0]})
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {continuity.plan.length > 0 && (
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                  {continuity.plan.slice(0, 5).map((m) => (
                    <li key={m.item.id}>
                      {m.action}
                      <CommitmentTag c={committed.get(continuityStepKey(m.item.id, "cover"))} />
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-sm text-neutral-700">
                <strong>{docs.documentedIndex}%</strong> of work (weighted by criticality) is
                written down and findable. {docs.counts.none} item(s) with nothing written,{" "}
                {docs.counts.unlocated} written but location not recorded.
              </p>
              {docs.gaps.length > 0 && (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  {docs.gaps.slice(0, 5).map((g) => (
                    <li key={g.item.id}>
                      <span className="text-neutral-500">{DOCUMENTATION_LABEL[g.state]} · </span>
                      {g.action}
                      <CommitmentTag
                        c={committed.get(
                          continuityStepKey(g.item.id, g.state === "none" ? "document" : "locate"),
                        )}
                      />
                    </li>
                  ))}
                </ol>
              )}
              {trackFreshness && (
                <p className="mt-3 text-sm text-neutral-700">
                  <strong>{staleness.confirmedIndex}%</strong> of work (weighted by criticality) was
                  confirmed in the last {CONFIRMATION_MAX_AGE_DAYS} days.
                  {staleness.stale.length > 0 && (
                    <> {staleness.stale.length} item(s) to re-confirm.</>
                  )}
                </p>
              )}
              {trackFreshness && staleness.stale.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-neutral-600">
                  {checkIns.checkIns.slice(0, 6).map((c) => (
                    <li key={c.person.id}>
                      <strong>Check in with {c.person.name}</strong> — {c.items.length}{" "}
                      {c.items.length === 1 ? "entry" : "entries"}
                      {c.soleCount > 0 && ` (${c.soleCount} nobody else can run alone)`}:{" "}
                      {c.items.map((entry) => entry.item.name).join(", ")}
                    </li>
                  ))}
                  {checkIns.checkIns.length > 6 && (
                    <li>{checkIns.checkIns.length - 6} more people to check in with.</li>
                  )}
                  {checkIns.unheld.length > 0 && (
                    <li>
                      <strong>Nobody active holds</strong> —{" "}
                      {checkIns.unheld.map((entry) => entry.item.name).join(", ")}: confirm they
                      still matter or assign someone.
                    </li>
                  )}
                </ul>
              )}
              {continuity.people.filter((l) => l.person.active && l.soleItems.length > 0).length >
                0 && (
                <ul className="mt-3 grid gap-1 text-xs text-neutral-600 sm:grid-cols-2">
                  {continuity.people
                    .filter((l) => l.person.active && l.soleItems.length > 0)
                    .slice(0, 6)
                    .map((l) => (
                      <li key={l.person.id}>
                        <span className="font-medium text-neutral-800">{l.person.name}</span> —{" "}
                        {l.dependence}% of must-do work stops if out; only they can do:{" "}
                        {l.soleItems.map((k) => k.name).join(", ")}
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
        </Section>

        {leave.windows.length > 0 && (
          <Section
            title={
              leave.windows.some((w) => w.absence.unplanned)
                ? "Out today and planned leave — what stops and who covers"
                : "Planned leave — what stops and who covers"
            }
          >
            <p className="text-xs text-neutral-500">
              Absences on the register, soonest first — leave booked ahead and anyone recorded out
              on the day (sick, emergency). Hand-offs already logged in the Journal are marked;
              everything else needs a named stand-in before the leave starts, or today for anyone
              already out.
            </p>
            <ul className="mt-2 space-y-3">
              {leave.windows.slice(0, 8).map((w) => {
                const others = w.overlaps.map((o) => firstName(o.person.name));
                const peakOthers = w.peak.people
                  .filter((p) => p.id !== w.person.id)
                  .map((p) => firstName(p.name));
                return (
                  <li
                    key={w.absence.id}
                    className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {w.person.name} — {formatDateRange(w.absence.from, w.absence.to)}
                        <span className="ml-2 text-xs font-normal text-neutral-600">
                          {w.absence.unplanned
                            ? w.status === "current"
                              ? `out unexpectedly${w.absence.to === today ? ", today" : `, through ${w.absence.to}`}`
                              : `unplanned · ${leadLabel(w.daysUntil)}`
                            : w.status === "current"
                              ? `out now, back after ${w.absence.to}`
                              : `${leadLabel(w.daysUntil)} · ${w.lengthDays} day${w.lengthDays === 1 ? "" : "s"}`}
                        </span>
                      </span>
                      <span className="text-xs text-neutral-600">
                        {(w.todayImpact ?? w.impact).dependence}% of must-do work stops
                      </span>
                    </div>
                    {others.length > 0 && (
                      <p className="mt-1 text-xs text-amber-800">
                        Overlapping leave: {others.join(", ")} also out for part of this window.{" "}
                        {w.peak.extraStops.length > 0
                          ? `Stops below are for ${formatDateRange(w.peak.from, w.peak.to)}, when ${peakOthers.join(" and ")} ${peakOthers.length === 1 ? "is" : "are"} also away.`
                          : "Nothing extra stops on the shared days."}
                      </p>
                    )}
                    {w.impact.stops.length > 0 ? (
                      <table className="mt-2 w-full text-xs">
                        <thead>
                          <tr className="text-left text-neutral-500">
                            <th className="py-0.5 font-normal">Stops</th>
                            <th className="py-0.5 font-normal">Stand-in</th>
                            {w.status === "current" && (
                              <th className="py-0.5 font-normal">Procedure</th>
                            )}
                            <th className="py-0.5 font-normal">Hand-off</th>
                          </tr>
                        </thead>
                        <tbody>
                          {w.impact.stops.map((s) => {
                            const c = handoffCommitment(committed, s.item.id, w.absence.id);
                            return (
                              <tr key={s.item.id} className="border-t border-neutral-200 align-top">
                                <td className="py-1 pr-2">{s.item.name}</td>
                                <td className="py-1 pr-2">
                                  {s.standIn?.name ?? "Nobody — outside provider or it waits"}
                                </td>
                                {w.status === "current" && (
                                  <td className="py-1 pr-2 text-neutral-600">
                                    {procedurePointer(s)}
                                  </td>
                                )}
                                <td className="py-1 text-neutral-600">
                                  {c
                                    ? c.overdue
                                      ? `Logged; review overdue${c.reviewBy ? ` (${c.reviewBy})` : ""}`
                                      : `Logged${c.reviewBy ? `; review ${c.reviewBy}` : ""}`
                                    : w.status === "current"
                                      ? "Not logged — decide today"
                                      : `Not logged — by ${handoffDeadline(w, today)}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="mt-2 text-xs text-neutral-600">
                        Nothing on the register stops; someone else can run everything they hold.
                      </p>
                    )}
                    {w.impact.orphanedProcesses.length > 0 && (
                      <p className="mt-2 text-xs text-neutral-600">
                        No owner left for: {w.impact.orphanedProcesses.join(", ")}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-neutral-600">
                      Left in the business:{" "}
                      {w.impact.remaining.length > 0
                        ? w.impact.remaining.map((p) => p.name).join(", ")
                        : "nobody"}
                    </p>
                  </li>
                );
              })}
            </ul>
            {leave.windows.length > 8 && (
              <p className="mt-2 text-xs text-neutral-500">
                {leave.windows.length - 8} more absences further out; see the Who knows what tab.
              </p>
            )}
          </Section>
        )}

        {debriefs.length > 0 && (
          <Section title="Absence just ended — debrief the stand-ins">
            <p className="text-xs text-neutral-500">
              Leave, or a day out sick, is the one time a stand-in runs the work for real. For each
              entry covered, decide whether the register can now say they can do it alone (confirmed
              today, hand-off closed) or whether it becomes a tracked cross-training step. Answer on
              the Who knows what tab so it stops appearing here.
            </p>
            <ul className="mt-2 space-y-3">
              {debriefs.slice(0, 6).map((d) => (
                <li
                  key={d.absence.id}
                  className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {d.person.name} — back from {formatDateRange(d.absence.from, d.absence.to)}
                    </span>
                    <span className="text-xs text-neutral-600">
                      {d.lengthDays} day{d.lengthDays === 1 ? "" : "s"}{" "}
                      {d.absence.unplanned ? "out unexpectedly" : "away"}
                      {d.daysSince > 0
                        ? `, ended ${d.daysSince} day${d.daysSince === 1 ? "" : "s"} ago`
                        : ", ended today"}
                    </span>
                  </div>
                  <table className="mt-2 w-full text-xs">
                    <thead>
                      <tr className="text-left text-neutral-500">
                        <th className="py-0.5 font-normal">Covered</th>
                        <th className="py-0.5 font-normal">Stand-in</th>
                        <th className="py-0.5 font-normal">Decide</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((e) => (
                        <tr key={e.item.id} className="border-t border-neutral-200 align-top">
                          <td className="py-1 pr-2">{e.item.name}</td>
                          <td className="py-1 pr-2">
                            {e.standIn
                              ? `${e.standIn.name}${e.standInLevel ? ` (${LEVEL_LABEL[e.standInLevel].toLowerCase()})` : ""}`
                              : "Nobody was lined up"}
                          </td>
                          <td className="py-1 text-neutral-600">
                            {!e.standIn
                              ? "Who stepped in? Record them on the register."
                              : standInAlreadyStrong(e)
                                ? e.handoff
                                  ? "Already can do it alone; close the logged hand-off."
                                  : "Already can do it alone; nothing to change."
                                : e.training
                                  ? "Can do alone now? Then close the cross-training entry."
                                  : "Can do alone now? Or log it as cross-training."}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </li>
              ))}
            </ul>
            {debriefs.length > 6 && (
              <p className="mt-2 text-xs text-neutral-500">
                {debriefs.length - 6} more to debrief; see the Who knows what tab.
              </p>
            )}
          </Section>
        )}

        {leaving.length > 0 && (
          <Section title="Leaving the team — hand-over before the last day">
            <p className="text-xs text-neutral-500">
              People working their notice still count as cover until their last day. Every register
              entry only they can run alone must be handed to a named successor, written down and
              placed where the successor can find it before that date; processes they alone own need
              a new owner. Once the date has passed, mark them as left on the Who knows what tab so
              the coverage figures stop counting them (the record stays in the history).
            </p>
            <ul className="mt-2 space-y-3">
              {leaving.slice(0, 6).map((l) => (
                <li
                  key={l.person.id}
                  className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {l.person.name} — {leaverLead(l.daysLeft)} (last day {l.lastDay})
                    </span>
                    <span className="text-xs text-neutral-600">
                      {l.status === "gone"
                        ? "Still counted as cover — mark as left"
                        : l.handover.length === 0
                          ? "Nothing on the register depends on them alone"
                          : `${l.handover.length} ${l.handover.length === 1 ? "entry" : "entries"} to hand over by ${handoverDeadline(l, today)}${l.unlogged > 0 ? `, ${l.unlogged} not yet in the Journal` : ""}`}
                    </span>
                  </div>
                  {l.handover.length > 0 && (
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-neutral-500">
                          <th className="py-0.5 font-normal">Only they can run</th>
                          <th className="py-0.5 font-normal">Successor to train</th>
                          <th className="py-0.5 font-normal">Written procedure</th>
                          <th className="py-0.5 font-normal">Journal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.handover.map((h) => (
                          <tr key={h.item.id} className="border-t border-neutral-200 align-top">
                            <td className="py-1 pr-2">
                              {h.item.name}
                              {h.item.criticality === "critical" ? " (critical)" : ""}
                            </td>
                            <td className="py-1 pr-2">
                              {h.successor
                                ? `${h.successor.name}${h.successorLevel ? ` (${LEVEL_LABEL[h.successorLevel].toLowerCase()})` : " (starting cold)"}`
                                : "Nobody left to take it"}
                            </td>
                            <td className="py-1 pr-2">
                              {!h.item.documented
                                ? "Nothing written down"
                                : h.item.procedureLocation?.trim()
                                  ? h.item.procedureLocation.trim()
                                  : "Written; location not recorded"}
                            </td>
                            <td className="py-1 text-neutral-600">
                              {h.training
                                ? `Training logged${h.training.reviewBy ? `, review ${h.training.reviewBy}` : ""}`
                                : "Not logged"}
                              {h.documenting ? "; write-up logged" : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {l.orphanedProcesses.length > 0 && (
                    <p className="mt-2 text-xs text-neutral-600">
                      Processes needing a new owner: {l.orphanedProcesses.join(", ")}.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-neutral-600">
                    {l.remaining.length > 0
                      ? `Left in the business after ${l.lastDay}: ${l.remaining.map((p) => p.name).join(", ")}.`
                      : "Nobody else is left in the business."}
                  </p>
                </li>
              ))}
            </ul>
            {leaving.length > 6 && (
              <p className="mt-2 text-xs text-neutral-500">
                {leaving.length - 6} more leaving; see the Who knows what tab.
              </p>
            )}
          </Section>
        )}

        {cards.length > 0 && (
          <Section title="Contingency cards — if someone is out tomorrow">
            <p className="text-xs text-neutral-500">
              One card per person whose absence stops work. Hand the named stand-in the card and the
              written procedure; items without a location need one recorded.
            </p>
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {cards.slice(0, 8).map((c) => (
                <li
                  key={c.people[0].id}
                  className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">If {c.people[0].name} is out</span>
                    <span className="text-xs text-neutral-600">
                      {c.dependence}% of must-do work stops
                    </span>
                  </div>
                  {c.stops.length > 0 && (
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-neutral-500">
                          <th className="py-0.5 font-normal">Stops</th>
                          <th className="py-0.5 font-normal">Stand-in</th>
                          <th className="py-0.5 font-normal">Written procedure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.stops.map((s) => (
                          <tr key={s.item.id} className="border-t border-neutral-200 align-top">
                            <td className="py-1 pr-2">{s.item.name}</td>
                            <td className="py-1 pr-2">
                              {s.standIn?.name ?? "Nobody — outside provider or it waits"}
                            </td>
                            <td className="py-1 text-neutral-600">
                              {!s.item.documented
                                ? "None written"
                                : s.item.procedureLocation?.trim() ||
                                  "Exists; location not recorded"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {c.orphanedProcesses.length > 0 && (
                    <p className="mt-2 text-xs text-neutral-600">
                      Only listed owner of: {c.orphanedProcesses.join(", ")}
                    </p>
                  )}
                  <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs">
                    {c.actions.slice(0, 3).map((a) => (
                      <li key={a.text}>{a.text}</li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
            {cards.length > 8 && (
              <p className="mt-2 text-xs text-neutral-500">
                {cards.length - 8} more people have smaller exposures; see the Who knows what tab.
              </p>
            )}
          </Section>
        )}

        <Section title="Process map">
          {mapFrom === "starter" && (
            <p className="mb-2 text-sm text-neutral-700">
              Starter map from the {industry.label.toLowerCase()} example: {tpl.processes.length}{" "}
              processes, none with an owner yet.
            </p>
          )}
          {mapNote && mapFrom !== "starter" && (
            <p className="text-sm text-neutral-700">{mapNote}</p>
          )}
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {tpl.processes
              .slice()
              .sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0))
              .map((p) => (
                <li key={p.id} className="border-b border-neutral-200 py-1">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-neutral-500">
                    {" "}
                    · {(p.risks ?? []).length} risks · {(p.ideas ?? []).length} ideas
                    {mapFrom === "starter"
                      ? ""
                      : ` · ${
                          (p.ownerPersonIds ?? [])
                            .map((id) => {
                              const person = tpl.people.find((x) => x.id === id);
                              return person ? firstName(person.name) : undefined;
                            })
                            .filter(Boolean)
                            .join(", ") || "no owner"
                        }`}
                  </span>
                </li>
              ))}
          </ul>
        </Section>

        {continuityDecisions.length > 0 && (
          <Section title="Continuity follow-through">
            <p className="text-xs text-neutral-500">
              Cross-training, hand-off and write-it-down steps logged from the register:{" "}
              {openContinuity.length} open, {doneContinuity} closed as done
              {slips.length > 0 ? `, ${slips.length} closed as done but slipped since` : ""}
              {droppedContinuity > 0 ? `, ${droppedContinuity} closed as no longer relevant` : ""}.
              Coverage and documentation are the register today, not when the step was logged.
            </p>
            {slips.length > 0 && (
              <ul className="mt-2 space-y-1.5 text-sm">
                {slips.map((slip) => {
                  const { decision: d } = slip;
                  const labels = slipLabels(slip);
                  return (
                    <li key={d.id} className="border-b border-neutral-200 pb-1.5">
                      <p>
                        <span className="font-medium text-red-700">Slipped</span> · {d.subject}
                        <span className="text-neutral-500">
                          {" "}
                          · {labels.from} when closed → {labels.to} now
                        </span>
                      </p>
                      {d.note && <p className="text-neutral-600">{d.note}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
            {openContinuity.length > 0 && (
              <ul className="mt-2 space-y-1.5 text-sm">
                {openContinuity.map((d) => {
                  const item = continuity.items.find(
                    (i) => i.item.id === linkedKnowledgeId(d, profile.industry),
                  );
                  const step = linkedContinuityStep(d);
                  const state = !item
                    ? "no longer on the register"
                    : step === "document" || step === "locate"
                      ? DOCUMENTATION_LABEL[documentationState(item.item)].toLowerCase()
                      : STATUS_LABEL[item.status].toLowerCase();
                  const overdue = Boolean(d.reviewBy && d.reviewBy < today);
                  return (
                    <li key={d.id} className="border-b border-neutral-200 pb-1.5">
                      <p>
                        <span className="font-medium">{d.subject}</span>
                        <span className="text-neutral-500">
                          {" "}
                          · {state}
                          {d.reviewBy ? ` · review ${fmtDate(d.reviewBy)}` : ""}
                          {d.reviews?.length ? ` · reviewed ${d.reviews.length}×` : ""}
                        </span>
                        {overdue && <span className="ml-1 font-medium text-red-700">overdue</span>}
                      </p>
                      {d.note && <p className="text-neutral-600">{d.note}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
            {openContinuity.length === 0 && slips.length === 0 && (
              <p className="mt-2 text-sm text-neutral-600">
                {doneContinuity > 0
                  ? droppedContinuity > 0
                    ? "Nothing open and nothing slipped — every step closed as done still holds; the rest were dropped as no longer relevant."
                    : "Nothing open and nothing slipped — every logged step has been completed and still holds."
                  : "Nothing open — every logged step was closed as no longer relevant, so none has been completed."}
              </p>
            )}
          </Section>
        )}

        {openDecisions.length > 0 && (
          <Section title="Decision log">
            <ul className="space-y-1.5 text-sm">
              {openDecisions.map((d) => (
                <li key={d.id} className="border-b border-neutral-200 pb-1.5">
                  <p>
                    <span className="font-medium">{DECISION_KIND_LABEL[d.kind]}</span> · {d.subject}
                    <span className="text-neutral-500">
                      {" "}
                      · {fmtDate(d.createdAt)}
                      {d.reviewBy ? ` · review ${fmtDate(d.reviewBy)}` : ""}
                    </span>
                  </p>
                  {d.note && <p className="text-neutral-600">{d.note}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <footer className="mt-8 border-t border-neutral-300 pt-3 text-[11px] leading-relaxed text-neutral-500">
          {threat.caveats.join(" ")} Educational internal-control decision support — not actuarial,
          legal, or forensic advice, and never an accusation against any person. Generated by Precog
          Pioneer.
        </footer>
      </article>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-neutral-300 p-3">
      <p className="text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular">{value}</p>
      <p className="text-xs text-neutral-600 capitalize">{hint}</p>
    </div>
  );
}

const REPORT_DETECTION: Record<string, string> = {
  tip: "Someone spoke up",
  "owner-review": "The owner looked",
  "external-audit": "An outside audit",
  "bank-or-insurer": "A bank or insurer flagged it",
  "law-enforcement": "Law enforcement",
  "by-accident": "By accident, when the money ran out",
  cover: "someone else covered the desk",
  reconciliation: "A reconciliation caught it",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-sm font-semibold tracking-wide text-neutral-800 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
