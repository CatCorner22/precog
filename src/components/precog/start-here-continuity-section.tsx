import { ArrowRight, Users } from "lucide-react";
import { SectionHeading } from "./start-here-parts";
import { industryMeta } from "@/lib/precog/industry";
import { formatDateRange } from "@/lib/precog/continuity/planned-absence";
import { firstName } from "@/lib/precog/continuity/coverage";
import { HANDOVER_URGENT_DAYS, leaverLead } from "@/lib/precog/continuity/leavers";
import { CONFIRMATION_MAX_AGE_DAYS } from "@/lib/precog/continuity/staleness";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StartHereModel } from "./use-start-here";

export function StartHereContinuitySection({
  model,
  onOpenDetail,
}: {
  model: StartHereModel;
  onOpenDetail?: (tab: string) => void;
}) {
  const {
    profile,
    template,
    isSampleTeam,
    slipped,
    registerReady,
    trackFreshness,
    continuityReadiness,
    staffingToday,
  } = model;

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
                <p className="font-mono text-2xl font-semibold tracking-tight">{slipped.length}</p>
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
  );
}
