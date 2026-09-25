/**
 * The leave, leaver and debrief cards of the continuity planner, and the
 * small stat and people-line pieces they share with it.
 */
import { useState } from "react";
import { BookOpen, Trash2, UserCheck, UserMinus } from "lucide-react";
import { type AbsenceAction } from "@/lib/precog/continuity/absence-impact";
import { firstName } from "@/lib/precog/continuity/coverage";
import {
  formatDateRange,
  handoffDeadline,
  leadLabel,
  procedurePointer,
  type AbsenceWindow,
} from "@/lib/precog/continuity/planned-absence";
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
import type { KnowledgeItem, Person } from "@/lib/precog/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CRITICALITY_LABEL,
  LEVEL_SHORT,
  NOT_ASSESSED_ABSENCE,
} from "@/lib/precog/continuity/planner-copy";

const inputClass = "rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-fg";

/** Register items nobody can run alone: stopped whoever is in, listed apart from what the absence stops. */
export function AlreadyStopped({
  items,
  onSelect,
}: {
  items: KnowledgeItem[];
  onSelect: (knowledgeId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        Already stopped · nobody can run {items.length === 1 ? "it" : "these"} alone
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated/60"
              onClick={() => onSelect(item.id)}
            >
              {item.name} · {CRITICALITY_LABEL[item.criticality]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "ok" | "warn" | "danger" | "default";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-2xl font-semibold",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

export function LeaveWindow({
  window: w,
  today,
  assessed,
  onRemove,
  onExtend,
  onBack,
  onSelect,
  tracked,
  onLog,
}: {
  window: AbsenceWindow;
  today: string;
  /** False while nobody is marked on the register: the window cannot say what stops. */
  assessed: boolean;
  onRemove: () => void;
  onExtend: () => void;
  onBack: () => void;
  onSelect: (knowledgeId: string) => void;
  tracked: (a: AbsenceAction) => string | undefined;
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
            {w.person.name} · {formatDateRange(w.absence.from, w.absence.to)}
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
      {!assessed ? (
        <p className="mt-2 text-xs text-muted">{NOT_ASSESSED_ABSENCE}</p>
      ) : (
        <>
          {w.overlaps.length > 0 && (
            <p className="mt-1 text-xs text-warn">
              Overlapping absence:{" "}
              {w.overlaps
                .map((o) => `${firstName(o.person.name)} also out ${formatDateRange(o.from, o.to)}`)
                .join("; ")}
              .{" "}
              {w.peak.extraStops.length > 0
                ? `Stops below are for ${formatDateRange(w.peak.from, w.peak.to)}, when ${w.peak.people
                    .filter((p) => p.id !== w.person.id)
                    .map((p) => firstName(p.name))
                    .join(" and ")} ${w.peak.people.length === 2 ? "is" : "are"} also away.`
                : "Nothing extra stops on the shared days."}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              variant={impact.dependence >= 50 ? "danger" : impact.dependence >= 25 ? "warn" : "ok"}
            >
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
                  className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 hover:bg-elevated/60"
                  onClick={() => onSelect(s.item.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.item.name}</span>
                    <Badge variant={s.item.criticality === "critical" ? "danger" : "default"}>
                      {CRITICALITY_LABEL[s.item.criticality]}
                    </Badge>
                    <span className="text-xs text-muted">
                      → {s.standIn ? s.standIn.name : "nobody"}
                    </span>
                    {current && (
                      <span
                        className={cn("text-xs", s.item.documented ? "text-muted" : "text-warn")}
                      >
                        · {procedurePointer(s)}
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
            <PeopleLine label="Left in the business" people={impact.remaining.map((p) => p.name)} />
          </div>
          {impact.orphanedProcesses.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              No owner left for: {impact.orphanedProcesses.join(", ")}
            </p>
          )}
          {impact.actions.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                {current ? "Do today" : `Before ${deadline}`}
              </div>
              <ol className="list-decimal space-y-1 pl-5">
                {impact.actions.map((a) => (
                  <li key={a.text}>
                    {a.text}
                    {a.knowledgeIds.length > 0 &&
                      (tracked(a) ? (
                        <span className="ml-2 text-xs text-subtle">
                          In the Journal · review by {tracked(a)}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-1 h-6 px-1.5 text-xs"
                          onClick={() => onLog(a)}
                        >
                          <BookOpen className="size-3.5" /> Log as decision
                        </Button>
                      ))}
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

function HandoverRow({ h, onSelect }: { h: HandoverItem; onSelect: (id: string) => void }) {
  const journal = h.training ?? h.documenting;
  return (
    <li
      className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 hover:bg-elevated/60"
      onClick={() => onSelect(h.item.id)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{h.item.name}</span>
        <Badge variant={h.item.criticality === "critical" ? "danger" : "default"}>
          {CRITICALITY_LABEL[h.item.criticality]}
        </Badge>
        <span className="text-xs text-muted">
          →{" "}
          {h.successor
            ? `${h.successor.name}${h.successorLevel ? ` (${LEVEL_SHORT[h.successorLevel]})` : " (starting cold)"}`
            : "nobody to hand it to"}
        </span>
        <span className={cn("text-xs", h.item.documented ? "text-muted" : "text-warn")}>
          ·{" "}
          {h.item.documented
            ? h.item.procedureLocation?.trim()
              ? `written · ${h.item.procedureLocation.trim()}`
              : "written, location not recorded"
            : "nothing written down"}
        </span>
        {journal?.reviewBy && (
          <span className="text-xs text-subtle">
            In the Journal · {h.training ? "training" : "writing it down"} · review by{" "}
            {journal.reviewBy}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">{h.note}</p>
    </li>
  );
}

export function LeaverCard({
  leaver: l,
  today,
  assessed,
  onSelect,
  onChangeDate,
  onCancel,
  onMarkLeft,
  tracked,
  onLog,
}: {
  leaver: Leaver;
  today: string;
  /** False while nobody is marked on the register: the hand-over cannot be worked out. */
  assessed: boolean;
  onSelect: (knowledgeId: string) => void;
  onChangeDate: (lastDay: string) => void;
  onCancel: () => void;
  onMarkLeft: () => void;
  tracked: (a: AbsenceAction) => string | undefined;
  onLog: (a: AbsenceAction) => void;
}) {
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
            {l.person.name} · last day {l.lastDay}
          </span>
          <Badge variant={gone ? "danger" : urgent ? "warn" : "default"}>
            {leaverLead(l.daysLeft)}
          </Badge>
          {assessed && (
            <Badge variant={l.dependence >= 50 ? "danger" : l.dependence >= 25 ? "warn" : "ok"}>
              {l.dependence}% of must-do work
            </Badge>
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
          {first}&apos;s last day has passed but {first} still counts as cover. Mark as left to take{" "}
          {first} out of the coverage figures; the record stays in the history.
        </p>
      )}
      {assessed && l.handover.length > 0 && (
        <>
          <div className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
            Hand-over checklist · {l.handover.length} only {first} can run alone
            {l.unlogged > 0 && ` · ${l.unlogged} not yet in the Journal`}
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
          label={gone ? "Left in the business" : `Left in the business after ${l.lastDay}`}
          people={l.remaining.map((p) => p.name)}
        />
      </div>
      {assessed && l.actions.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            {gone ? "Overdue — do now" : `Before ${deadline}`}
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            {l.actions.map((a) => (
              <li key={a.text}>
                {a.text}
                {a.knowledgeIds.length > 0 &&
                  (tracked(a) ? (
                    <span className="ml-2 text-xs text-subtle">
                      In the Journal · review by {tracked(a)}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-1 h-6 px-1.5 text-xs"
                      onClick={() => onLog(a)}
                    >
                      <BookOpen className="size-3.5" /> Log as decision
                    </Button>
                  ))}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function LeaveDebriefCard({
  debrief,
  people,
  answered,
  onPromote,
  onKeepTraining,
  onClose,
  onDismiss,
}: {
  debrief: LeaveDebrief;
  people: Person[];
  answered: (entry: DebriefItem) => boolean;
  onPromote: (entry: DebriefItem, standIn: Person) => void;
  onKeepTraining: (entry: DebriefItem, standIn: Person) => void;
  onClose: (entry: DebriefItem) => void;
  onDismiss: () => void;
}) {
  const first = firstName(debrief.person.name);
  /** Who the owner says actually stepped in, when the register had nobody lined up. */
  const [pickedStandIn, setPickedStandIn] = useState<Record<string, string>>({});
  const candidates = people.filter((p) => p.id !== debrief.person.id);
  const open = debrief.items.filter((e) => !answered(e));
  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {first}&apos;s back · out {formatDateRange(debrief.absence.from, debrief.absence.to)}
          </span>
          <Badge variant="accent">Debrief</Badge>
          <span className="text-xs text-muted">
            {debrief.lengthDays} day{debrief.lengthDays === 1 ? "" : "s"} · back{" "}
            {debrief.daysSince === 1 ? "yesterday" : `${debrief.daysSince} days ago`}
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
          const standIn =
            e.standIn ?? candidates.find((p) => p.id === pickedStandIn[e.item.id]) ?? null;
          const standInFirst = standIn ? firstName(standIn.name) : undefined;
          return (
            <li key={e.item.id} className="rounded-md border border-border bg-surface px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.item.name}</span>
                <Badge variant={e.item.criticality === "critical" ? "danger" : "default"}>
                  {CRITICALITY_LABEL[e.item.criticality]}
                </Badge>
                {e.standIn && e.standInLevel && (
                  <span className="text-xs text-muted">
                    {standInFirst} today: {LEVEL_SHORT[e.standInLevel]}
                  </span>
                )}
                {e.handoff && <span className="text-xs text-subtle">Hand-off in the Journal</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted">{describeDebriefItem(debrief, e)}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {!e.standIn && (
                  <select
                    className={cn(inputClass, "h-7 py-0 text-xs")}
                    aria-label={`Who stepped in for ${e.item.name}`}
                    value={pickedStandIn[e.item.id] ?? ""}
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
                {standIn && !standInAlreadyStrong(e) ? (
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

export function PeopleLine({ label, people }: { label: string; people: string[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={people.length ? "" : "text-muted"}>
        {people.length ? people.join(", ") : "nobody"}
      </span>
    </div>
  );
}
