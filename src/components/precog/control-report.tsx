import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { INDEX_BASIS } from "@/lib/precog/scoring/bands";
import { usePractice } from "@/lib/precog/practice-context";
import { latestReview, REVIEW_ITEMS } from "@/lib/precog/firm/reviews";
import { useTemplate } from "@/lib/precog/use-template";
import { industryMeta } from "@/lib/precog/industry";
import { entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import type { DetectedConflict } from "@/lib/precog/sod/detect";
import { trackRegisterFreshness } from "@/lib/precog/continuity/register-state";
import { mapAssessed, mapNotAssessedNote, mapSource } from "@/lib/precog/builder/map-state";
import { DECISION_KIND_LABEL } from "@/lib/precog/practice-profile";
import { PRIORITY_BAND_LABEL } from "@/lib/precog/map-vision";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { isSampleBusiness, printedBusinessName } from "@/lib/precog/business-lifecycle";
import { versionProvenance, type ReportVersionRow } from "@/lib/precog/firm/reports";
import { ReportVersionsPanel } from "@/components/precog/report-versions";
import { buildControlReportModel } from "@/lib/precog/report/build-control-report";
import { REPORT_CAVEATS } from "@/lib/precog/report/report-summary";
import { ControlReportContinuitySections } from "@/components/precog/control-report-continuity-sections";
import {
  ControlReportCaseAppendix,
  ControlReportEvidenceSection,
} from "@/components/precog/control-report-evidence-section";
import { Kpi, Section } from "@/components/precog/control-report-parts";
import { formatDay, localDateKey } from "@/lib/precog/dates";
import { count, firstName, midSentence, verb } from "@/lib/precog/text";

/**
 * Print-friendly control priorities report — File → Print → Save as PDF.
 * With `locked`, it prints a frozen version (rendered under a read-only
 * provider) and names the preparer and reviewer instead of today's date.
 */
export function ControlReport({ locked = null }: { locked?: ReportVersionRow | null }) {
  const { profile, mapCustomized, replaceProfile } = usePractice();
  const tpl = useTemplate();
  const industry = industryMeta(profile.industry);
  const generated = locked ? new Date(locked.preparedAt) : new Date();
  const today = localDateKey(generated);
  const month = today.slice(0, 7);
  const trackFreshness = trackRegisterFreshness(profile, tpl);
  const mapReady = mapAssessed(profile);
  const mapNote = mapNotAssessedNote(profile);
  const mapFrom = mapSource(profile);
  const sample = isSampleBusiness(profile);
  const businessName = printedBusinessName(profile);
  const sentAt = profile.engagement?.reportSentAt;

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
  const { threat, portfolio, sod, coso, mapHealth, healthDelta, decisionLog } = data;
  const mapIssues = data.issues.filter((i) => i.severity !== "info");
  const sodRows = sod.conflicts
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.score - a.score);
  const unheld = sod.summary.unheldDuties.map((d) => entitlementLabel(d));
  const reviews = REVIEW_ITEMS.map((item) => ({
    item,
    latest: latestReview(profile.monthlyReviews ?? [], item.key, month),
  }));

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
          <div className="flex flex-wrap items-center gap-2">
            {locked ? (
              <Link
                to="/report"
                className="inline-flex h-8 items-center rounded-md border border-neutral-300 px-3 text-xs font-medium hover:bg-neutral-100"
              >
                Back to the current report
              </Link>
            ) : (
              !sample && (
                <>
                  <span role="status" className="text-xs text-neutral-600">
                    {sentAt ? `Marked sent on ${formatDay(sentAt)}` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(sentAt)}
                    onClick={() => {
                      replaceProfile({
                        ...profile,
                        engagement: {
                          ...profile.engagement,
                          reportSentAt: new Date().toISOString(),
                        },
                      });
                    }}
                  >
                    {sentAt ? "Report marked sent" : "Mark report sent"}
                  </Button>
                </>
              )
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
            · generated {formatDay(generated)}
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

        <Section title="Executive summary">
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {data.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Section>

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
            hint={count(sod.summary.critical, "critical conflict")}
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
                {healthDelta
                  ? `Score has moved ${healthDelta.points > 0 ? "+" : ""}${healthDelta.points} points since ${formatDay(healthDelta.since)}.`
                  : ""}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {mapHealth.dimensions.map((d) => (
                  <div key={d.id} className="rounded border border-neutral-300 p-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium">{d.label}</span>
                      <span className="text-sm font-bold tabular">{d.score}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-200" aria-hidden>
                      <div
                        className="h-full rounded-full bg-neutral-800"
                        style={{ width: `${d.score}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">{d.hint}</p>
                  </div>
                ))}
              </div>
              {mapIssues.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-neutral-700">
                  {mapIssues.slice(0, 6).map((i) => (
                    <li key={i.id}>{i.message}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Section>

        <Section title="This week's actions">
          <ol className="space-y-2">
            {data.actions.map((a, i) => (
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

        <Section title={`Monthly review · ${monthLabel(month)}`}>
          {reviews.some((r) => r.latest) ? (
            <ul className="space-y-1 text-sm">
              {reviews.map(({ item, latest }) => (
                <li key={item.key}>
                  {item.title}:{" "}
                  {latest
                    ? `${latest.result}${latest.ownerName ? ` — ${latest.ownerName}` : ""}`
                    : "not recorded"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-700">
              No monthly review results recorded for {monthLabel(month)}.
            </p>
          )}
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
                {threat.targetDeck.map((t, i) => (
                  <tr key={`${t.kind}-${t.id}`} className="border-b border-neutral-200 align-top">
                    <td className="py-1.5 pr-2 tabular text-neutral-500">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium">{t.label}</td>
                    <td className="py-1.5 pr-2 text-neutral-700">{KIND_LABEL[t.kind] ?? t.kind}</td>
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
            {data.policyNote ? ` Insurance: ${data.policyNote}.` : ""}
          </p>
        </Section>

        <Section title="Segregation of duties">
          <p className="text-sm text-neutral-700">
            {sod.summary.critical} critical, {sod.summary.high} high, {sod.summary.medium} medium
            conflicts across {sod.summary.peopleWithConflicts} of {sod.assignments.length} people.{" "}
            {sod.summary.dualReleaseMitigated} mitigated by dual release.
          </p>
          {unheld.length > 0 && (
            <p className="mt-2 text-sm text-neutral-700">
              Nobody still working here is marked for: {unheld.join(", ")}. Somebody does{" "}
              {verb(unheld.length, "this", "each of these")} in every {industry.teamLabel} that
              handles money; until the team records who, the findings cannot cover{" "}
              {verb(unheld.length, "that duty", "those duties")}.
            </p>
          )}
          {sodRows.length > 0 && (
            <>
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-xs tracking-wide text-neutral-500 uppercase">
                    <th className="py-1.5 pr-2">Person</th>
                    <th className="py-1.5 pr-2">Duties held together</th>
                    <th className="py-1.5 pr-2">Severity</th>
                    <th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sodRows.map((c) => (
                    <tr key={c.id} className="border-b border-neutral-200 align-top">
                      <td className="py-1.5 pr-2">{c.personName}</td>
                      <td className="py-1.5 pr-2">
                        {c.labelA} + {midSentence(c.labelB)}
                      </td>
                      <td className="py-1.5 pr-2">{SEVERITY_LABEL[c.severity]}</td>
                      <td className="py-1.5 text-neutral-700">{conflictStatus(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-neutral-500">
                Each row says what one person&apos;s duties allow, not anything they have done.
              </p>
            </>
          )}
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {sod.recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>

        <ControlReportEvidenceSection
          evidence={data.evidence}
          citing={data.citing}
          steps={data.steps}
          lossRange={data.lossRange}
          found={data.found}
          statsScope={data.statsScope}
        />

        <ControlReportContinuitySections
          model={data}
          trackFreshness={trackFreshness}
          today={today}
          industryId={profile.industry}
          industryLabel={industry.label}
          knowledgeCount={tpl.knowledge.length}
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

        {decisionLog.shown.length > 0 && (
          <Section title="Decision log">
            <ul className="space-y-1.5 text-sm">
              {decisionLog.shown.map(({ decision: d, status }) => (
                <li key={d.id} className="border-b border-neutral-200 pb-1.5">
                  <p>
                    <span className="font-medium">{DECISION_KIND_LABEL[d.kind]}</span> · {d.subject}
                    <span className="text-neutral-500">
                      {" "}
                      · {status} · logged {formatDay(d.createdAt)}
                      {d.reviewBy && status === "open" ? ` · review ${formatDay(d.reviewBy)}` : ""}
                    </span>
                  </p>
                  {d.note && <p className="text-neutral-600">{d.note}</p>}
                </li>
              ))}
            </ul>
            {decisionLog.more > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                The {decisionLog.shown.length} newest decisions are shown;{" "}
                {count(decisionLog.more, "earlier decision is", "earlier decisions are")} not.
              </p>
            )}
          </Section>
        )}

        <footer className="mt-8 border-t border-neutral-300 pt-3 text-xs leading-relaxed text-neutral-500">
          {REPORT_CAVEATS} Educational internal-control decision support — not actuarial, legal, or
          forensic advice, and never an accusation against any person. Generated by Precog Pioneer.
        </footer>

        <ControlReportCaseAppendix evidence={data.evidence} />
      </article>
    </div>
  );
}

/** Plain names for the priority stack's target kinds. */
const KIND_LABEL: Record<string, string> = {
  sod: "Duty conflict",
  control: "Control",
  knowledge: "Know-how held by one person",
  scenario: "Scenario",
  process: "Process",
};

const SEVERITY_ORDER: Record<DetectedConflict["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  family: 3,
};

const SEVERITY_LABEL: Record<DetectedConflict["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  family: "Related duties",
};

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/** Where a conflict stands: open, or why the business has set it aside. */
function conflictStatus(
  c: Pick<DetectedConflict, "ownerHeld" | "residualRiskAccepted" | "dualReleaseMitigated">,
): string {
  if (c.ownerHeld) return "Owner's own duties";
  if (c.residualRiskAccepted) return "Risk accepted by the owner";
  if (c.dualReleaseMitigated) return "Covered by dual release";
  return "Open";
}

/** "2026-09" as "September 2026". */
function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return year && month ? MONTH.format(new Date(year, month - 1, 1)) : period;
}
