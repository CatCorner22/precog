import { ArrowRight, Users } from "lucide-react";
import { SectionHeading } from "./start-here-parts";
import { HANDOVER_URGENT_DAYS, leaverLead } from "@/lib/precog/continuity/leavers";
import { CONFIRMATION_MAX_AGE_DAYS } from "@/lib/precog/continuity/staleness";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StartHereModel } from "@/lib/precog/start-here/model";
import type { NavFn } from "@/lib/precog/navigation";
import { healthTone, INDEX_BASIS } from "@/lib/precog/scoring/bands";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDayRange } from "@/lib/precog/dates";
import { useTabName } from "@/lib/precog/presentation";
import { count, firstName } from "@/lib/precog/text";
import type { AbsenceWindow } from "@/lib/precog/continuity/planned-absence";
import { outStopsNote, WEIGHTED_SHARE_NOTE } from "./start-here-copy";

export function StartHereContinuitySection({
  model,
  onOpenDetail,
}: {
  model: StartHereModel["continuity"];
  onOpenDetail: NavFn;
}) {
  const tabName = useTabName();
  const { isSampleTeam, slippedCount, registerReady, trackFreshness, readiness, staffingToday } =
    model;

  return (
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
              <button
                type="button"
                onClick={() => onOpenDetail("knowledge")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {staffingToday.out.length > 0
                  ? "Open today's stand-in sheet"
                  : staffingToday.gone.length > 0
                    ? "Mark them as left"
                    : staffingToday.startingSoon.length > 0
                      ? "Log the hand-offs"
                      : staffingToday.leaving.length > 0
                        ? "Open the hand-off"
                        : "Debrief the stand-ins"}
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
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
                          : `back after ${formatDayRange(o.window.absence.from, o.window.absence.to)}`}
                      </span>
                    </div>
                    {o.stops.length === 0 ? (
                      <p className="mt-1 text-xs text-muted">
                        {outStopsNote(0, waitingFor(o.window), staffingToday.assessed)}
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-xs text-muted">
                        {o.stops.slice(0, 4).map((s) => (
                          <li key={s.item.id} className="flex flex-wrap items-center gap-x-2">
                            <span className="text-fg">{s.item.name}</span>
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
                        ? "Precog still counts them as a stand-in"
                        : l.handover.length === 0
                          ? "nothing depends on them alone"
                          : `${l.handover.length} to hand off`}
                    </span>
                    {l.status === "notice" && l.unlogged > 0 && (
                      <span className="text-xs text-warn">
                        · {l.unlogged} not yet in the {tabName("journal")}
                      </span>
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
                              `${firstName(u.person.name)} out ${formatDayRange(u.window.absence.from, u.window.absence.to)}${u.unlogged > 0 ? ` (${u.unlogged} hand-off${u.unlogged === 1 ? "" : "s"} not logged)` : ""}`,
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel/60 p-4">
              <p className="text-sm font-medium">Not assessed yet.</p>
              <Button size="sm" variant="secondary" onClick={() => onOpenDetail("knowledge")}>
                Mark who can do each
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-panel/60 p-4">
                <p className="font-mono text-2xl font-semibold tracking-tight">
                  {readiness.coverageIndex}%
                </p>
                <p className="mt-1 text-sm font-medium">Has a stand-in</p>
                <p className="mt-1 text-xs text-subtle">work two or more people can run</p>
              </div>
              <div className="rounded-lg border border-border bg-panel/60 p-4">
                <p
                  className={cn(
                    "font-mono text-2xl font-semibold tracking-tight",
                    TONE_TEXT[healthTone(readiness.documentationIndex)],
                  )}
                >
                  {readiness.documentationIndex}%
                </p>
                <p className="mt-1 text-sm font-medium">Written down</p>
                <p className="mt-1 text-xs text-subtle">procedures a stand-in could follow</p>
              </div>
              <div className="rounded-lg border border-border bg-panel/60 p-4">
                <p className="font-mono text-2xl font-semibold tracking-tight">
                  {trackFreshness ? `${readiness.freshness.confirmedIndex}%` : "—"}
                </p>
                <p className="mt-1 text-sm font-medium">Confirmed recently</p>
                <p className="mt-1 text-xs text-subtle">
                  {!trackFreshness
                    ? "starts once you enter your own register"
                    : readiness.checkIns.checkIns[0]
                      ? `next: check in with ${firstName(readiness.checkIns.checkIns[0].person.name)} (${readiness.checkIns.checkIns[0].items.length})`
                      : readiness.checkIns.unheld.length > 0
                        ? `${count(readiness.checkIns.unheld.length, "stale item")} nobody active holds`
                        : `checked in the last ${CONFIRMATION_MAX_AGE_DAYS} days`}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-panel/60 p-4">
                <p className="font-mono text-2xl font-semibold tracking-tight">{slippedCount}</p>
                <p className="mt-1 text-sm font-medium">Slipped</p>
                <p className="mt-1 text-xs text-subtle">
                  done items whose coverage or documentation regressed
                </p>
              </div>
              <p className="text-xs leading-relaxed text-subtle sm:col-span-2 lg:col-span-4">
                {INDEX_BASIS} {WEIGHTED_SHARE_NOTE}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {readiness.mostDepended ? (
              <p className="text-sm text-muted">
                {isSampleTeam && "Sample register — "}
                {readiness.mostDepended.person.name} carries {readiness.mostDepended.dependence}% of
                must-do work alone
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => onOpenDetail("knowledge")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Open {tabName("knowledge")}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/** The text colour for a health tone, as the planner's tiles colour theirs. */
const TONE_TEXT: Record<ReturnType<typeof healthTone>, string> = {
  ok: "text-ok",
  primary: "text-primary",
  warn: "text-warn",
  danger: "text-danger",
};

/** Must-do entries nobody can run alone that already waited before this absence began. */
function waitingFor(window: AbsenceWindow): number {
  return (window.todayImpact ?? window.impact).alreadyStopped.filter(
    (k) => k.criticality !== "nice-to-have",
  ).length;
}
