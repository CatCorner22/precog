import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { industryMeta } from "@/lib/precog/industry";
import { getAppetite } from "@/lib/precog/appetite";
import { buildThreatAssessment } from "@/lib/precog/threat-scoring";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { mitigatedSodRuleIds } from "@/lib/precog/controls/dual-release";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "@/lib/precog/process-graph";
import { summarizeEffectiveness } from "@/lib/precog/builder/effectiveness";
import { summarizeEvidence } from "@/lib/precog/builder/evidence";
import { busFactor, rankDepartureRisk } from "@/lib/precog/builder/departure";
import { latestTests } from "@/lib/precog/builder/test-plan";
import { DECISION_KIND_LABEL } from "@/lib/precog/practice-profile";
import { PRIORITY_BAND_LABEL } from "@/lib/precog/map-vision";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Lender & insurer pack — the full evidence bundle in one print-ready document:
 * who we are, how the map scores, whether controls are designed and operating,
 * what we tested, what's fragile, what we decided, and an owner attestation.
 */
export function LenderPack() {
  const { profile, templateRevision, mapCustomized } = usePractice();
  const tpl = useTemplate();
  const industry = industryMeta(profile.industry);
  const appetite = getAppetite();

  const data = useMemo(() => {
    const { snapshots } = buildProcessMapGraph(profile.staff);
    const issues = validateProcessMap(tpl.processes, tpl.people, new Set(tpl.controls.map((c) => c.id)), profile.mapLayout ?? {});
    const health = computeMapHealth(snapshots, issues, { customized: mapCustomized });
    const threat = buildThreatAssessment({
      practiceName: profile.practiceName,
      staff: profile.staff,
      riskVariables: profile.riskVariables,
      dualRelease: profile.dualRelease,
    });
    const sod = detectSodConflicts(profile.staff, { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(profile.dualRelease) });
    const effectiveness = summarizeEffectiveness(tpl.controls, tpl.processes, Date.now(), profile.controlTests ?? []);
    const evidence = summarizeEvidence(tpl.processes);
    const departures = rankDepartureRisk(tpl.processes, tpl.people, profile.staff);
    const tests = latestTests(profile.controlTests ?? []);
    return { snapshots, issues, health, threat, sod, effectiveness, evidence, departures, tests };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, templateRevision, mapCustomized]);

  const { health, threat, sod, effectiveness, evidence, departures, tests, snapshots, issues } = data;
  const history = profile.mapHealthHistory ?? [];
  const first = history[0];
  const bus = busFactor(departures);
  const generated = new Date();
  const nameOf = (id: string) => tpl.people.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="report min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-white text-neutral-900">
      <div className="print:hidden sticky top-[var(--grok-banner-h,0px)] z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
            <ArrowLeft className="size-4" /> Back to dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/report" className="text-sm text-neutral-600 underline hover:text-neutral-900">
              Short report
            </Link>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print / Save as PDF
            </Button>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-4xl px-6 py-8 print:px-0 print:py-0">
        {/* Cover */}
        <header className="border-b-2 border-neutral-900 pb-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">Internal control pack · for lenders &amp; insurers</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">{profile.practiceName}</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {industry.label} · {tpl.people.filter((p) => p.active).length}-person {industry.teamLabel} · {tpl.processes.length} mapped processes ·{" "}
            {mapCustomized ? "owner-built process map" : "industry template map"} · risk appetite: {appetite.label.toLowerCase()} · prepared{" "}
            {generated.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi label="Map health" value={String(health.score)} hint={`${health.bandLabel} · target ${appetite.targetHealth}`} />
            <Kpi label="Control design" value={String(effectiveness.avgDesign)} hint="avg across controls" />
            <Kpi label="Control operating" value={effectiveness.avgOperating === null ? "—" : String(effectiveness.avgOperating)} hint={effectiveness.avgOperating === null ? "no evidence yet" : "evidence + tests"} />
            <Kpi label="SoD health" value={String(sod.summary.segregationHealth)} hint={`${sod.summary.critical} critical conflicts`} />
            <Kpi label="Bus factor" value={`${bus}/${departures.length}`} hint="people whose exit orphans work" />
          </div>
        </header>

        <Section title="1. Executive summary">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            <li>
              Process-map health is <strong>{health.score}/100 ({health.bandLabel})</strong>
              {first && history.length >= 2 ? `, ${health.score - first.score >= 0 ? "up" : "down"} ${Math.abs(health.score - first.score)} points since ${fmtDate(first.at)}` : ""}.{" "}
              {health.summary}
            </li>
            <li>
              Controls average <strong>{effectiveness.avgDesign}</strong> on design and{" "}
              <strong>{effectiveness.avgOperating === null ? "unproven" : effectiveness.avgOperating}</strong> on operation; {tests.size} control(s) have a recorded test,{" "}
              {effectiveness.unmapped.length} control(s) are not yet mapped to a process.
            </li>
            <li>
              {evidence.total
                ? `${evidence.coverage}% of ${evidence.total} evidence items are current; ${evidence.overdue} overdue, ${evidence.never} never recorded.`
                : "No routine evidence items have been set up yet."}
            </li>
            <li>
              {bus === 0
                ? "Every process and critical knowledge item has a backup owner."
                : `${bus} of ${departures.length} people would orphan a process or critical knowledge if they left — see §6.`}
            </li>
            {threat.missionBrief.slice(0, 2).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Section>

        <Section title="2. Process map health">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {health.dimensions.map((d) => (
              <div key={d.id} className="rounded border border-neutral-300 p-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium">{d.label}</span>
                  <span className="text-sm font-bold tabular">{d.score}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-neutral-800" style={{ width: `${d.score}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-neutral-600">{d.hint}</p>
              </div>
            ))}
          </div>
          {issues.filter((i) => i.severity !== "info").length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-neutral-700">
              {issues.filter((i) => i.severity !== "info").slice(0, 6).map((i) => <li key={i.id}>{i.message}</li>)}
            </ul>
          )}
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
                <th className="py-1.5 pr-2">Process</th>
                <th className="py-1.5 pr-2">Owner(s)</th>
                <th className="py-1.5 pr-2">Controls</th>
                <th className="py-1.5 pr-2">Evidence</th>
                <th className="py-1.5 text-right">Heat</th>
              </tr>
            </thead>
            <tbody>
              {snapshots
                .slice()
                .sort((a, b) => (a.process.stage ?? 0) - (b.process.stage ?? 0))
                .map((s) => {
                  const ev = summarizeEvidence([s.process]);
                  return (
                    <tr key={s.process.id} className="border-b border-neutral-200 align-top">
                      <td className="py-1.5 pr-2 font-medium">{s.process.name}</td>
                      <td className="py-1.5 pr-2 text-neutral-700">{(s.process.ownerPersonIds ?? []).map(nameOf).join(", ") || <span className="text-red-700">unowned</span>}</td>
                      <td className="py-1.5 pr-2 text-neutral-700">{s.process.controlIds.length}</td>
                      <td className="py-1.5 pr-2 text-neutral-700">{ev.total ? `${ev.current + ev.dueSoon}/${ev.total} current` : "—"}</td>
                      <td className="py-1.5 text-right tabular">
                        <span className={s.heat >= appetite.hotHeat ? "font-semibold text-red-700" : s.heat >= appetite.warmHeat ? "text-amber-700" : "text-neutral-600"}>{s.heat}</span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Section>

        <Section title="3. Control effectiveness — design vs operating">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
                <th className="py-1.5 pr-2">Control</th>
                <th className="py-1.5 pr-2 text-right">Design</th>
                <th className="py-1.5 pr-2 text-right">Operating</th>
                <th className="py-1.5 pr-2 text-right">Overall</th>
                <th className="py-1.5 pr-2">Last test</th>
                <th className="py-1.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {[...effectiveness.controls].sort((a, b) => b.overall - a.overall).map((c) => {
                const t = tests.get(c.control.id);
                return (
                  <tr key={c.control.id} className="border-b border-neutral-200 align-top">
                    <td className="py-1.5 pr-2">
                      <p className="font-medium">{c.control.name}</p>
                      <p className="text-xs text-neutral-600">{c.coveredProcesses.map((p) => p.name).join(", ") || "not mapped"}</p>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">{c.design}</td>
                    <td className="py-1.5 pr-2 text-right tabular">{c.operating ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular">{c.overall}</td>
                    <td className="py-1.5 pr-2 text-xs text-neutral-700">
                      {t ? `${t.result.toUpperCase()} · ${t.exceptions}/${t.sampleSize} · ${fmtDate(t.testedAt)}${t.testedBy ? ` · ${t.testedBy}` : ""}` : "not tested"}
                    </td>
                    <td className="py-1.5 text-xs text-neutral-600">{c.notes.slice(0, 2).join("; ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title="4. Segregation of duties">
          <p className="text-sm text-neutral-700">
            {sod.summary.critical} critical, {sod.summary.high} high, {sod.summary.medium} medium conflicts across {sod.summary.peopleWithConflicts} of{" "}
            {sod.assignments.length} people; {sod.summary.dualReleaseMitigated} mitigated by dual release
            {profile.staff.independentBankRec ? "; independent bank reconciliation in place" : "; independent bank reconciliation NOT in place"}.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {sod.recommendations.slice(0, 4).map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Section>

        <Section title="5. Priority exposures">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
                <th className="py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Target</th>
                <th className="py-1.5 pr-2">Band</th>
                <th className="py-1.5 text-right">Expected exposure</th>
              </tr>
            </thead>
            <tbody>
              {threat.targetDeck.slice(0, 8).map((t, i) => (
                <tr key={`${t.kind}-${t.id}`} className="border-b border-neutral-200 align-top">
                  <td className="py-1.5 pr-2 tabular text-neutral-500">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs text-neutral-600">{t.impactHint}</p>
                  </td>
                  <td className="py-1.5 pr-2">{PRIORITY_BAND_LABEL[t.band]}</td>
                  <td className="py-1.5 text-right tabular">{t.expectedLoss ? formatUsd(t.expectedLoss) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="6. Key-person dependency (bus factor)">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {departures.slice(0, 6).map((d) => (
              <li key={d.person.id} className="border-b border-neutral-200 py-1">
                <span className="font-medium">{d.person.name}</span>
                <span className="text-neutral-500"> · {d.person.role} · impact {d.impact}</span>
                <p className="text-xs text-neutral-600">
                  {d.orphanedProcesses.length ? `${d.orphanedProcesses.length} process(es) would lose their only owner` : "processes covered"}
                  {d.orphanedKnowledge.length ? ` · ${d.orphanedKnowledge.length} knowledge item(s) with no other holder` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        {profile.decisions.length > 0 && (
          <Section title="7. Decision log">
            <ul className="space-y-1.5 text-sm">
              {profile.decisions.slice(0, 10).map((d) => (
                <li key={d.id} className="border-b border-neutral-200 pb-1.5">
                  <p>
                    <span className="font-medium">{DECISION_KIND_LABEL[d.kind]}</span> · {d.subject}
                    <span className="text-neutral-500"> · {fmtDate(d.createdAt)}{d.reviewBy ? ` · review ${fmtDate(d.reviewBy)}` : ""}</span>
                  </p>
                  {d.note && <p className="text-neutral-600">{d.note}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={`${profile.decisions.length > 0 ? "8" : "7"}. Owner attestation`}>
          <p className="text-sm leading-relaxed text-neutral-700">
            I confirm that the process map, ownership, controls, evidence, and test results in this pack reflect how{" "}
            {profile.practiceName} operates as of the date above, to the best of my knowledge. Where residual risk has been
            accepted, it has been accepted deliberately and recorded in the decision log with a review date.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <div className="h-10 border-b border-neutral-400" />
              <p className="mt-1 text-xs text-neutral-500">Owner / principal signature</p>
            </div>
            <div>
              <div className="h-10 border-b border-neutral-400" />
              <p className="mt-1 text-xs text-neutral-500">Date</p>
            </div>
          </div>
        </Section>

        <footer className="mt-8 border-t border-neutral-300 pt-3 text-[11px] leading-relaxed text-neutral-500">
          {threat.caveats.slice(0, 2).join(" ")} Scores are educational internal-control decision support — not an audit opinion,
          actuarial estimate, legal advice, or an accusation against any person. Generated by Precog Pioneer.
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
      <p className="text-xs text-neutral-600">{hint}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-sm font-semibold tracking-wide text-neutral-800 uppercase">{title}</h2>
      {children}
    </section>
  );
}
