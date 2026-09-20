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
import { contingencyCards, coverageReport, STATUS_LABEL } from "@/lib/precog/continuity/coverage";
import { assessCoso } from "@/lib/precog/coso";
import {
  METHOD_CAVEATS,
  casesForSodRules,
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

/** Print-friendly control priorities report — File → Print → Save as PDF. */
export function ControlReport() {
  const { profile, mapCustomized } = usePractice();
  const tpl = useTemplate();
  const industry = industryMeta(profile.industry);

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
      dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(profile.dualRelease),
    });
    const continuity = coverageReport(tpl);
    const cards = contingencyCards(tpl);
    const coso = assessCoso(tpl);
    const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
    const actions = buildWeeklyActions({
      tpl,
      staff: profile.staff,
      dualRelease: profile.dualRelease,
      mapSnapshots: snapshots,
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
    const lossRange = observedLossRange(evidence);
    const found = detectionBreakdown(evidence);
    return {
      threat,
      portfolio,
      sod,
      continuity,
      cards,
      coso,
      actions,
      mapHealth,
      issues,
      evidence,
      steps,
      lossRange,
      found,
    };
  }, [tpl, profile, mapCustomized]);

  const {
    threat,
    portfolio,
    sod,
    continuity,
    cards,
    coso,
    actions,
    mapHealth,
    issues,
    evidence,
    steps,
    lossRange,
    found,
  } = data;
  const caseById = new Map(evidence.map((c) => [c.id, c]));
  const history = profile.mapHealthHistory ?? [];
  const firstPoint = history[0];
  const healthDelta = firstPoint ? mapHealth.score - firstPoint.score : null;
  const top = threat.targetDeck.slice(0, 12);
  const openDecisions = profile.decisions.slice(0, 10);
  const generated = new Date();

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
            {mapCustomized ? "custom process map" : "industry template map"} · generated{" "}
            {generated.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kpi label="Map health" value={String(mapHealth.score)} hint={mapHealth.bandLabel} />
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
              {evidence.length} prosecuted {evidence.length === 1 ? "case" : "cases"} match the open
              duty conflicts above.
              {lossRange
                ? ` Median loss ${formatUsd(lossRange.median)}, from ${formatUsd(lossRange.low)} to ${formatUsd(lossRange.high)} across ${lossRange.n} cases with a stated figure.`
                : ""}
              {found.known > 0
                ? ` How they came to light, where the source says: ${found.byRoute
                    .map(
                      (r) => `${(REPORT_DETECTION[r.route] ?? r.route).toLowerCase()} (${r.count})`,
                    )
                    .join(", ")}; not stated in ${found.unknown} of ${found.n}.`
                : ""}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
              These describe other organizations, not this business, and they are prosecuted cases,
              so small thefts are absent. They are a reference class, not a forecast.
            </p>

            <h3 className="mt-4 text-sm font-semibold text-neutral-800">Do these first</h3>
            <p className="text-xs text-neutral-500">
              Ordered by how many of the matching cases each control would plausibly have caught.
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

            <h3 className="mt-4 text-sm font-semibold text-neutral-800">Cases cited</h3>
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
          <p className="text-sm text-neutral-700">
            <strong>{continuity.coverageIndex}%</strong> of work (weighted by criticality) has two
            or more people who can run it alone. {continuity.counts.uncovered} item
            {continuity.counts.uncovered === 1 ? "" : "s"} nobody can run,{" "}
            {continuity.counts.single} with exactly one person, {continuity.counts.thin} with one
            person plus a learner.
          </p>
          {continuity.singlePoints.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600">
              No critical or important item is uncovered or relies on one person without a learner.
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
                <li key={m.item.id}>{m.action}</li>
              ))}
            </ol>
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
                    {l.dependence}% of critical work stops if out; only they can do:{" "}
                    {l.soleItems.map((k) => k.name).join(", ")}
                  </li>
                ))}
            </ul>
          )}
        </Section>

        {cards.length > 0 && (
          <Section title="Contingency cards — if someone is out tomorrow">
            <p className="text-xs text-neutral-500">
              One card per person whose absence stops work. Hand the named stand-in the card and the
              written procedure; items without a location need one recorded.
            </p>
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {cards.slice(0, 8).map((c) => (
                <li
                  key={c.person.id}
                  className="break-inside-avoid rounded border border-neutral-300 p-3 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">If {c.person.name} is out</span>
                    <span className="text-xs text-neutral-600">
                      {c.dependence}% of critical work stops
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
                      <li key={a}>{a}</li>
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
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {tpl.processes
              .slice()
              .sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0))
              .map((p) => (
                <li key={p.id} className="border-b border-neutral-200 py-1">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-neutral-500">
                    {" "}
                    · {(p.risks ?? []).length} risks · {(p.ideas ?? []).length} ideas ·{" "}
                    {(p.ownerPersonIds ?? [])
                      .map((id) => tpl.people.find((x) => x.id === id)?.name.split(" ")[0])
                      .filter(Boolean)
                      .join(", ") || "no owner"}
                  </span>
                </li>
              ))}
          </ul>
        </Section>

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
