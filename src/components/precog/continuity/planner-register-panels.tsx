import { BookOpenCheck, UserCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { buttonClass } from "@/components/ui/button-variants";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { provenBackups } from "@/lib/precog/procedures/proof";
import { ItemButton, JournalStepStatus, PeopleLine } from "@/components/precog/continuity/parts";
import type {
  CheckIn,
  JournalSteps,
  RegisterEditor,
} from "@/components/precog/continuity/use-continuity-planner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LEVEL_LABEL,
  isMarked,
  LEVEL_ORDER,
  STATUS_LABEL,
  type CoverageReport,
  type CoverageStatus,
} from "@/lib/precog/continuity/coverage";
import {
  DOCUMENTATION_LABEL,
  type DocumentationReport,
} from "@/lib/precog/continuity/documentation";
import {
  coverageBadge,
  CRITICALITY_LABEL,
  NOT_ASSESSED_PLAN,
  STATUS_VARIANT,
  statusBadge,
  UNHELD_VIEW,
} from "@/lib/precog/continuity/planner-copy";
import { itemRecorded } from "@/lib/precog/continuity/register-state";
import { CONFIRMATION_MAX_AGE_DAYS } from "@/lib/precog/continuity/staleness";
import { inputClass } from "./styles";
import type { Criticality, KnowledgeItem, KnowledgeLevel } from "@/lib/precog/types";
import { cn } from "@/lib/utils";
import { count, joinWithAnd, verb } from "@/lib/precog/text";
import { formatDay } from "@/lib/precog/dates";

/** How many steps each plan card lists before "more not shown". */
const PLAN_SHOWN = 8;

function CoverageStatusBadge({ status, recorded }: { status: CoverageStatus; recorded: boolean }) {
  const badge = statusBadge(status, recorded);
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

/** Who to train on what, most urgent first, each step loggable as a decision. */
export function CrossTrainingPlanCard({
  registerAssessed,
  report,
  journal,
  onSelect,
}: {
  registerAssessed: boolean;
  report: CoverageReport;
  journal: JournalSteps;
  onSelect: (knowledgeId: string) => void;
}) {
  const tpl = useTemplate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cross-training plan</CardTitle>
        <CardDescription>
          What to do next, most urgent first. Each step names the person to learn and the person to
          teach.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!registerAssessed ? (
          <p className="text-sm text-muted">{NOT_ASSESSED_PLAN}</p>
        ) : report.plan.length === 0 ? (
          <p className="text-sm text-ok">
            Every item has at least two people who can run it alone. Revisit this after anyone
            joins, leaves, or changes role.
          </p>
        ) : (
          <ol className="space-y-2">
            {report.plan.slice(0, PLAN_SHOWN).map((m, i) => (
              <li
                key={m.item.id}
                className="flex gap-3 rounded-lg border border-border p-3 text-sm hover:bg-elevated/60"
              >
                <span className="font-mono text-xs text-muted">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ItemButton item={m.item} onSelect={onSelect} />
                    <CoverageStatusBadge
                      status={m.status}
                      recorded={itemRecorded(tpl, m.item.id)}
                    />
                  </div>
                  <p className="text-muted">{m.action}</p>
                  <JournalStepStatus
                    commitment={journal.trackedBy(m.item.id, "cover")}
                    onLog={() => journal.logMove(m)}
                  />
                </div>
              </li>
            ))}
            {report.plan.length > PLAN_SHOWN && (
              <li className="text-xs text-muted">
                {report.plan.length - PLAN_SHOWN} more not shown. Finish these {PLAN_SHOWN} first.
              </li>
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Items with nothing written down, or no recorded place to find it, ranked by what stops. */
export function DocumentationPlanCard({
  docs,
  journal,
  onSelect,
}: {
  docs: DocumentationReport;
  journal: JournalSteps;
  onSelect: (knowledgeId: string) => void;
}) {
  const tpl = useTemplate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Write it down</CardTitle>
        <CardDescription>
          A stand-in needs steps to follow. These items have nothing written down, or nobody has
          said where the steps are. The ones that stop the most work come first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {docs.gaps.length === 0 ? (
          <p className="text-sm text-ok">
            Every item has a written procedure and a recorded place to find it. Re-check whenever a
            duty changes hands.
          </p>
        ) : (
          <ol className="space-y-2">
            {docs.gaps.slice(0, PLAN_SHOWN).map((g, i) => (
              <li
                key={g.item.id}
                className="flex gap-3 rounded-lg border border-border p-3 text-sm hover:bg-elevated/60"
              >
                <span className="font-mono text-xs text-muted">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ItemButton item={g.item} onSelect={onSelect} />
                    <Badge variant={g.state === "none" ? "danger" : "warn"}>
                      {DOCUMENTATION_LABEL[g.state]}
                    </Badge>
                    <CoverageStatusBadge
                      status={g.coverage}
                      recorded={itemRecorded(tpl, g.item.id)}
                    />
                  </div>
                  <p className="text-muted">{g.action}</p>
                  <JournalStepStatus
                    commitment={journal.trackedBy(g.item.id, g.step)}
                    onLog={() => journal.logGap(g)}
                  />
                </div>
              </li>
            ))}
            {docs.gaps.length > PLAN_SHOWN && (
              <li className="text-xs text-muted">
                {docs.gaps.length - PLAN_SHOWN} more — tick “A written procedure exists” and record
                where it lives on each item as you go.
              </li>
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Re-confirming the register one person at a time; shown once items go unconfirmed too long. */
export function CheckInCard({
  checkIn,
  trackFreshness,
}: {
  checkIn: CheckIn;
  trackFreshness: boolean;
}) {
  const {
    plan: checkIns,
    view: checkInView,
    setChoice: setCheckInChoice,
    active: activeCheckIn,
    setLevel: checkInSetLevel,
    confirmItems,
  } = checkIn;
  const tpl = useTemplate();
  if (!trackFreshness || checkIn.staleCount === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm it&apos;s still true</CardTitle>
        <CardDescription>
          {count(checkIn.staleCount, "item")} not confirmed in the last {CONFIRMATION_MAX_AGE_DAYS}{" "}
          days. People leave, learn and forget; a register nobody re-checks is a false comfort. Sit
          down with each person and go through what the register says they can do.
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
              Ask {activeCheckIn.person.name}: can you still do each of these, and at this level?
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
                      <CoverageStatusBadge
                        status={entry.coverage}
                        recorded={itemRecorded(tpl, entry.item.id)}
                      />
                      <span className="text-xs text-muted">
                        {entry.confirmedAt
                          ? `last confirmed ${formatDay(entry.confirmedAt)}`
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
              onClick={() => confirmItems(activeCheckIn.items.map((entry) => entry.item.id))}
            >
              <UserCheck className="size-3.5" /> Everything here is still true for{" "}
              {activeCheckIn.person.name}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Nobody on the active team holds these, so there is no one to ask — confirm they still
              matter, or assign someone in the grid.
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

/** Items that lost coverage during this check-in, with the move that restores each. */
export function CheckInDropsCard({
  checkIn,
  trackFreshness,
  journal,
}: {
  checkIn: CheckIn;
  trackFreshness: boolean;
  journal: JournalSteps;
}) {
  const checkInDrops = checkIn.drops;
  if (!trackFreshness || checkInDrops.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>What this check-in changed</CardTitle>
        <CardDescription>
          {count(checkInDrops.length, "item")} lost coverage since you started re-confirming. The
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
                      ? "Nobody still on the team can run this alone."
                      : `${joinWithAnd(d.remaining.map((p) => p.name))} ${verb(
                          d.remaining.length,
                          "is",
                          "are",
                        )} left to run it alone.`}
                    {move && ` ${move.action}`}
                  </p>
                  {move && (
                    <JournalStepStatus
                      commitment={journal.trackedBy(d.item.id, "cover")}
                      onLog={() => journal.logMove(move)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={checkIn.clearBaseline}>
          Done reviewing these
        </Button>
      </CardContent>
    </Card>
  );
}

/** The item picked in the grid or a plan: criticality, where its procedure lives, who holds it. */
export function SelectedKnowledgeCard({
  register,
  trackFreshness,
}: {
  register: Pick<RegisterEditor, "selected" | "updateItem" | "confirmItems">;
  trackFreshness: boolean;
}) {
  const { selected, updateItem } = register;
  if (!selected) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{selected.item.name}</CardTitle>
          <Badge variant={coverageBadge(selected).variant}>{coverageBadge(selected).label}</Badge>
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
              onChange={(e) => updateItem(selected.item.id, { documented: e.target.checked })}
            />
            A written procedure exists that a stand-in could follow
          </label>
        </div>
        <ProcedureLinkLine item={selected.item} />
        {selected.item.documented && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            Where the procedure lives (drive path, binder, link)
            <input
              className={inputClass}
              value={selected.item.procedureLocation ?? ""}
              maxLength={200}
              placeholder="For example: Shared drive › Office › Payroll checklist.pdf"
              onChange={(e) => updateItem(selected.item.id, { procedureLocation: e.target.value })}
            />
          </label>
        )}
        {trackFreshness && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>
              Last confirmed{" "}
              {selected.item.confirmedAt ? formatDay(selected.item.confirmedAt) : "never"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => register.confirmItems([selected.item.id])}
            >
              Still accurate
            </Button>
          </div>
        )}
        <PeopleLine label="Can run it alone" people={selected.primaries.map((p) => p.name)} />
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
              You have not marked anyone on this item yet. Mark who can do it; Precog suggests who
              to train once you mark someone.
            </p>
          ))}
      </CardContent>
    </Card>
  );
}

/**
 * The item's procedures on the Procedures tab, or a way to start one there.
 * A procedure written there counts as written down and findable, whatever the
 * checkbox above says.
 */
function ProcedureLinkLine({ item }: { item: KnowledgeItem }) {
  const linked = item.linkedProcedures ?? [];
  const { profile } = usePractice();
  const tpl = useTemplate();
  const proven = [...provenBackups(profile.procedures ?? [], profile.industry)]
    .filter(([key]) => key.endsWith(`\u0000${item.id}`))
    .map(([key, on]) => ({
      name: tpl.people.find((p) => p.id === key.split("\u0000")[0])?.name,
      on,
    }))
    .filter((x): x is { name: string; on: string } => Boolean(x.name));
  if (linked.length === 0) {
    return (
      <Link
        to="/"
        search={{ tab: "procedures", item: item.id }}
        className={buttonClass({ variant: "outline", size: "sm", className: "h-8 text-xs" })}
      >
        <BookOpenCheck className="size-3.5" aria-hidden /> Write the steps in Procedures
      </Link>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <BookOpenCheck className="size-3.5 text-ok" aria-hidden />
        <span className="text-muted">Written in Procedures:</span>
        {linked.map((p) => (
          <Link
            key={p.id}
            to="/"
            search={{ tab: "procedures", item: p.id }}
            className="text-primary underline-offset-2 hover:underline"
          >
            {p.title}
          </Link>
        ))}
      </div>
      {proven.length > 0 && (
        <p className="text-xs text-muted">
          Stand-in proved it:{" "}
          {proven.map((x) => `${x.name} did it alone ${formatDay(x.on)}`).join("; ")}
        </p>
      )}
    </div>
  );
}
