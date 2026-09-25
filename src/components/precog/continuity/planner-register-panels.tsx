import { BookOpen, UserCheck } from "lucide-react";
import { PeopleLine } from "@/components/precog/continuity/leave-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContinuityStep } from "@/lib/precog/continuity/absence-impact";
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  STATUS_LABEL,
  type CoverageDrop,
  type CoverageReport,
  type CrossTrainingMove,
  type ItemCoverage,
} from "@/lib/precog/continuity/coverage";
import {
  DOCUMENTATION_LABEL,
  type DocumentationGap,
  type DocumentationReport,
} from "@/lib/precog/continuity/documentation";
import {
  CRITICALITY_LABEL,
  inputClass,
  isMarked,
  NOT_ASSESSED_PLAN,
  STATUS_VARIANT,
  UNHELD_VIEW,
} from "@/lib/precog/continuity/planner-copy";
import { CONFIRMATION_MAX_AGE_DAYS, type CheckInPlan } from "@/lib/precog/continuity/staleness";
import type { Criticality, KnowledgeLevel } from "@/lib/precog/types";
import { cn } from "@/lib/utils";

type StepTrack = (
  knowledgeId: string,
  step: ContinuityStep,
  absenceId?: string,
) => string | undefined;

export function CrossTrainingPlanCard({
  registerReady,
  report,
  setSelectedId,
  trackedBy,
  logMove,
}: {
  registerReady: boolean;
  report: CoverageReport;
  setSelectedId: (id: string) => void;
  trackedBy: StepTrack;
  logMove: (move: CrossTrainingMove) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cross-training plan</CardTitle>
        <CardDescription>
          What to do next, most urgent first. Each step names who should learn and who should
          teach.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!registerReady ? (
          <p className="text-sm text-muted">{NOT_ASSESSED_PLAN}</p>
        ) : report.plan.length === 0 ? (
          <p className="text-sm text-ok">
            Every item has at least two people who can run it alone. Revisit this after anyone
            joins, leaves, or changes role.
          </p>
        ) : (
          <ol className="space-y-2">
            {report.plan.slice(0, 8).map((m, i) => (
              <li
                key={m.item.id}
                className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm hover:bg-elevated/60"
                onClick={() => setSelectedId(m.item.id)}
              >
                <span className="font-mono text-xs text-muted">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.item.name}</span>
                    <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                  </div>
                  <p className="text-muted">{m.action}</p>
                  {trackedBy(m.item.id, "cover") ? (
                    <p className="text-xs text-subtle">
                      In the Journal · review by {trackedBy(m.item.id, "cover")}
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        logMove(m);
                      }}
                    >
                      <BookOpen className="size-3.5" /> Log as decision
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {report.plan.length > 8 && (
              <li className="text-xs text-muted">
                {report.plan.length - 8} more below the fold — fix these first.
              </li>
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function DocumentationPlanCard({
  docs,
  setSelectedId,
  trackedBy,
  logGap,
}: {
  docs: DocumentationReport;
  setSelectedId: (id: string) => void;
  trackedBy: StepTrack;
  logGap: (gap: DocumentationGap) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Write it down</CardTitle>
        <CardDescription>
          A backup is only as good as the procedure they can follow. Items with nothing
          written down, or a procedure nobody has said where to find, ranked by how much stops
          if the one person who knows is out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {docs.gaps.length === 0 ? (
          <p className="text-sm text-ok">
            Every item has a written procedure and a recorded place to find it. Re-check
            whenever a duty changes hands.
          </p>
        ) : (
          <ol className="space-y-2">
            {docs.gaps.slice(0, 8).map((g, i) => (
              <li
                key={g.item.id}
                className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm hover:bg-elevated/60"
                onClick={() => setSelectedId(g.item.id)}
              >
                <span className="font-mono text-xs text-muted">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{g.item.name}</span>
                    <Badge variant={g.state === "none" ? "danger" : "warn"}>
                      {DOCUMENTATION_LABEL[g.state]}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[g.coverage]}>
                      {STATUS_LABEL[g.coverage]}
                    </Badge>
                  </div>
                  <p className="text-muted">{g.action}</p>
                  {trackedBy(g.item.id, g.step) ? (
                    <p className="text-xs text-subtle">
                      In the Journal · review by {trackedBy(g.item.id, g.step)}
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        logGap(g);
                      }}
                    >
                      <BookOpen className="size-3.5" /> Log as decision
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {docs.gaps.length > 8 && (
              <li className="text-xs text-muted">
                {docs.gaps.length - 8} more — tick “A written procedure exists” and record
                where it lives on each item as you go.
              </li>
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function CheckInCard({
  trackFreshness,
  freshnessStaleCount,
  checkIns,
  checkInView,
  setCheckInChoice,
  activeCheckIn,
  checkInSetLevel,
  confirmItems,
}: {
  trackFreshness: boolean;
  freshnessStaleCount: number;
  checkIns: CheckInPlan;
  checkInView: string;
  setCheckInChoice: (id: string | null) => void;
  activeCheckIn: CheckInPlan["checkIns"][number] | undefined;
  checkInSetLevel: (personId: string, knowledgeId: string, level: KnowledgeLevel | undefined) => void;
  confirmItems: (ids: string[]) => void;
}) {
  if (!trackFreshness || freshnessStaleCount === 0) return null;
  return (
      <Card>
        <CardHeader>
          <CardTitle>Confirm it&apos;s still true</CardTitle>
          <CardDescription>
            {freshnessStaleCount} item(s) not confirmed in the last{" "}
            {CONFIRMATION_MAX_AGE_DAYS} days. People leave, learn and forget; a register
            nobody re-checks is a false comfort. Sit down with each person and go through what
            the register says they can do.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {checkIns.checkIns.map((c) => (
              <Button
                key={c.person.id}
                size="sm"
                variant={checkInView === c.person.id ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setCheckInChoice(c.person.id)}
                aria-pressed={checkInView === c.person.id}
              >
                <UserCheck className="size-3.5" /> {c.person.name} ({c.items.length})
              </Button>
            ))}
            {checkIns.unheld.length > 0 && (
              <Button
                size="sm"
                variant={checkInView === UNHELD_VIEW ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setCheckInChoice(UNHELD_VIEW)}
                aria-pressed={checkInView === UNHELD_VIEW}
              >
                Nobody holds ({checkIns.unheld.length})
              </Button>
            )}
          </div>

          {activeCheckIn ? (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                Ask {activeCheckIn.person.name}: can you still do each of these, and at this
                level?
                {activeCheckIn.soleCount > 0 &&
                  ` ${activeCheckIn.soleCount} of them nobody else can run alone.`}
              </p>
              <ol className="space-y-2">
                {activeCheckIn.items.map((entry, i) => (
                  <li
                    key={entry.item.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <span className="font-mono text-xs text-muted">{i + 1}.</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{entry.item.name}</span>
                        <Badge variant={STATUS_VARIANT[entry.coverage]}>
                          {STATUS_LABEL[entry.coverage]}
                        </Badge>
                        <span className="text-xs text-muted">
                          {entry.confirmedAt
                            ? `last confirmed ${entry.confirmedAt}`
                            : "never confirmed"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className={cn(inputClass, "text-xs")}
                          value={entry.level}
                          onChange={(e) =>
                            checkInSetLevel(
                              activeCheckIn.person.id,
                              entry.item.id,
                              e.target.value as KnowledgeLevel,
                            )
                          }
                          aria-label={`${activeCheckIn.person.name} on ${entry.item.name}`}
                        >
                          {[...LEVEL_ORDER].reverse().map((l) => (
                            <option key={l} value={l}>
                              {LEVEL_LABEL[l]}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => confirmItems([entry.item.id])}
                        >
                          Still does it
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-danger"
                          onClick={() =>
                            checkInSetLevel(activeCheckIn.person.id, entry.item.id, undefined)
                          }
                        >
                          No longer
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() =>
                  confirmItems(activeCheckIn.items.map((entry) => entry.item.id))
                }
              >
                <UserCheck className="size-3.5" /> Everything here is still true for{" "}
                {activeCheckIn.person.name}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                Nobody on the active team holds these, so there is no one to ask — confirm
                they still matter, or assign someone in the grid.
              </p>
              <ol className="space-y-2">
                {checkIns.unheld.map((entry, i) => (
                  <li
                    key={entry.item.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <span className="font-mono text-xs text-muted">{i + 1}.</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-medium">{entry.item.name}</div>
                      <p className="text-muted">{entry.action}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => confirmItems([entry.item.id])}
                      >
                        Still accurate
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
              {checkIns.unheld.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => confirmItems(checkIns.unheld.map((entry) => entry.item.id))}
                >
                  All {checkIns.unheld.length} still accurate
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
  );
}

export function CheckInDropsCard({
  trackFreshness,
  checkInDrops,
  trackedBy,
  logMove,
  setCheckInBaseline,
}: {
  trackFreshness: boolean;
  checkInDrops: CoverageDrop[];
  trackedBy: StepTrack;
  logMove: (move: CrossTrainingMove) => void;
  setCheckInBaseline: (value: null) => void;
}) {
  if (!trackFreshness || checkInDrops.length === 0) return null;
  return (
      <Card>
        <CardHeader>
          <CardTitle>What this check-in changed</CardTitle>
          <CardDescription>
            {checkInDrops.length} item(s) lost coverage since you started re-confirming. The
            register is more honest now — these are the gaps it uncovered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="space-y-2">
            {checkInDrops.map((d, i) => {
              const move = d.move;
              return (
                <li
                  key={d.item.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <span className="font-mono text-xs text-muted">{i + 1}.</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.item.name}</span>
                      <Badge variant={STATUS_VARIANT[d.to]}>{STATUS_LABEL[d.to]}</Badge>
                      <span className="text-xs text-muted">was: {STATUS_LABEL[d.from]}</span>
                    </div>
                    <p className="text-muted">
                      {d.remaining.length === 0
                        ? "Nobody left on the active team can run this alone."
                        : `${d.remaining.map((p) => p.name).join(" and ")} ${
                            d.remaining.length === 1 ? "is" : "are"
                          } left to run it alone.`}
                      {move && ` ${move.action}`}
                    </p>
                    {move &&
                      (trackedBy(d.item.id, "cover") ? (
                        <span className="text-xs text-muted">
                          In the Journal · review by {trackedBy(d.item.id, "cover")}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => logMove(move)}
                        >
                          <BookOpen className="size-3.5" /> Log as decision
                        </Button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setCheckInBaseline(null)}
          >
            Done reviewing these
          </Button>
        </CardContent>
      </Card>
  );
}

export function SelectedKnowledgeCard({
  selected,
  updateItem,
  trackFreshness,
  today,
}: {
  selected: ItemCoverage | undefined;
  updateItem: (id: string, patch: Partial<ItemCoverage["item"]>) => void;
  trackFreshness: boolean;
  today: string;
}) {
  if (!selected) return null;
  return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{selected.item.name}</CardTitle>
            <Badge variant={STATUS_VARIANT[selected.status]}>
              {STATUS_LABEL[selected.status]}
            </Badge>
          </div>
          <CardDescription>
            {selected.item.description || CRITICALITY_LABEL[selected.item.criticality]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              If nobody can do it
              <select
                className={inputClass}
                value={selected.item.criticality}
                onChange={(e) =>
                  updateItem(selected.item.id, { criticality: e.target.value as Criticality })
                }
              >
                {(Object.keys(CRITICALITY_LABEL) as Criticality[]).map((c) => (
                  <option key={c} value={c}>
                    {CRITICALITY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end text-xs text-muted">
              <input
                type="checkbox"
                checked={Boolean(selected.item.documented)}
                onChange={(e) =>
                  updateItem(selected.item.id, { documented: e.target.checked })
                }
              />
              A written procedure exists that a backup could follow
            </label>
          </div>
          {selected.item.documented && (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Where the procedure lives (drive path, binder, link)
              <input
                className={inputClass}
                value={selected.item.procedureLocation ?? ""}
                maxLength={200}
                placeholder="e.g. Shared drive › Office › Payroll checklist.pdf"
                onChange={(e) =>
                  updateItem(selected.item.id, { procedureLocation: e.target.value })
                }
              />
            </label>
          )}
          {trackFreshness && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Last confirmed {selected.item.confirmedAt ?? "never"}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => updateItem(selected.item.id, { confirmedAt: today })}
              >
                Still accurate
              </Button>
            </div>
          )}
          <PeopleLine
            label="Can run it alone"
            people={selected.primaries.map((p) => p.name)}
          />
          <PeopleLine label="Learning" people={selected.learners.map((p) => p.name)} />
          <PeopleLine label="Aware only" people={selected.aware.map((p) => p.name)} />
          {selected.suggestedBackups.length > 0 &&
            (isMarked(selected) ? (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Best people to train next
                </div>
                <ul className="space-y-1">
                  {selected.suggestedBackups.slice(0, 3).map((s) => (
                    <li key={s.person.id} className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{s.person.name}</span>
                      <span className="text-xs text-muted">{s.reasons.join("; ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted">
                Nobody is marked on this item yet. Mark who can do it; the app suggests who to
                train once someone is marked.
              </p>
            ))}
        </CardContent>
      </Card>
  );
}

