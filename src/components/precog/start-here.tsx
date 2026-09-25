import { useMemo } from "react";
import { EvidenceFooter, SectionHeading, StatTile } from "./start-here-parts";
import {
  BADGE_VARIANT,
  DETECTION_PHRASE,
  effortPhrase,
  joinClauses,
  LONG_SERVICE_YEARS,
  lower,
  ROUTE_CLAUSE,
} from "./start-here-copy";
import {
  ArrowRight,
  Clock,
  Eye,
  ExternalLink,
  ShieldAlert,
  TrendingDown,
  Users,
} from "lucide-react";
import { usePractice } from "@/lib/precog/practice-context";
import { industryMeta } from "@/lib/precog/industry";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { continuitySlips, decisionsDue, localDateKey } from "@/lib/precog/decisions/follow-through";
import { useToday } from "@/lib/precog/decisions/use-today";
import {
  checkInPlan,
  staleItems,
  CONFIRMATION_MAX_AGE_DAYS,
} from "@/lib/precog/continuity/staleness";
import { coverageReport, firstName } from "@/lib/precog/continuity/coverage";
import { documentationDebt } from "@/lib/precog/continuity/documentation";
import { registerAssessed, registerSource } from "@/lib/precog/continuity/register-state";
import { HANDOVER_URGENT_DAYS, leaverLead } from "@/lib/precog/continuity/leavers";
import { todayBrief } from "@/lib/precog/continuity/today";
import { formatDateRange } from "@/lib/precog/continuity/planned-absence";
import { findKnowledgeRisks } from "@/lib/precog/engine";
import {
  BENCHMARK_BY_ID,
  CASE_LIBRARY,
  METHOD_CAVEATS,
  casesForSodRules,
  caseForRule,
  citingCaseStats,
  durationPhrase,
  recommendedStepsForRules,
  tenureExamples,
} from "@/lib/precog/evidence";
import {
  closingSteps,
  gapBadge,
  ownerHeldPairs,
  rankFirstSteps,
} from "@/lib/precog/coach/first-steps";
import { CaseCard } from "./case-card";
import { concentrationHeadline, midSentence, separatedPairs } from "@/lib/precog/sod/verdict";
import { entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import { titleDutiesSentence } from "@/lib/precog/onboarding/own-team";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import { personLabel } from "@/lib/precog/person-label";
import { locationsById, locationText } from "@/lib/precog/person-location";
import { LeaverAccessList } from "@/components/precog/leaver-access";

/**
 * The first screen an owner sees.
 *
 * It answers three questions in order, in plain words, and nothing else:
 *
 *   1. Where is this business exposed right now?
 *   2. What has that exposure actually cost organizations like it?
 *   3. What should be done first?
 *
 * Every claim on this screen resolves to a prosecuted case or a published
 * study. Where the application cannot support a claim, it says so rather than
 * filling the space.
 */
export function StartHere({ onOpenDetail }: { onOpenDetail?: (tab: string) => void }) {
  const { profile, template } = usePractice();
  /**
   * Whether the findings describe this business or the loaded sample.
   *
   * The conflict detector works from the named people in the active
   * template. Staff settings such as team size feed the scoring but cannot
   * generate an assignment table — you cannot derive who does what from a
   * headcount — so until someone edits the team, these are the sample's
   * people and saying otherwise would misrepresent them.
   */
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

  /**
   * Gaps still open.
   *
   * A dual-release policy is treated as reducing a gap, not closing it. Its
   * rules carry a threshold, so a policy requiring two people above $500 still
   * leaves one person able to act alone below it, and exceptions can raise or
   * waive the threshold entirely. Filtering those conflicts out would let this
   * page report a gap as closed while the same person can still move smaller
   * amounts unaccompanied. They stay, ranked below the unmitigated ones, with
   * the remaining exposure named.
   *
   * A gap the owner has explicitly accepted is a decision they already made,
   * so it does not reappear here as a finding.
   */
  const openConflicts = useMemo(
    () =>
      sod.conflicts
        // An owner-held pair is not a theft finding: it gets its own note below
        // and never a "Fix first" card above an employee's.
        .filter((c) => !c.residualRiskAccepted && !c.ownerHeld)
        .sort(
          (a, b) =>
            Number(a.dualReleaseMitigated) - Number(b.dualReleaseMitigated) || b.score - a.score,
        ),
    [sod.conflicts],
  );
  const ownerHeld = useMemo(() => ownerHeldPairs(sod.conflicts), [sod.conflicts]);
  // Where each person works, when the business has two or more locations.
  const placesOf = useMemo(() => locationsById(template.people), [template.people]);
  /** "Jordan Lee (Oakridge Mall and Riverside)" in a business with more than one location. */
  const atPlaces = (name: string, id: string) => {
    const places = placesOf.get(id);
    return places ? `${name} (${locationText(places)})` : name;
  };
  /** The locations a gap reaches, each once, in roster order. */
  const gapPlaces = (ids: readonly string[]) => [
    ...new Set(ids.flatMap((id) => placesOf.get(id) ?? [])),
  ];
  // One person holding most of the gaps is the headline a CPA leads with, and
  // the pairs the team already keeps apart are worth saying out loud.
  const headline = useMemo(() => concentrationHeadline(sod.conflicts), [sod.conflicts]);
  const keptApart = useMemo(
    () => separatedPairs(sod.conflicts, sod.assignments),
    [sod.conflicts, sod.assignments],
  );
  // Findings that rest on duties guessed from job titles say so.
  const titleDuties = isSampleTeam ? "" : titleDutiesSentence(template.people);
  const unheld = sod.summary.unheldDuties.map((d) => entitlementLabel(d));

  /**
   * Which segregation-of-duties rules the dual-release policy only narrows.
   *
   * A policy rule with `thresholdUsd: 0` requires two people at every amount
   * and genuinely closes what it covers. A rule with a threshold leaves a band
   * beneath it where one person still acts alone. A duty conflict is therefore
   * fully covered only when every policy rule addressing it has no threshold;
   * otherwise a residual band remains, and the lowest such threshold is where
   * it starts.
   */
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
    // Only a gap the detector counts as mitigated (a distinct second person
    // exists on the team) is narrowed; otherwise it is still open.
    const mitigated = new Set(
      sod.conflicts.filter((c) => c.dualReleaseMitigated).map((c) => c.ruleId),
    );
    for (const [ruleId, thresholds] of byRuleId) {
      const gapThresholds = thresholds.filter((t) => t > 0);
      // Covered at every amount by at least one rule → nothing left beneath.
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

  /**
   * Group by the gap, not by the person.
   *
   * The detector reports one conflict per person per rule, so a practice where
   * two people can both approve their own write-offs produces two identical
   * findings. Listing them separately triples the apparent workload and buries
   * the point: the fix is one change to how that duty is assigned, not one
   * conversation per employee. Grouping also keeps the screen honest — the
   * owner sees how many distinct decisions they face, which is the number that
   * determines whether they act at all.
   */
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
        // Keep the worst representative: an unmitigated instance outranks a
        // mitigated one, so a gap is never shown as softer than it is.
        if (existing.conflict.dualReleaseMitigated && !c.dualReleaseMitigated) {
          existing.conflict = c;
        }
      } else {
        byRule.set(c.ruleId, { people: [c.personName], ids: [c.personId], conflict: c });
      }
    }
    // Open gaps first, then those the policy narrows, then those it covers at
    // every amount; worst first within each.
    const rank = (c: (typeof openConflicts)[number]) =>
      !c.dualReleaseMitigated ? 0 : partialCoverage.has(c.ruleId) ? 1 : 2;
    return [...byRule.values()].sort(
      (a, b) => rank(a.conflict) - rank(b.conflict) || b.conflict.score - a.conflict.score,
    );
  }, [openConflicts, partialCoverage]);

  const topThree = gaps.slice(0, 3);
  /**
   * Gaps a dual-release policy narrows but does not close.
   *
   * They sort below the unmitigated ones and so rarely reach the top three,
   * which would leave the residual band invisible on this page — the exact
   * overstatement of safety that dropping them entirely used to cause. They
   * get their own short section instead, outside the main ranking, so an owner
   * sees what the policy still leaves open without having to go looking.
   */
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
  /** Findings still open at some amount: not covered by dual release at every amount. */
  const stillOpen = useMemo(
    () => openConflicts.filter((c) => !c.dualReleaseMitigated || partialCoverage.has(c.ruleId)),
    [openConflicts, partialCoverage],
  );

  // Every case the page lists, including ones that share a scheme with the
  // gaps without showing the exact pair; the figures below ("N cases show
  // these gaps", median loss, duration, how they came to light) are computed
  // over the cases whose records show the pair, and nothing else.
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

  /**
   * Years of service for each named person, where the team record states it.
   *
   * The detector names people but not their tenure, and tenure is the fact an
   * owner most often offers in place of a control ("she has been with us
   * twenty years"). The note below answers that in the case library's terms.
   * Five years is the same threshold the departure model uses for "long
   * service", so the two screens agree on what long means.
   */
  const tenureByName = new Map<string, number>();
  for (const person of template.people) {
    if (typeof person.tenureYears === "number") tenureByName.set(person.name, person.tenureYears);
  }
  const tenureCases = useMemo(() => tenureExamples(CASE_LIBRARY), []);
  /**
   * The gap card that carries the tenure note: the highest-ranked one naming a
   * long-serving person. The point holds once; repeating it on every card
   * would read as a lecture.
   */
  const tenureNoteRuleId =
    topThree.find(({ people }) =>
      people.some((name) => (tenureByName.get(name) ?? 0) >= LONG_SERVICE_YEARS),
    )?.conflict.ruleId ?? null;

  const soleKnowledge = useMemo(
    () => findKnowledgeRisks(template).filter((r) => r.soleOwner),
    [template],
  );

  // A team under 100 people reads the small-organization median, which the
  // same report gives; a larger one reads the all-sizes median.
  const smallOrg = Math.max(profile.staff.teamSize, template.people.length) < 100;
  const medianLoss = BENCHMARK_BY_ID[smallOrg ? "bm-small-org-losses" : "bm-median-loss"];
  // The small-organization entry's full value also quotes the largest
  // organizations; the tile shows its own figure.
  const medianLossValue =
    smallOrg && typeof medianLoss?.numeric === "number"
      ? `$${medianLoss.numeric.toLocaleString("en-US")}`
      : medianLoss?.value;
  const medianDuration = BENCHMARK_BY_ID["bm-median-duration"];
  const delayCurve = BENCHMARK_BY_ID["bm-duration-cost-curve"];
  const tips = BENCHMARK_BY_ID["bm-tips"];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Start here</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          This page shows where a business like yours is exposed, what that same exposure has cost
          real organizations, and what to do about it first. Every figure links to the case or study
          it came from.
        </p>
      </header>

      {overdue.length > 0 && onOpenDetail && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {overdue.length} decision(s) past their review date —{" "}
          <button
            type="button"
            onClick={() => onOpenDetail("journal")}
            className="font-medium underline hover:text-fg"
          >
            review now
          </button>
        </div>
      )}

      {slipped.length > 0 && onOpenDetail && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Continuity slipped on {slipped.length} item(s) you had closed as done (
          {slipped.map((s) => s.decision.subject).join(", ")}) —{" "}
          <button
            type="button"
            onClick={() => onOpenDetail("journal")}
            className="font-medium underline hover:text-fg"
          >
            reopen
          </button>
        </div>
      )}

      {/* People who left, until the owner confirms their pay and logins are stopped. */}
      <LeaverAccessList />

      {isSampleTeam && (
        <div className="rounded-lg border border-warn/40 bg-warn/5 p-4">
          <p className="text-sm font-medium text-warn">
            These findings describe the sample team, not yours yet.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            The names and duty assignments below come from the loaded{" "}
            {industryMeta(profile.industry).label.toLowerCase()} example. Staff settings such as
            team size affect the scoring but cannot say who does what, so the conflicts shown are
            the example&rsquo;s until you enter your own people and their duties.
          </p>
          {onOpenDetail && (
            <button
              type="button"
              onClick={() => onOpenDetail("map")}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Enter your own team
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}

      <section className="space-y-3">
        <SectionHeading
          icon={<Users className="size-4" aria-hidden />}
          title="Continuity readiness"
          subtitle={
            staffingToday.out.length > 0
              ? "Someone is out today — this is what it stops."
              : "Can the business run if someone is out tomorrow?"
          }
        />
        {staffingToday.headline && (
          <Card
            className={staffingToday.out.length > 0 ? "border-warn/40 bg-warn/5" : "border-border"}
          >
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-subtle">Today</p>
                  <p className="text-sm font-medium leading-relaxed">{staffingToday.headline}</p>
                </div>
                {onOpenDetail && (
                  <button
                    type="button"
                    onClick={() => onOpenDetail("knowledge")}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {staffingToday.out.length > 0
                      ? "Open the cover sheet"
                      : staffingToday.gone.length > 0
                        ? "Mark them as left"
                        : staffingToday.startingSoon.length > 0
                          ? "Log the hand-offs"
                          : staffingToday.leaving.length > 0
                            ? "Open the hand-over"
                            : "Debrief the stand-ins"}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
              {staffingToday.out.length > 0 && (
                <ul className="space-y-2">
                  {staffingToday.out.map((o) => (
                    <li key={o.window.absence.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{o.person.name}</span>
                        <Badge variant={o.unplanned ? "warn" : "default"}>
                          {o.unplanned ? "out unexpectedly" : "on leave"}
                        </Badge>
                        <span className="text-xs text-subtle">
                          {o.window.absence.from === o.window.absence.to
                            ? "today"
                            : `back after ${formatDateRange(o.window.absence.from, o.window.absence.to)}`}
                        </span>
                      </div>
                      {o.stops.length === 0 ? (
                        <p className="mt-1 text-xs text-muted">
                          Everything they run, someone else can run alone.
                        </p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs text-muted">
                          {o.stops.slice(0, 4).map((s) => (
                            <li key={s.item.id} className="flex flex-wrap items-center gap-x-2">
                              <span className="text-foreground">{s.item.name}</span>
                              <span>
                                {s.standIn
                                  ? `→ ${firstName(s.standIn.name)}${s.cold ? " (starting cold)" : ""}`
                                  : "→ nobody left can pick it up"}
                              </span>
                              <span>· {s.procedure}</span>
                              {s.standIn && (
                                <span className={s.handoffLogged ? "text-ok" : "text-warn"}>
                                  · {s.handoffLogged ? "hand-off logged" : "hand-off not logged"}
                                </span>
                              )}
                            </li>
                          ))}
                          {o.stops.length > 4 && <li>and {o.stops.length - 4} more</li>}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {(staffingToday.gone.length > 0 || staffingToday.leaving.length > 0) && (
                <ul className="space-y-1 text-sm">
                  {[...staffingToday.gone, ...staffingToday.leaving].map((l) => (
                    <li key={l.person.id} className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium">{l.person.name}</span>
                      <Badge
                        variant={
                          l.status === "gone"
                            ? "danger"
                            : l.daysLeft <= HANDOVER_URGENT_DAYS
                              ? "warn"
                              : "default"
                        }
                      >
                        {leaverLead(l.daysLeft)}
                      </Badge>
                      <span className="text-xs text-muted">
                        {l.status === "gone"
                          ? "still counted as cover"
                          : l.handover.length === 0
                            ? "nothing depends on them alone"
                            : `${l.handover.length} to hand over`}
                      </span>
                      {l.status === "notice" && l.unlogged > 0 && (
                        <span className="text-xs text-warn">· {l.unlogged} not in the Journal</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {staffingToday.out.length > 0 &&
                (staffingToday.startingSoon.length > 0 || staffingToday.debriefs > 0) && (
                  <p className="text-xs text-subtle">
                    {[
                      staffingToday.startingSoon.length > 0
                        ? `Also: ${staffingToday.startingSoon
                            .map(
                              (u) =>
                                `${firstName(u.person.name)} out ${formatDateRange(u.window.absence.from, u.window.absence.to)}${u.unlogged > 0 ? ` (${u.unlogged} hand-off${u.unlogged === 1 ? "" : "s"} not logged)` : ""}`,
                            )
                            .join("; ")}.`
                        : "",
                      staffingToday.debriefs > 0
                        ? `${staffingToday.debriefs} debrief${staffingToday.debriefs === 1 ? "" : "s"} waiting.`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="space-y-4 pt-5">
            {!registerReady ? (
              <div className="rounded-lg border border-border bg-panel/60 p-4">
                <p className="text-sm font-medium">Not assessed yet</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {template.knowledge.length === 0
                    ? "Your register is empty. List the duties, tasks and know-how the business runs on and mark who can do each, and these figures fill in."
                    : `Your register holds ${template.knowledge.length} starter items from the ${industryMeta(profile.industry).label.toLowerCase()} example, and nobody is marked on any of them yet. Mark who can do each, or remove what does not apply, and these figures fill in.`}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-panel/60 p-4">
                  <p className="font-mono text-2xl font-semibold tracking-tight">
                    {continuityReadiness.coverageIndex}%
                  </p>
                  <p className="mt-1 text-sm font-medium">Backed up</p>
                  <p className="mt-1 text-xs text-subtle">work two or more people can run</p>
                </div>
                <div className="rounded-lg border border-border bg-panel/60 p-4">
                  <p className="font-mono text-2xl font-semibold tracking-tight">
                    {continuityReadiness.documentationIndex}%
                  </p>
                  <p className="mt-1 text-sm font-medium">Written and findable</p>
                  <p className="mt-1 text-xs text-subtle">procedures a stand-in could follow</p>
                </div>
                <div className="rounded-lg border border-border bg-panel/60 p-4">
                  <p className="font-mono text-2xl font-semibold tracking-tight">
                    {trackFreshness ? `${continuityReadiness.freshness.confirmedIndex}%` : "—"}
                  </p>
                  <p className="mt-1 text-sm font-medium">Confirmed recently</p>
                  <p className="mt-1 text-xs text-subtle">
                    {!trackFreshness
                      ? "starts once you enter your own register"
                      : continuityReadiness.checkIns.checkIns[0]
                        ? `next: check in with ${firstName(continuityReadiness.checkIns.checkIns[0].person.name)} (${continuityReadiness.checkIns.checkIns[0].items.length})`
                        : continuityReadiness.checkIns.unheld.length > 0
                          ? `${continuityReadiness.checkIns.unheld.length} stale item(s) nobody active holds`
                          : `checked in the last ${CONFIRMATION_MAX_AGE_DAYS} days`}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-panel/60 p-4">
                  <p className="font-mono text-2xl font-semibold tracking-tight">
                    {slipped.length}
                  </p>
                  <p className="mt-1 text-sm font-medium">Slipped</p>
                  <p className="mt-1 text-xs text-subtle">
                    done items whose coverage or documentation regressed
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {continuityReadiness.mostDepended ? (
                <p className="text-sm text-muted">
                  {isSampleTeam && "Sample register — "}
                  {continuityReadiness.mostDepended.person.name} carries{" "}
                  {continuityReadiness.mostDepended.dependence}% of must-do work alone
                </p>
              ) : (
                <span />
              )}
              {onOpenDetail && (
                <button
                  type="button"
                  onClick={() => onOpenDetail("knowledge")}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Open Who knows what
                  <ArrowRight className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 1. Where you are exposed. */}
      <section className="space-y-3">
        <SectionHeading
          icon={<ShieldAlert className="size-4" aria-hidden />}
          title="Where one person controls too much"
          subtitle={
            gaps.length === 0
              ? "Nothing open right now."
              : `${gaps.length} distinct ${gaps.length === 1 ? "gap" : "gaps"} across ${openConflicts.length} ${openConflicts.length === 1 ? "finding" : "findings"}, worst first.` +
                (narrowedCount > 0
                  ? ` ${narrowedCount} of them your dual-release policy narrows rather than closes.`
                  : "") +
                (coveredCount > 0
                  ? ` ${coveredCount} ${coveredCount === 1 ? "is" : "are"} covered by dual release at every amount.`
                  : "")
          }
        />

        {titleDuties && (
          <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm leading-relaxed text-muted">
            {titleDuties}{" "}
            {onOpenDetail ? (
              <button
                type="button"
                onClick={() => onOpenDetail("sod")}
                className="font-medium text-primary underline underline-offset-2 hover:text-fg"
              >
                Check them in Who controls what.
              </button>
            ) : (
              "Check them in Who controls what."
            )}
          </p>
        )}

        {unheld.length > 0 && (
          <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm leading-relaxed text-muted">
            Nobody active is marked for: {unheld.join(", ")}. Somebody does each of these in every
            business that handles money, so mark who on Who controls what; until then the findings
            here cannot see that seat.
          </p>
        )}

        {headline && (
          <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm leading-relaxed">
            <span className="font-medium">
              {personLabel(headline.personName, headline.role)}
              {placesOf.has(headline.personId)
                ? `, at ${locationText(placesOf.get(headline.personId) ?? [])},`
                : ""}{" "}
              holds {headline.gaps} of the {headline.totalGaps} open gaps.
            </span>{" "}
            <span className="text-muted">
              Moving one duty, {midSentence(headline.dutyLabel)}, to someone who holds none of the
              others closes {headline.closes} of them.
            </span>
          </p>
        )}

        {gaps.length === 0 ? (
          <Card>
            <CardContent className="pt-5 text-sm leading-relaxed text-muted">
              No unmitigated conflicts remain in the current setup. That is the right outcome, and
              it is worth re-checking whenever someone joins, leaves, or changes role — these gaps
              reopen through ordinary staffing changes far more often than through any decision to
              remove a control.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {topThree.map(({ conflict, people, ids }) => {
              // Prefer a case from the owner's own line of business that cites
              // this rule directly; a dentist reads a dental case differently
              // from a construction one. Fall back to the best match overall.
              const pick = caseForRule(conflict.ruleId, industryId);
              const badge = gapBadge(conflict, partialCoverage.get(conflict.ruleId));
              const closes = closingSteps(
                conflict.compensatingControls,
                profile.dualRelease,
                conflict.ruleId,
                conflict.controlsInPlace,
              );
              return (
                <Card key={conflict.ruleId}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={BADGE_VARIANT[badge]}>{badge}</Badge>
                      <span className="text-xs text-subtle">
                        {people.length === 1
                          ? atPlaces(people[0], ids[0])
                          : `${people.length} people: ${people.map((name, i) => atPlaces(name, ids[i])).join(", ")}`}
                      </span>
                      {people.length > 1 && gapPlaces(ids).length > 0 && (
                        <Badge variant="default">At {locationText(gapPlaces(ids))}</Badge>
                      )}
                    </div>
                    <CardTitle as="h3" className="leading-snug">
                      {people.length === 1 ? `${people[0]} can` : "These people each can"} both{" "}
                      {lower(conflict.labelA)} and {lower(conflict.labelB)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="leading-relaxed text-muted">{conflict.why}</p>

                    {(() => {
                      const longServing = people
                        .map((name) => ({ name, years: tenureByName.get(name) ?? 0 }))
                        .filter((p) => p.years >= LONG_SERVICE_YEARS);
                      const { longest, shortest, n } = tenureCases;
                      if (
                        conflict.ruleId !== tenureNoteRuleId ||
                        longServing.length === 0 ||
                        !longest
                      )
                        return null;
                      return (
                        <p className="rounded border border-border bg-elevated/50 p-3 text-sm leading-relaxed text-muted">
                          {longServing.length === 1
                            ? `${longServing[0].name} has ${longServing[0].years} years here.`
                            : `${longServing.map((p) => `${p.name} (${p.years} years)`).join(", ")} have long service here.`}{" "}
                          Length of service is not a control. Of the {n} cases in the library whose
                          source states how long the person had served, the longest,{" "}
                          {longest.tenureYearsStated} years, cost the business{" "}
                          {longest.lossIsFloor ? "at least " : ""}
                          {formatUsd(longest.lossUsd)}
                          {shortest
                            ? `; the shortest began ${
                                shortest.tenureYearsStated === 0
                                  ? "within months of hire"
                                  : `after ${shortest.tenureYearsStated} years`
                              } and cost ${shortest.lossIsFloor ? "at least " : ""}${formatUsd(shortest.lossUsd)}`
                            : ""}
                          . The people in those cases were trusted for the same reason yours are.
                        </p>
                      );
                    })()}

                    {partialCoverage.has(conflict.ruleId) && (
                      <p className="rounded border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed text-muted">
                        Your dual-release policy covers this above{" "}
                        {formatUsd(partialCoverage.get(conflict.ruleId) ?? 0)}. Below that, and
                        wherever an exception raises or waives the threshold, one person can still
                        act alone. Treat this as narrowed rather than closed.
                      </p>
                    )}

                    {closes.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                          What closes it
                        </p>
                        <ul className="space-y-1">
                          {closes.map((c) => (
                            <li key={c} className="flex gap-2 leading-relaxed text-muted">
                              <span
                                aria-hidden
                                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                              />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {pick && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                          {!pick.citesRule
                            ? "A related scheme, somewhere real"
                            : pick.ownSector
                              ? "This exact gap, in your line of business"
                              : "This exact gap, somewhere real"}
                        </p>
                        <CaseCard study={pick.study} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {narrowed.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">
                  Narrowed by your dual-release policy, not closed
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Two people are required above the threshold. Beneath it, and wherever an exception
                  raises or waives the threshold, one person can still act alone.
                </p>
                <ul className="mt-3 space-y-2">
                  {narrowed.map(({ conflict, people, ids }) => (
                    <li key={conflict.ruleId} className="text-sm">
                      <span className="text-fg">
                        {people.map((name, i) => atPlaces(name, ids[i])).join(", ")} —{" "}
                        {conflict.labelA} with {conflict.labelB}
                      </span>
                      <span className="text-subtle">
                        {" "}
                        · still single-handed below{" "}
                        {formatUsd(partialCoverage.get(conflict.ruleId) ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {gaps.length > topThree.length && onOpenDetail && (
              <button
                type="button"
                onClick={() => onOpenDetail("sod")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                See the other {gaps.length - topThree.length}, and who each one applies to
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}

        {keptApart.length > 0 && (
          <div className="rounded-lg border border-ok/30 bg-ok/5 p-4">
            <p className="text-sm font-medium">Kept apart on your team</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Both duties in each of these pairs are held, by different people, so the pair needs no
              fix:{" "}
              {keptApart
                .slice(0, 6)
                .map((p) => midSentence(p.title))
                .join("; ")}
              {keptApart.length > 6 ? `; and ${keptApart.length - 6} more` : ""}.
            </p>
          </div>
        )}

        {ownerHeld.length > 0 && (
          <div className="rounded-lg border border-border bg-panel/60 p-4">
            <p className="text-sm font-medium">Duties you hold yourself</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              These pairs sit with you as the owner. You cannot steal from yourself, so they are not
              theft findings; the exposure is error, tax and lender reliance.{" "}
              {ownerHeld[0].suggestion
                ? `What closes it: ${ownerHeld[0].suggestion.replace(/^An /, "an ")}.`
                : ""}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {ownerHeld.map((o) => (
                <li key={o.ruleId}>
                  {o.personName}: {o.pair}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2. What it has cost. */}
      <section className="space-y-3">
        <SectionHeading
          icon={<TrendingDown className="size-4" aria-hidden />}
          title="What these gaps have cost other organizations"
          subtitle={
            citing.count > 0
              ? `Drawn from ${citing.count} prosecuted ${citing.count === 1 ? "case" : "cases"} whose records show the gaps above.`
              : evidence.length > 0
                ? "No prosecuted case in the library shows these exact gaps; the cases below share their schemes."
                : "No matching cases, because no gaps are open."
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {lossRange && (
            <StatTile
              label="Median loss in these prosecuted cases"
              value={formatUsd(lossRange.median)}
              detail={`${formatUsd(lossRange.low)} to ${formatUsd(lossRange.high)} across ${lossRange.n} cases`}
            />
          )}
          {duration && (
            <StatTile
              label="How long they ran undetected"
              value={`${Math.round(duration.median)} months`}
              detail={`Longest in this set: ${durationPhrase(duration.longest)}`}
            />
          )}
          {medianLoss && (
            <StatTile
              label={
                smallOrg
                  ? "Median loss, organizations under 100 employees"
                  : "Median loss, given an investigated fraud"
              }
              value={medianLossValue ?? medianLoss.value}
              detail={medianLoss.study}
              href={medianLoss.source.url}
            />
          )}
          {medianDuration && (
            <StatTile
              label="Median time to detection"
              value={medianDuration.value}
              detail={medianDuration.study}
              href={medianDuration.source.url}
            />
          )}
        </div>

        {lossRange && medianLoss && (
          <p className="rounded border border-border bg-elevated/40 p-3 text-xs leading-relaxed text-subtle">
            <span className="font-medium text-muted">Read these numbers as conditional. </span>
            Neither figure is a forecast for your business. Both describe what happened{" "}
            <em>given</em> that a fraud occurred and was found:{" "}
            {medianLossValue ?? medianLoss.value} is the median across investigated cases
            {smallOrg ? " at organizations under 100 employees" : ""}, and the case range above is
            higher still because federal prosecutors do not charge small thefts. Nothing here
            estimates how likely any of it is to happen to you — that depends on the gaps listed at
            the top of this page, not on a median.
          </p>
        )}

        {found.n > 0 && (
          <Card>
            <CardContent className="flex gap-3 pt-5">
              <Eye className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="space-y-2">
                <p className="text-sm font-medium">How these cases came to light</p>
                <ul className="space-y-1 text-sm text-muted">
                  {found.byRoute.map((r) => (
                    <li key={r.route}>
                      {DETECTION_PHRASE[r.route] ?? r.route}: {r.count}{" "}
                      {r.count === 1 ? "case" : "cases"}
                    </li>
                  ))}
                  <li className="text-subtle">
                    Not stated in the source: {found.unknown} of {found.n}
                  </li>
                </ul>
                {found.known > 0 &&
                  !found.byRoute.some((r) =>
                    ["reconciliation", "external-audit", "tip"].includes(r.route),
                  ) && (
                    <p className="text-sm leading-relaxed text-muted">
                      Where the source says how the scheme was found, it was{" "}
                      {joinClauses(found.byRoute.map((r) => ROUTE_CLAUSE[r.route] ?? r.route))}{" "}
                      &mdash; never a reconciliation, an audit, or a report from staff. That is what
                      the controls below change: they put someone in the position to look before the
                      business runs out of money.
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>
        )}

        {delayCurve && (
          <Card>
            <CardContent className="flex gap-3 pt-5">
              <Clock className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <div className="space-y-1">
                <p className="text-sm font-medium">{delayCurve.value}</p>
                <p className="text-sm leading-relaxed text-muted">{delayCurve.soWhat}</p>
                <a
                  href={delayCurve.source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  {delayCurve.study}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* 3. What to do first. */}
      <section className="space-y-3">
        <SectionHeading
          icon={<ArrowRight className="size-4" aria-hidden />}
          title="Do these first"
          subtitle="Ordered first by how many of your open findings each one answers, then by how many of the real cases above it would plausibly have caught. Most of these are detective controls: they shorten how long a scheme runs, which is where the loss is decided."
        />

        <Card>
          <CardContent className="pt-5">
            {steps.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                Nothing outstanding from the duty-conflict findings. The two items below still apply
                to every business regardless.
              </p>
            ) : (
              <ol className="space-y-3">
                {steps.slice(0, 6).map((s, i) => (
                  <li key={s.control.id} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated font-mono text-xs text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed">{s.control.label}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.control.why}</p>
                      <p className="mt-1 text-xs text-subtle">
                        {effortPhrase(s.control.effort)} ·{" "}
                        {s.answers > 0
                          ? `answers ${s.answers} of your open ${s.answers === 1 ? "finding" : "findings"} · `
                          : ""}
                        would plausibly have caught {s.supportingCaseIds.length}{" "}
                        {s.supportingCaseIds.length === 1 ? "case" : "cases"} above
                      </p>
                      {s.supportingCaseIds.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">
                            Which {s.supportingCaseIds.length === 1 ? "case" : "cases"}
                          </summary>
                          <ul className="mt-1 space-y-0.5 text-xs text-muted">
                            {s.supportingCaseIds.map((id) => {
                              const c = caseById.get(id);
                              return c ? (
                                <li key={id}>
                                  · {c.title}
                                  {c.lossUsd > 0
                                    ? ` (${c.lossIsFloor ? "at least " : ""}${formatUsd(c.lossUsd)})`
                                    : ""}
                                </li>
                              ) : null;
                            })}
                          </ul>
                        </details>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {tips && (
          <Card>
            <CardContent className="space-y-1 pt-5">
              <p className="text-sm font-medium">
                Give your staff a way to raise a concern that does not run through the person they
                are worried about.
              </p>
              <p className="text-sm leading-relaxed text-muted">{tips.soWhat}</p>
              <a
                href={tips.source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                {tips.study}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </CardContent>
          </Card>
        )}

        {soleKnowledge.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-5">
              <p className="text-sm font-medium">
                {soleKnowledge.length}{" "}
                {soleKnowledge.length === 1 ? "task depends" : "tasks depend"} on exactly one
                person.
              </p>
              <p className="text-sm leading-relaxed text-muted">
                This is a continuity problem and an oversight problem at the same time. Nobody can
                review work they do not understand, so sole knowledge quietly removes the second
                pair of eyes as well.
              </p>
              <ul className="flex flex-wrap gap-1.5 pt-1">
                {soleKnowledge.slice(0, 6).map((k) => (
                  <li key={k.knowledgeId}>
                    <Badge variant="warn">{k.name}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {/* 4. Limits, stated up front rather than buried. */}
      <section className="space-y-3">
        <SectionHeading title="What this cannot tell you" />
        <Card>
          <CardContent className="pt-5">
            <ul className="space-y-2">
              {METHOD_CAVEATS.map((c) => (
                <li key={c} className="flex gap-2 text-sm leading-relaxed text-muted">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <EvidenceFooter cases={evidence} industryId={industryId} />
    </div>
  );
}
