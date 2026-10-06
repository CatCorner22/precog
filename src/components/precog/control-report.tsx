import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { INDEX_BASIS } from "@/lib/precog/scoring/bands";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import {
  latestReview,
  periodMonthYear,
  periodWithDue,
  reportPeriod,
  reviewItemsFor,
  reviewResultLine,
} from "@/lib/precog/firm/reviews";
import { industryMeta, type IndustryId } from "@/lib/precog/industry";
import { entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import { dutiesOffTeam } from "@/lib/precog/onboarding/setup-answers";
import { SEVERITY_RANK, type DetectedConflict } from "@/lib/precog/sod/detect";
import {
  belowThresholdNote,
  conflictStatus,
  dualReleaseSplit,
  openSodHint,
} from "@/lib/precog/sod/open-findings";
import { sodScopeLine } from "@/lib/precog/integrations/drift-signals";
import { trackRegisterFreshness } from "@/lib/precog/continuity/register-state";
import { mapAssessed, mapNotAssessedNote, mapSource } from "@/lib/precog/builder/map-state";
import {
  DECISION_KIND_LABEL,
  DECISION_KIND_LABEL_PRINTED_V1,
  DISPOSITION_REASON_LABEL,
  type DecisionEntry,
} from "@/lib/precog/practice-profile";
import { PRIORITY_BAND_LABEL, PRIORITY_TOP } from "@/lib/precog/map-vision";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { isSampleBusiness, printedBusinessName } from "@/lib/precog/business-lifecycle";
import {
  engagementLine,
  versionProvenance,
  type ReportVersionRow,
} from "@/lib/precog/firm/reports";
import type { FirmSnapshot } from "@/lib/precog/firm/store";
import { OpenVersionReview, ReportVersionsPanel } from "@/components/precog/report-versions";
import { buildControlReportModel } from "@/lib/precog/report/build-control-report";
import { fixFirstOf } from "@/lib/precog/threat-scoring";
import { RISK_SCALE } from "@/lib/precog/scoring/bands";
import {
  lockedFigures,
  recalculationNote,
  REPORT_LAYOUT_VERSION,
  reviveReportModel,
  type FrozenReport,
} from "@/lib/precog/report/stored-model";
import {
  REPORT_BASIS,
  REPORT_BASIS_TITLE,
  REPORT_CAVEATS,
} from "@/lib/precog/report/report-summary";
import type { FindingResponses, NotValidFinding } from "@/lib/precog/report/finding-responses";
import { ControlReportContinuitySections } from "@/components/precog/control-report-continuity-sections";
import {
  ControlReportCaseAppendix,
  ControlReportEvidenceSection,
} from "@/components/precog/control-report-evidence-section";
import { Kpi, Section } from "@/components/precog/control-report-parts";
import { formatDay, localDateKey } from "@/lib/precog/dates";
import { decidedOn } from "@/lib/precog/decisions/decided-on";
import { count, firstName, midSentence, verb } from "@/lib/precog/text";

/**
 * Print-friendly control priorities report — File → Print → Save as PDF.
 * With `locked`, it prints a frozen version (rendered under a read-only
 * provider) and names the preparer and reviewer instead of today's date.
 * With `frozen`, it prints the figures stored when the version was locked,
 * so later scoring changes leave them as they were; a locked version without
 * usable stored figures recalculates them and says why. With `firm`, the
 * firm's letterhead leads the page and the header says which firm prepared
 * it for the business (firm clients only); with `coverPage` as well, a locked
 * version opens with a cover page. Without `locked`, a report on firm
 * letterhead has not been locked or reviewed: it prints no cover and carries
 * a draft banner, at the top of the first page and in the top margin of each
 * later page. The basis block, the letterhead, the cover, that line and the
 * footer are standing statements printed around the stored figures, so a
 * locked version's figures print unchanged. The report offers no "sent"
 * stamp: only a reviewed version is marked sent, from the versions panel.
 * A locked version shows its review controls (OpenVersionReview) in place
 * of that panel, so a reviewer signs the version they are reading.
 * With `shared`, the page is a share link's: the toolbar (the way back into
 * Precog and Print) and the versions panel stay off; the share page's own
 * bar carries Print.
 */
export function ControlReport({
  locked = null,
  frozen = null,
  firm = null,
  coverPage = false,
  shared = false,
}: {
  locked?: ReportVersionRow | null;
  frozen?: Pick<FrozenReport, "layoutVersion" | "model"> | null;
  firm?: FirmSnapshot | null;
  coverPage?: boolean;
  shared?: boolean;
}) {
  const { profile, mapCustomized } = usePractice();
  const tpl = useTemplate();
  const industry = industryMeta(profile.industry);
  const generated = locked ? new Date(locked.preparedAt) : new Date();
  const today = localDateKey(generated);
  // The monthly checks print for the oldest month still open on the report's
  // day: last month until its due day (the 10th), then this month.
  const month = reportPeriod(today);
  const trackFreshness = trackRegisterFreshness(profile, tpl);
  const mapReady = mapAssessed(profile);
  const mapNote = mapNotAssessedNote(profile);
  const mapFrom = mapSource(profile);
  const sample = isSampleBusiness(profile);
  const businessName = printedBusinessName(profile);
  // Printed from the columns frozen at lock only; a live report prints none.
  const engagement = locked ? engagementLine(locked) : null;

  const figures = locked ? lockedFigures(frozen) : null;
  const storedModel = figures && "model" in figures ? figures.model : null;
  // A live report, and a locked one that recalculates, print the current
  // layout; a locked version with stored figures prints its own. Layout 1's
  // map score still counts heat, and it carries the average residual, not
  // band counts; layouts 1 and 2 print the decision labels they printed then.
  const layoutVersion =
    figures && "model" in figures ? figures.layoutVersion : REPORT_LAYOUT_VERSION;
  const layoutOne = layoutVersion === 1;
  const layoutThree = layoutVersion >= 3;
  const layoutFour = layoutVersion >= 4;
  const kindLabel = layoutThree ? DECISION_KIND_LABEL : DECISION_KIND_LABEL_PRINTED_V1;
  const data = useMemo(
    () =>
      storedModel
        ? reviveReportModel(storedModel)
        : buildControlReportModel({
            tpl,
            profile,
            mapCustomized,
            today,
            trackFreshness,
            mapReady,
            businessName,
          }),
    [storedModel, tpl, profile, mapCustomized, today, trackFreshness, mapReady, businessName],
  );
  const recalculated =
    figures && "reason" in figures
      ? recalculationNote(figures.reason, formatDay(localDateKey(new Date())))
      : null;
  const { threat, portfolio, sod, sodOpen, sodLevel, mapHealth, healthDelta, decisionLog } = data;
  const { byConflict: responses, notValid } = data.responses;
  const sodNote = belowThresholdNote(sodOpen);
  // Pairs dual release reduces stay among the open conflicts; count them once.
  // Layouts 1 to 3 also counted the owner's own pairs dual release covers at
  // every amount as covered; their locked versions print that count.
  const dual = dualReleaseSplit(sod.conflicts, data.partialCoverage);
  const dualClosed = layoutFour
    ? dual.closed
    : dual.closed +
      sod.conflicts.filter(
        (c) => c.ownerHeld && c.dualReleaseMitigated && !data.partialCoverage.has(c.ruleId),
      ).length;
  const mapIssues = data.issues.filter((i) => i.severity !== "info");
  const sodRows = sod.conflicts
    .slice()
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.score - a.score);
  const offTeamDuties = dutiesOffTeam(profile.setupAnswers);
  const unheld = sod.summary.unheldDuties
    .filter((d) => !offTeamDuties.has(d))
    .map((d) => entitlementLabel(d));
  // People the books show and the map lacks fall outside the findings; say so beside them.
  const sodScope = sodScopeLine(profile.integrationDriftSummary);
  const reviews = reviewItemsFor(month).map((item) => ({
    item,
    latest: latestReview(profile.monthlyReviews ?? [], item.key, month),
  }));
  const mapLine = `${industry.label} · ${profile.staff.teamSize}-person ${industry.teamLabel} · ${
    mapFrom === "starter"
      ? "sample process map"
      : mapCustomized
        ? "custom process map"
        : "industry template map"
  }`;
  // Firm letterhead on a report no one has locked or reviewed: say so.
  const draft = firm && !locked ? `DRAFT: not locked or reviewed by ${firm.name}` : null;
  const letterhead = firm && (
    <div className="report-letterhead mb-4 flex items-center gap-4">
      {firm.logoDataUrl && (
        <img src={firm.logoDataUrl} alt={`${firm.name} logo`} className="max-h-16" />
      )}
      <div>
        <p className="font-semibold">{firm.name}</p>
        {firm.letterhead && (
          <p className="text-sm whitespace-pre-line text-neutral-700">{firm.letterhead}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="report min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-white text-neutral-900">
      {!shared && (
        <div className="print:hidden sticky top-[var(--grok-banner-h,0px)] z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
            >
              <ArrowLeft className="size-4" /> Back to Precog
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              {locked && (
                <Link
                  to="/report"
                  className="inline-flex h-8 items-center rounded-md border border-neutral-300 px-3 text-xs font-medium hover:bg-neutral-100"
                >
                  Back to the current report
                </Link>
              )}
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="size-3.5" /> Print / Save as PDF
              </Button>
            </div>
          </div>
        </div>
      )}
      {!shared && (locked ? <OpenVersionReview version={locked} /> : <ReportVersionsPanel />)}

      <article className="mx-auto max-w-4xl px-6 py-8 print:px-0 print:py-0">
        {draft && (
          <section
            role="note"
            aria-label="Draft"
            className="report-draft mb-6 rounded-lg border-2 border-red-700 p-3 text-sm font-semibold text-red-800"
          >
            <style dangerouslySetInnerHTML={{ __html: draftPageHeader(draft) }} />
            {draft}
          </section>
        )}
        {coverPage && firm && locked && (
          <section
            aria-label="Cover page"
            className="report-cover mb-8 flex min-h-[60vh] flex-col justify-between break-after-page border-b-2 border-neutral-900 pb-8 print:min-h-[90vh] print:border-b-0"
          >
            {letterhead}
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">
                Internal control priorities{sample ? " · sample business" : ""}
              </p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">{businessName}</h1>
              <p className="mt-2 text-base text-neutral-700">
                Prepared for {businessName} by {firm.name}
              </p>
              <p className="mt-1 text-sm text-neutral-800">{versionProvenance(locked)}</p>
              {locked?.scopeNote && (
                <p className="mt-1 text-sm text-neutral-700">Scope: {locked.scopeNote}</p>
              )}
              {engagement && <p className="mt-1 text-sm text-neutral-700">{engagement}</p>}
            </div>
          </section>
        )}
        <header className="border-b-2 border-neutral-900 pb-4">
          {letterhead}
          <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 uppercase">
            Internal control priorities{sample ? " · sample business" : ""}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{businessName}</h1>
          {firm && (
            <p className="mt-1 text-sm text-neutral-700">
              Prepared for {businessName} by {firm.name}
            </p>
          )}
          {locked && (
            <p className="mt-1 text-sm font-medium text-neutral-800">
              {versionProvenance(locked)}
              {locked.scopeNote ? ` · Scope: ${locked.scopeNote}` : ""}
              {engagement ? ` · ${engagement}` : ""}
            </p>
          )}
          {recalculated && (
            <p role="note" className="mt-1 text-sm text-neutral-700">
              {recalculated}
            </p>
          )}
          <p className="mt-1 text-sm text-neutral-600">
            {mapLine} · generated {formatDay(generated)}
          </p>
        </header>

        <section
          role="note"
          aria-label={REPORT_BASIS_TITLE}
          className="mt-4 rounded-lg border border-neutral-300 p-3 text-sm text-neutral-800"
        >
          <p className="font-semibold">{REPORT_BASIS_TITLE}</p>
          <p className="mt-1">{REPORT_BASIS}</p>
        </section>

        {sample && (
          <section
            className="mt-4 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"
            role="note"
            aria-label="Sample business"
          >
            <p className="font-semibold">
              Sample business: the people, scores and findings in this report come from the sample,
              not from a real business.
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

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label={layoutOne ? "Map health score" : "Map completeness"}
            value={mapReady ? (layoutOne ? String(mapHealth.score) : `${mapHealth.score}%`) : "—"}
            hint={mapReady ? mapHealth.bandLabel : "Not assessed yet"}
          />
          <Kpi
            label="Top-priority items"
            value={String(fixFirstOf(threat))}
            hint={`Priority ${PRIORITY_TOP} or more`}
          />
          {layoutOne ? (
            <Kpi
              label="Average residual risk score"
              value={String(portfolio.averageResidual)}
              hint={`${portfolio.criticalPath} to fix first`}
            />
          ) : (
            <Kpi
              label="Residual risks by band"
              value={`${portfolio.criticalPath} fix first`}
              hint={`Fix first at ${RISK_SCALE.critical} or more · ${portfolio.actNow} fix soon · ${portfolio.mitigate} worth doing`}
            />
          )}
          <Kpi
            label={layoutThree ? "Duty separation" : "Duty separation index"}
            value={String(sod.summary.segregationHealth)}
            hint={`${sodLevel} · ${openSodHint(sodOpen)}`}
          />
        </section>
        {sodNote && <p className="mt-2 text-xs leading-relaxed text-neutral-600">{sodNote}</p>}
        {data.handSet.length > 0 && (
          <div
            className="mt-2 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"
            role="note"
            aria-label="Figures set by hand"
          >
            {data.handSet.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">{INDEX_BASIS}</p>

        <Section title={layoutOne ? "Map health" : "Map completeness"}>
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

        <Section title="Monthly review">
          <p className="mb-1 text-sm font-medium">Monthly checks for {periodWithDue(month)}</p>
          {reviews.some((r) => r.latest) ? (
            <ul className="space-y-1 text-sm">
              {reviews.map(({ item, latest }) => (
                <li key={item.key}>
                  {item.title}: {latest ? reviewResultLine(latest) : "not recorded"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-700">
              No monthly review results recorded for {periodMonthYear(month)}.
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
                  <th className={`py-1.5 text-right${layoutThree ? "" : " pr-2"}`}>Priority</th>
                  {!layoutThree && <th className="py-1.5 text-right">Assumed loss</th>}
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
                    <td className={`py-1.5 text-right tabular${layoutThree ? "" : " pr-2"}`}>
                      {t.priority}
                    </td>
                    {!layoutThree && (
                      <td className="py-1.5 text-right tabular text-neutral-700">
                        {t.expectedLoss ? formatUsd(t.expectedLoss) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {layoutThree ? (
            data.policyNote && (
              <p className="mt-2 text-xs text-neutral-600">Insurance: {data.policyNote}.</p>
            )
          ) : (
            <p className="mt-2 text-xs text-neutral-600">
              Assumed loss is the scenario&apos;s assumption in Precog, not a measured figure.
              {data.policyNote ? ` Insurance: ${data.policyNote}.` : ""}
            </p>
          )}
        </Section>

        <Section title="Segregation of duties">
          <p className="text-sm text-neutral-700">
            {sod.summary.critical} critical, {sod.summary.high} high, {sod.summary.medium} medium
            open conflicts across {sod.summary.peopleWithConflicts} of {sod.assignments.length}{" "}
            people. {dualClosed} covered by dual release at every amount.
            {dual.reduced > 0 &&
              ` ${dual.reduced} more reduced by dual release but not closed, counted open above.`}
          </p>
          {unheld.length > 0 && (
            <p className="mt-2 text-sm text-neutral-700">
              The register marks nobody still working here for: {unheld.join(", ")}. Somebody does{" "}
              {verb(unheld.length, "this", "each of these")} in every {industry.teamLabel} that
              handles money; until the team records who, the findings cannot cover{" "}
              {verb(unheld.length, "that duty", "those duties")}.
            </p>
          )}
          {sodScope && <p className="mt-2 text-sm text-neutral-700">{sodScope}</p>}
          {sodRows.length > 0 && (
            <>
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-xs tracking-wide text-neutral-500 uppercase">
                    <th className="py-1.5 pr-2">Person</th>
                    <th className="py-1.5 pr-2">Duties held together</th>
                    <th className="py-1.5 pr-2">Severity</th>
                    <th className={layoutThree ? "py-1.5 pr-2" : "py-1.5"}>Status</th>
                    {layoutThree && (
                      <>
                        <th className="py-1.5 pr-2">Response</th>
                        <th className="py-1.5">Review by</th>
                      </>
                    )}
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
                      <td
                        className={
                          layoutThree ? "py-1.5 pr-2 text-neutral-700" : "py-1.5 text-neutral-700"
                        }
                      >
                        {conflictStatus(c, data.partialCoverage)}
                      </td>
                      {layoutThree && (
                        <>
                          <td className="py-1.5 pr-2">{responseLine(c.id, responses, notValid)}</td>
                          <td className="py-1.5 tabular text-neutral-700">
                            {reviewByLine(responses[c.id]?.reviewBy)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-neutral-500">
                Each row says what one person&apos;s duties allow, not anything they have done.
              </p>
            </>
          )}
          {layoutThree && notValid.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold">Judged not valid</h3>
              <ul className="mt-1 space-y-1.5 text-sm">
                {notValid.map((n) => {
                  const c = sod.conflicts.find((x) => x.id === n.conflictId);
                  return (
                    <li key={n.conflictId} className="border-b border-neutral-200 pb-1.5">
                      <p>
                        {c && (
                          <span className="font-medium">
                            {c.personName}: {c.labelA} + {midSentence(c.labelB)} ·{" "}
                          </span>
                        )}
                        {DISPOSITION_REASON_LABEL[n.reason]}
                        <span className="text-neutral-500">
                          {" "}
                          · by {n.byName ?? "someone not signed in"} on {formatDay(n.at)}
                        </span>
                        {n.critical && (
                          <span className="font-medium"> · Awaiting a second person</span>
                        )}
                      </p>
                      {n.note && <p className="text-neutral-600">{n.note}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
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
          benchmark={data.benchmark}
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
              Sample process map from the {industry.label.toLowerCase()} sample:{" "}
              {tpl.processes.length} processes, none with an owner yet.
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
                    · {(p.risks ?? []).length} risks
                    {layoutThree ? "" : ` · ${(p.ideas ?? []).length} ideas`}
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
          <Section title="Decisions log">
            <ul className="space-y-1.5 text-sm">
              {decisionLog.shown.map(({ decision: d, status }) => (
                <li key={d.id} className="border-b border-neutral-200 pb-1.5">
                  <p>
                    <span className="font-medium">
                      {layoutThree && d.disposition
                        ? `Judged not valid: ${DISPOSITION_REASON_LABEL[d.disposition.reason]}`
                        : kindLabel[d.kind]}
                    </span>
                    {layoutThree &&
                      d.disposition &&
                      judgesCritical(d, sod.conflicts, profile.industry) && (
                        <span className="font-medium"> · Awaiting a second person</span>
                      )}{" "}
                    · {d.subject}
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
                This report shows the {decisionLog.shown.length} newest decisions;{" "}
                {count(decisionLog.more, "earlier decision is", "earlier decisions are")} not.
              </p>
            )}
          </Section>
        )}

        <footer className="mt-8 border-t border-neutral-300 pt-3 text-xs leading-relaxed text-neutral-500">
          {REPORT_BASIS} {REPORT_CAVEATS} Educational internal-control decision support — not
          actuarial, legal, or forensic advice, and never an accusation against any person. Prepared
          with Precog.
        </footer>

        <ControlReportCaseAppendix evidence={data.evidence} />
      </article>
    </div>
  );
}

/**
 * Print rules that repeat the draft banner in the top margin of every page
 * after the first, where the banner itself prints. The text goes in as CSS
 * escapes, so a firm name cannot end the string or the style element.
 */
function draftPageHeader(text: string): string {
  let escaped = "";
  for (const ch of text) {
    escaped += /[A-Za-z0-9 ]/.test(ch) ? ch : `\\${(ch.codePointAt(0) ?? 32).toString(16)} `;
  }
  return (
    `@media print { @page { @top-center { content: "${escaped}"; color: #991b1b; font: 600 9pt sans-serif; } } ` +
    `@page :first { @top-center { content: none; } } }`
  );
}

/**
 * The Response column of layout 3: the decision logged on the finding, else
 * its not-valid judgement, which waits for a second person on a critical one.
 */
function responseLine(
  conflictId: string,
  responses: FindingResponses["byConflict"],
  notValid: readonly NotValidFinding[],
): string {
  const decision = responses[conflictId];
  if (decision) return DECISION_KIND_LABEL[decision.kind];
  const judged = notValid.find((n) => n.conflictId === conflictId);
  if (judged) return judged.critical ? "Awaiting a second person" : "Judged not valid";
  return "No decision yet";
}

/**
 * Whether a not-valid entry in the log judges a critical finding, which waits
 * for a second person before it counts as not valid.
 */
function judgesCritical(
  entry: DecisionEntry,
  conflicts: readonly DetectedConflict[],
  industry: IndustryId,
): boolean {
  const asDecision = [{ ...entry, disposition: undefined }];
  return conflicts.some(
    (c) => c.severity === "critical" && decidedOn(c, new Set([entry.kind]), asDecision, industry),
  );
}

/** The Review by column of layout 3: the open decision's review date, if it has one. */
function reviewByLine(reviewBy: string | undefined): string {
  return reviewBy ? formatDay(reviewBy) : "—";
}

/** Plain names for the priority stack's target kinds. */
const KIND_LABEL: Record<string, string> = {
  sod: "Duty conflict",
  control: "Control",
  knowledge: "Know-how only one person holds",
  scenario: "Scenario",
  process: "Process",
};

const SEVERITY_LABEL: Record<DetectedConflict["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  family: "Related duties",
};
