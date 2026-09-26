import { INDEX_BASIS } from "@/lib/precog/scoring/bands";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { usePractice } from "@/lib/precog/practice-context";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getFirm } from "@/lib/precog/firm/server";
import { latestReview, REVIEW_ITEMS } from "@/lib/precog/firm/reviews";
import { useTemplate } from "@/lib/precog/use-template";
import { industryMeta } from "@/lib/precog/industry";
import { entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import { firstName } from "@/lib/precog/continuity/coverage";
import { registerAssessed, trackRegisterFreshness } from "@/lib/precog/continuity/register-state";
import { mapAssessed, mapNotAssessedNote, mapSource } from "@/lib/precog/builder/map-state";
import {
  isDecisionOpen,
  linkedKnowledgeId,
  localDateKey,
} from "@/lib/precog/decisions/follow-through";
import { DECISION_KIND_LABEL } from "@/lib/precog/practice-profile";
import { PRIORITY_BAND_LABEL } from "@/lib/precog/map-vision";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";
import { isSampleBusiness, printedBusinessName } from "@/lib/precog/business-lifecycle";
import { versionProvenance, type ReportVersionRow } from "@/lib/precog/firm/reports";
import { ReportVersionsPanel } from "@/components/precog/report-versions";
import { buildControlReportModel } from "@/lib/precog/report/build-control-report";
import { ControlReportContinuitySections } from "@/components/precog/control-report-continuity-sections";
import { ControlReportEvidenceSection } from "@/components/precog/control-report-evidence-section";
import { fmtDate } from "@/components/precog/control-report-helpers";
import { Kpi, Section } from "@/components/precog/control-report-parts";

/**
 * Print-friendly control priorities report — File → Print → Save as PDF.
 * With `locked`, it prints a frozen version (rendered under a read-only
 * provider) and names the preparer and reviewer instead of today's date.
 */
export function ControlReport({ locked = null }: { locked?: ReportVersionRow | null }) {
  const { profile, mapCustomized, replaceProfile } = usePractice();
  const { user, isPending } = useCurrentUserState();
  const [firmName, setFirmName] = useState<string | null>(null);
  useEffect(() => {
    if (isPending || !user) return;
    let cancel = false;
    void getFirm()
      .then((res) => {
        if (!cancel) setFirmName(res.firm?.name ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [isPending, user]);
  const tpl = useTemplate();
  const industry = industryMeta(profile.industry);
  const generated = locked ? new Date(locked.preparedAt) : new Date();
  const today = localDateKey(generated);
  const registerReady = registerAssessed(tpl);
  const trackFreshness = trackRegisterFreshness(profile, tpl);
  const mapReady = mapAssessed(profile);
  const mapNote = mapNotAssessedNote(profile);
  const mapFrom = mapSource(profile);
  const sample = isSampleBusiness(profile);
  const businessName = printedBusinessName(profile);

  const data = useMemo(
    () =>
      buildControlReportModel({
        tpl,
        profile,
        mapCustomized,
        today,
        trackFreshness,
        mapReady,
        businessName,
      }),
    [tpl, profile, mapCustomized, today, trackFreshness, mapReady, businessName],
  );

  const {
    policyNote,
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
          <div className="flex flex-wrap gap-2">
            {locked ? (
              <Link
                to="/report"
                className="inline-flex h-8 items-center rounded-md border border-neutral-300 px-3 text-xs font-medium hover:bg-neutral-100"
              >
                Back to the current report
              </Link>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  replaceProfile({
                    ...profile,
                    engagement: {
                      ...profile.engagement,
                      reportSentAt: profile.engagement?.reportSentAt ?? new Date().toISOString(),
                    },
                  });
                }}
              >
                {profile.engagement?.reportSentAt ? "Report marked sent" : "Mark report sent"}
              </Button>
            )}
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print / Save as PDF
            </Button>
          </div>
        </div>
      </div>
      {!locked && <ReportVersionsPanel />}

      <article className="mx-auto max-w-4xl px-6 py-8 print:px-0 print:py-0">
        <header className="border-b-2 border-neutral-900 pb-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">
            Internal control priorities{sample ? " · sample business" : ""}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{businessName}</h1>
          {firmName && <p className="mt-1 text-sm text-neutral-700">Prepared by {firmName}</p>}
          {locked && (
            <p className="mt-1 text-sm font-medium text-neutral-800">
              {versionProvenance(locked)}
              {locked.scopeNote ? ` · Scope: ${locked.scopeNote}` : ""}
            </p>
          )}
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

        {sample && (
          <section
            className="mt-4 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"
            role="note"
            aria-label="Sample business"
          >
            <p className="font-semibold">
              Sample business: the people, scores and findings in this report are fictional.
            </p>
            <p className="mt-1">
              It describes the {industry.label.toLowerCase()} sample team, not your business.{" "}
              <Link to="/" className="font-medium underline print:hidden">
                Set up your own business
              </Link>
              <span className="print:hidden"> to report on your team.</span>
            </p>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-lg font-semibold">Monthly review</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Results the owner recorded for {today.slice(0, 7)}. Earlier results stay in the business
            record and, when signed in, in the account log.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {REVIEW_ITEMS.map((item) => {
              const latest = latestReview(
                profile.monthlyReviews ?? [],
                item.key,
                today.slice(0, 7),
              );
              return (
                <li key={item.key}>
                  {item.title}:{" "}
                  {latest
                    ? `${latest.result}${latest.ownerName ? ` — ${latest.ownerName}` : ""}`
                    : "not recorded"}
                </li>
              );
            })}
          </ul>
        </section>

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
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">{INDEX_BASIS}</p>

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
                    <p className="mt-1 text-xs text-neutral-600">{d.hint}</p>
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
                    <span className="ml-1 rounded border border-neutral-300 px-1.5 py-0.5 text-xs uppercase tracking-wide text-neutral-600">
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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-300 text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 pr-2">Target</th>
                  <th className="py-1.5 pr-2">Type</th>
                  <th className="py-1.5 pr-2">Band</th>
                  <th className="py-1.5 pr-2 text-right">Priority</th>
                  <th className="py-1.5 text-right">Assumed loss</th>
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
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Assumed loss is the scenario&apos;s assumption in this app, not a measured figure.
            {policyNote ? ` Insurance: ${policyNote}.` : ""}
          </p>
        </Section>

        <Section title="Segregation of duties">
          <p className="text-sm text-neutral-700">
            {sod.summary.critical} critical, {sod.summary.high} high, {sod.summary.medium} medium
            conflicts across {sod.summary.peopleWithConflicts} of {sod.assignments.length} people.{" "}
            {sod.summary.dualReleaseMitigated} mitigated by dual release.
          </p>
          {sod.summary.unheldDuties.length > 0 && (
            <p className="mt-2 text-sm text-neutral-700">
              Nobody active is marked for:{" "}
              {sod.summary.unheldDuties.map((d) => entitlementLabel(d)).join(", ")}. Somebody does
              each of these in every business that handles money; until the team records who, these
              findings cannot see that seat.
            </p>
          )}
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {sod.recommendations.slice(0, 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>

        <ControlReportEvidenceSection
          evidence={evidence}
          citing={citing}
          steps={steps}
          lossRange={lossRange}
          found={found}
        />

        <ControlReportContinuitySections
          registerReady={registerReady}
          tpl={tpl}
          industry={industry}
          trackFreshness={trackFreshness}
          today={today}
          profile={profile}
          continuityDecisions={continuityDecisions}
          openContinuity={openContinuity}
          doneContinuity={doneContinuity}
          droppedContinuity={droppedContinuity}
          model={{
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
          }}
        />

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

        <footer className="mt-8 border-t border-neutral-300 pt-3 text-xs leading-relaxed text-neutral-500">
          {threat.caveats.join(" ")} Educational internal-control decision support — not actuarial,
          legal, or forensic advice, and never an accusation against any person. Generated by Precog
          Pioneer.
        </footer>
      </article>
    </div>
  );
}
