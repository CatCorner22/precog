/**
 * The leave, leaver and debrief cards of the continuity planner: one card
 * per absence window, per person leaving, and per leave to debrief.
 */
import { useState } from "react";
import { Trash2, UserCheck, UserMinus } from "lucide-react";
import { type AbsenceAction } from "@/lib/precog/continuity/absence-impact";
import type { ContinuityCommitment } from "@/lib/precog/decisions/follow-through";
import {
  AlreadyStopped,
  ItemButton,
  JournalStepStatus,
  PeopleLine,
} from "@/components/precog/continuity/parts";
import {
  handoffDeadline,
  leadLabel,
  type AbsenceWindow,
} from "@/lib/precog/continuity/planned-absence";
import { isWritten, procedurePointer } from "@/lib/precog/continuity/documentation";
import type { KnowledgeItem } from "@/lib/precog/types";
import { Link } from "@tanstack/react-router";
import {
  describeDebriefItem,
  standInAlreadyStrong,
  type DebriefItem,
  type LeaveDebrief,
} from "@/lib/precog/continuity/leave-debrief";
import {
  describeLeaver,
  HANDOVER_URGENT_DAYS,
  handoverDeadline,
  leaverLead,
  type HandoverItem,
  type Leaver,
} from "@/lib/precog/continuity/leavers";
import type { Person } from "@/lib/precog/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dependenceTone } from "@/lib/precog/scoring/bands";
import { useTabName } from "@/lib/precog/presentation";
import {
  CRITICALITY_LABEL,
  LEVEL_SHORT,
  NOT_ASSESSED_ABSENCE,
} from "@/lib/precog/continuity/planner-copy";
import { inputClass } from "./styles";
import {
  standInConflictNote,
  type StandInConflicts,
} from "@/lib/precog/continuity/standin-conflicts";
import { formatDay, formatDayRange } from "@/lib/precog/dates";
import { joinWithAnd, verb, firstName } from "@/lib/precog/text";

type StepCommitment = (a: AbsenceAction) => ContinuityCommitment | undefined;

/** One absence: what stops, who steps in, and the hand-offs to log before it starts. */
export function LeaveWindow({
  window: w,
  today,
  onRemove,
  onExtend,
  onBack,
  onSelect,
  tracked,
  onLog,
}: {
  window: AbsenceWindow;
  today: string;
  onRemove: () => void;
  onExtend: () => void;
  onBack: () => void;
  onSelect: (knowledgeId: string) => void;
  tracked: StepCommitment;
  onLog: (a: AbsenceAction) => void;
}) {
  const first = firstName(w.person.name);
  const current = w.status === "current";
  // A window that has started shows what stops today; the peak stays for planning.
  const impact = current && w.todayImpact ? w.todayImpact : w.impact;
  const deadline = handoffDeadline(w, today);
  const unplanned = Boolean(w.absence.unplanned);
  return (
    <div className={cn("rounded-md border p-3", current ? "border-danger/50" : "border-border")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {w.person.name} · {formatDayRange(w.absence.from, w.absence.to)}
          </span>
          <Badge variant={current ? "danger" : w.daysUntil <= 7 ? "warn" : "default"}>
            {current
              ? unplanned
                ? "Out unexpectedly"
                : "Out now"
              : `${unplanned ? "Unplanned · " : ""}${leadLabel(w.daysUntil)}`}
          </Badge>
          <span className="text-xs text-muted">
            {unplanned && w.absence.from === today && w.absence.to === today
              ? "today only so far"
              : `${w.lengthDays} day${w.lengthDays === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {current && (
            <>
              {w.absence.to <= today && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  aria-label={`${first} still out tomorrow`}
                  onClick={onExtend}
                >
                  Still out tomorrow
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                aria-label={`${first} is back`}
                onClick={onBack}
              >
                <UserCheck className="size-3.5" /> Back
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5"
            aria-label={`Remove ${first}'s ${unplanned ? "absence" : "leave"}`}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {!w.impact.assessed ? (
        <p className="mt-2 text-xs text-muted">{NOT_ASSESSED_ABSENCE}</p>
      ) : (
        <>
          {w.overlaps.length > 0 && (
            <p className="mt-1 text-xs text-warn">
              Overlapping absence:{" "}
              {w.overlaps
                .map((o) => `${firstName(o.person.name)} also out ${formatDayRange(o.from, o.to)}`)
                .join("; ")}
              .{" "}
              {w.peak.extraStops.length > 0
                ? `Stops below are for ${formatDayRange(w.peak.from, w.peak.to)}, when ${joinWithAnd(
                    w.peak.people.filter((p) => p.id !== w.person.id).map((p) => firstName(p.name)),
                  )} ${verb(w.peak.people.length - 1, "is", "are")} also away.`
                : "Nothing extra stops on the shared days."}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={dependenceTone(impact.dependence)}>
              {impact.dependence}% of must-do work stops
            </Badge>
            <span className="text-xs text-muted">
              {impact.stops.length} stop · {impact.continues.length} continue
              {impact.orphanedProcesses.length > 0 &&
                ` · ${impact.orphanedProcesses.length} process${impact.orphanedProcesses.length === 1 ? "" : "es"} without an owner`}
            </span>
          </div>
          {impact.stops.length > 0 && (
            <ul className="mt-2 space-y-1">
              {impact.stops.map((s) => (
                <li
                  key={s.item.id}
                  className="rounded-md border border-border px-2.5 py-1.5 hover:bg-elevated/60"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ItemButton item={s.item} onSelect={onSelect} />
                    <Badge variant={s.item.criticality === "critical" ? "danger" : "default"}>
                      {CRITICALITY_LABEL[s.item.criticality]}
                    </Badge>
                    <span className="text-xs text-muted">
                      → {s.standIn ? s.standIn.name : "nobody"}
                    </span>
                    {current && (
                      <span
                        className={cn("text-xs", isWritten(s.item) ? "text-muted" : "text-warn")}
                      >
                        ·{" "}
                        {s.item.linkedProcedures?.[0] ? (
                          <Link
                            to="/"
                            search={{ tab: "procedures", item: s.item.linkedProcedures[0].id }}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            open the steps: {s.item.linkedProcedures[0].title}
                          </Link>
                        ) : (
                          procedurePointer(s.item)
                        )}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{s.note}</p>
                </li>
              ))}
            </ul>
          )}
          {impact.alreadyStopped.length > 0 && (
            <div className="mt-2">
              <AlreadyStopped items={impact.alreadyStopped} onSelect={onSelect} />
            </div>
          )}
          <div className="mt-2">
            <PeopleLine
              label="Still in the business"
              people={impact.remaining.map((p) => p.name)}
            />
          </div>
          {impact.orphanedProcesses.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              No owner left for: {impact.orphanedProcesses.join(", ")}
            </p>
          )}
          {impact.actions.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                {current ? "Do today" : `Before ${formatDay(deadline)}`}
              </div>
              <ol className="list-decimal space-y-1 pl-5">
                {impact.actions.map((a) => (
                  <li key={a.text}>
                    {a.text}
                    {a.knowledgeIds.length > 0 && (
                      <JournalStepStatus inline commitment={tracked(a)} onLog={() => onLog(a)} />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One person leaving: the hand-off checklist, who stays, and marking them as left. */
export function LeaverCard({
  leaver: l,
  today,
  onSelect,
  onChangeDate,
  onCancel,
  onMarkLeft,
  tracked,
  onLog,
}: {
  leaver: Leaver;
  today: string;
  onSelect: (knowledgeId: string) => void;
  onChangeDate: (lastDay: string) => void;
  onCancel: () => void;
  onMarkLeft: () => void;
  tracked: StepCommitment;
  onLog: (a: AbsenceAction) => void;
}) {
  const tabName = useTabName();
  /** False while nobody is marked on the register: the hand-off cannot be worked out. */
  const assessed = l.assessed;
  const first = firstName(l.person.name);
  const gone = l.status === "gone";
  const urgent = !gone && l.daysLeft <= HANDOVER_URGENT_DAYS;
  const deadline = handoverDeadline(l, today);
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        gone ? "border-danger/50" : urgent ? "border-warn/50" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {l.person.name} · last day {formatDay(l.lastDay)}
          </span>
          <Badge variant={gone ? "danger" : urgent ? "warn" : "default"}>
            {leaverLead(l.daysLeft)}
          </Badge>
          {assessed && (
            <Badge variant={dependenceTone(l.dependence)}>{l.dependence}% of must-do work</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <label className="flex items-center gap-1 text-xs text-muted">
            Change
            <input
              type="date"
              className="h-6 rounded-md border border-border bg-elevated px-1.5 text-xs text-fg"
              value={l.lastDay}
              aria-label={`Change ${first}'s last day`}
              onChange={(e) => onChangeDate(e.target.value)}
            />
          </label>
          {gone && (
            <Button size="sm" className="h-6 px-2 text-xs" onClick={onMarkLeft}>
              <UserMinus className="size-3.5" /> Mark as left
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            aria-label={`${first} is staying`}
            onClick={onCancel}
          >
            Staying after all
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        {assessed ? describeLeaver(l) : NOT_ASSESSED_ABSENCE}
      </p>
      {gone && (
        <p className="mt-1 text-xs text-danger">
          {first}&apos;s last day has passed but {first} still counts as a stand-in. Mark as left to
          take {first} out of the coverage figures; the record stays in the history.
        </p>
      )}
      {assessed && l.handover.length > 0 && (
        <>
          <div className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
            Hand-off checklist · {l.handover.length} only {first} can run alone
            {l.unlogged > 0 && ` · ${l.unlogged} not yet in the ${tabName("journal")}`}
          </div>
          <ul className="mt-1 space-y-1">
            {l.handover.map((h) => (
              <HandoverRow key={h.item.id} h={h} onSelect={onSelect} />
            ))}
          </ul>
        </>
      )}
      {l.shared.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Shared with others, keeps running: {l.shared.map((k) => k.name).join(", ")}
        </p>
      )}
      {l.orphanedProcesses.length > 0 && (
        <p className="mt-1 text-xs text-warn">
          Processes needing a new owner: {l.orphanedProcesses.join(", ")}
        </p>
      )}
      <div className="mt-2">
        <PeopleLine
          label={
            gone ? "Still in the business" : `Still in the business after ${formatDay(l.lastDay)}`
          }
          people={l.remaining.map((p) => p.name)}
        />
      </div>
      {assessed && l.actions.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            {gone ? "Overdue — do now" : `Before ${formatDay(deadline)}`}
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            {l.actions.map((a) => (
              <li key={a.text}>
                {a.text}
                {a.knowledgeIds.length > 0 && (
                  <JournalStepStatus inline commitment={tracked(a)} onLog={() => onLog(a)} />
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function HandoverRow({ h, onSelect }: { h: HandoverItem; onSelect: (id: string) => void }) {
  const tabName = useTabName();
  const journal = h.training ?? h.documenting;
  return (
    <li className="rounded-md border border-border px-2.5 py-1.5 hover:bg-elevated/60">
      <div className="flex flex-wrap items-center gap-2">
        <ItemButton item={h.item} onSelect={onSelect} />
        <Badge variant={h.item.criticality === "critical" ? "danger" : "default"}>
          {CRITICALITY_LABEL[h.item.criticality]}
        </Badge>
        <span className="text-xs text-muted">
          →{" "}
          {h.successor
            ? `${h.successor.name}${h.successorLevel ? ` (${LEVEL_SHORT[h.successorLevel]})` : " (starting cold)"}`
            : "nobody to hand it to"}
        </span>
        <span className={cn("text-xs", isWritten(h.item) ? "text-muted" : "text-warn")}>
          · {writtenNote(h.item)}
        </span>
        {journal?.reviewBy && (
          <span className="text-xs text-subtle">
            In the {tabName("journal")} · {h.training ? "training" : "writing it down"} · review by{" "}
            {formatDay(journal.reviewBy)}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">{h.note}</p>
    </li>
  );
}

/** A leave that has ended: did the stand-in run each item alone, and what to record. */
export function LeaveDebriefCard({
  debrief,
  people,
  answered,
  conflictsFor,
  onPromote,
  onKeepTraining,
  onClose,
  onDismiss,
}: {
  debrief: LeaveDebrief;
  people: Person[];
  answered: (entry: DebriefItem) => boolean;
  /** Duty conflicts a stand-in would hold by keeping this work: a warning, never a block. */
  conflictsFor?: StandInConflicts;
  onPromote: (entry: DebriefItem, standIn: Person) => void;
  onKeepTraining: (entry: DebriefItem, standIn: Person) => void;
  onClose: (entry: DebriefItem) => void;
  onDismiss: () => void;
}) {
  const tabName = useTabName();
  const first = firstName(debrief.person.name);
  /**
   * Who the owner says actually stepped in, when no logged hand-off names
   * anyone: the register's suggestion is only preselected.
   */
  const [pickedStandIn, setPickedStandIn] = useState<Record<string, string>>({});
  const candidates = people.filter((p) => p.id !== debrief.person.id);
  const open = debrief.items.filter((e) => !answered(e));
  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {first}&apos;s back · out {formatDayRange(debrief.absence.from, debrief.absence.to)}
          </span>
          <Badge variant="accent">Debrief</Badge>
          <span className="text-xs text-muted">
            {debrief.lengthDays} day{debrief.lengthDays === 1 ? "" : "s"} · back{" "}
            {debrief.daysSince === 1
              ? "today"
              : debrief.daysSince === 2
                ? "yesterday"
                : `${debrief.daysSince - 1} days ago`}
          </span>
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={onDismiss}>
          Nothing to record
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Someone just ran {first}&apos;s work for real. Move them up on the register while it is
        fresh, or turn the gap into a tracked cross-training step.
      </p>
      <ul className="mt-2 space-y-2">
        {open.map((e) => {
          const pickedId = pickedStandIn[e.item.id] ?? e.standIn?.id ?? "";
          const standIn = e.standInConfirmed
            ? e.standIn
            : (candidates.find((p) => p.id === pickedId) ?? null);
          const standInFirst = standIn ? firstName(standIn.name) : undefined;
          // The register level read for the suggestion holds only while it is the one picked.
          const suggestedPicked = Boolean(standIn) && standIn?.id === e.standIn?.id;
          const conflictNote = standIn
            ? standInConflictNote(standIn.name, conflictsFor?.(standIn.id, e.item.id) ?? [])
            : "";
          return (
            <li key={e.item.id} className="rounded-md border border-border bg-surface px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] font-medium">
                  {e.item.name}
                </span>
                <Badge variant={e.item.criticality === "critical" ? "danger" : "default"}>
                  {CRITICALITY_LABEL[e.item.criticality]}
                </Badge>
                {suggestedPicked && e.standInLevel && (
                  <span className="text-xs text-muted">
                    {standInFirst} today: {LEVEL_SHORT[e.standInLevel]}
                  </span>
                )}
                {e.handoff && (
                  <span className="text-xs text-subtle">Hand-off in the {tabName("journal")}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">{describeDebriefItem(debrief, e)}</p>
              {conflictNote && <p className="mt-0.5 text-xs text-warn">{conflictNote}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {!e.standInConfirmed && (
                  <select
                    className={cn(inputClass, "h-7 py-0 text-xs")}
                    aria-label={`Who stepped in for ${e.item.name}`}
                    value={pickedId}
                    onChange={(ev) =>
                      setPickedStandIn((cur) => ({ ...cur, [e.item.id]: ev.target.value }))
                    }
                  >
                    <option value="">Who stepped in?</option>
                    {candidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                {standIn && !(suggestedPicked && standInAlreadyStrong(e)) ? (
                  <>
                    <Button size="sm" className="h-7 text-xs" onClick={() => onPromote(e, standIn)}>
                      <UserCheck className="size-3.5" /> {standInFirst} can do it alone now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onKeepTraining(e, standIn)}
                    >
                      Not yet — {e.training ? "keep training" : "log cross-training"}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onClose(e)}
                  >
                    {e.handoff ? "Close the hand-off" : "Nobody did — move on"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What a leaver's successor will have to follow, in the card's short wording. */
function writtenNote(item: KnowledgeItem): string {
  const inApp = item.linkedProcedures?.[0];
  if (inApp) return `written · in Procedures: ${inApp.title}`;
  if (!item.documented) return "nothing written down";
  const where = item.procedureLocation?.trim();
  return where ? `written · ${where}` : "written, location not recorded";
}
