import { BookOpen, CalendarDays, LogOut, Plus, Trash2, UserMinus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { LeaverAccessList } from "@/components/precog/leaver-access";
import {
  AlreadyStopped,
  LeaveDebriefCard,
  LeaverCard,
  LeaveWindow,
  PeopleLine,
} from "@/components/precog/continuity/leave-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AbsenceAction, AbsenceImpact } from "@/lib/precog/continuity/absence-impact";
import { firstName, type CoverageReport } from "@/lib/precog/continuity/coverage";
import type { DebriefItem, LeaveDebrief } from "@/lib/precog/continuity/leave-debrief";
import { handoverDeadline, type Leaver } from "@/lib/precog/continuity/leavers";
import {
  CRITICALITY_LABEL,
  inputClass,
  NOT_ASSESSED_ABSENCE,
} from "@/lib/precog/continuity/planner-copy";
import {
  formatDateRange,
  handoffDeadline,
  type PlannedAbsenceReport,
} from "@/lib/precog/continuity/planned-absence";
import type { PlannedAbsence } from "@/lib/precog/practice-profile";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import { joinWithAnd as naturalNames } from "@/lib/precog/text";
import type { Person } from "@/lib/precog/types";
import { cn } from "@/lib/utils";

type StepTrack = (action: AbsenceAction, absenceId?: string) => string | undefined;
type LogStep = (action: AbsenceAction, reviewByKey?: string, absenceId?: string) => void;

export function OutTomorrowCard({
  people,
  effectiveAbsentIds,
  setAbsentIds,
  registerReady,
  absence,
  setSelectedId,
  absenceStepTracked,
  logAbsenceAction,
}: {
  people: Person[];
  effectiveAbsentIds: string[];
  setAbsentIds: (ids: string[]) => void;
  registerReady: boolean;
  absence: AbsenceImpact | null;
  setSelectedId: (id: string) => void;
  absenceStepTracked: StepTrack;
  logAbsenceAction: LogStep;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserMinus className="size-4 text-muted" />
          If someone is out tomorrow
        </CardTitle>
        <CardDescription>
          Sick, on leave, or gone. What stops, who picks it up, and what to do first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <fieldset className="flex flex-col gap-1 text-xs text-muted">
          <legend>Who is out (tick everyone)</legend>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={effectiveAbsentIds.includes(p.id)}
                  aria-label={p.name}
                  onChange={() => {
                    if (effectiveAbsentIds.includes(p.id)) {
                      if (effectiveAbsentIds.length === 1) return;
                      setAbsentIds(effectiveAbsentIds.filter((id) => id !== p.id));
                    } else {
                      setAbsentIds([...effectiveAbsentIds, p.id]);
                    }
                  }}
                />
                {p.name} · {p.role}
              </label>
            ))}
          </div>
        </fieldset>
        {!registerReady ? (
          <p className="text-muted">{NOT_ASSESSED_ABSENCE}</p>
        ) : absence ? (
          <>
            {absence.people.length > 1 && (
              <p className="text-xs font-medium text-muted">
                If {naturalNames(absence.people.map((p) => firstName(p.name)))} are all out:
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  absence.dependence >= 50 ? "danger" : absence.dependence >= 25 ? "warn" : "ok"
                }
              >
                {absence.dependence}% of must-do work stops
              </Badge>
              <span className="text-xs text-muted">
                {absence.stops.length} stop · {absence.continues.length} continue
                {absence.orphanedProcesses.length > 0 &&
                  ` · ${absence.orphanedProcesses.length} process${absence.orphanedProcesses.length === 1 ? "" : "es"} without an owner`}
              </span>
            </div>
            {absence.stops.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Stops on day one
                </div>
                <ul className="space-y-1.5">
                  {absence.stops.map((s) => (
                    <li
                      key={s.item.id}
                      className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 hover:bg-elevated/60"
                      onClick={() => setSelectedId(s.item.id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.item.name}</span>
                        <Badge variant={s.item.criticality === "critical" ? "danger" : "default"}>
                          {CRITICALITY_LABEL[s.item.criticality]}
                        </Badge>
                        <span className="text-xs text-muted">
                          → {s.standIn ? s.standIn.name : "nobody"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{s.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <AlreadyStopped items={absence.alreadyStopped} onSelect={setSelectedId} />
            {absence.continues.length > 0 && (
              <PeopleLine label="Keeps running" people={absence.continues.map((k) => k.name)} />
            )}
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Contingency steps
              </div>
              <ol className="list-decimal space-y-1 pl-5">
                {absence.actions.map((a) => (
                  <li key={a.text}>
                    {a.text}
                    {a.knowledgeIds.length > 0 &&
                      (absenceStepTracked(a) ? (
                        <span className="ml-2 text-xs text-subtle">
                          In the Journal · review by {absenceStepTracked(a)}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-1 h-6 px-1.5 text-xs"
                          onClick={() => logAbsenceAction(a)}
                        >
                          <BookOpen className="size-3.5" /> Log as decision
                        </Button>
                      ))}
                  </li>
                ))}
              </ol>
            </div>
          </>
        ) : (
          <p className="text-muted">Add people to the team to simulate an absence.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function PlannedLeaveCard({
  people,
  outTodayIds,
  markOutToday,
  leavePersonId,
  setLeavePersonId,
  leaveFrom,
  setLeaveFrom,
  leaveTo,
  setLeaveTo,
  leaveFormValid,
  addLeave,
  leave,
  leaveHistory,
  debriefs,
  debriefed,
  debriefKey,
  promoteStandIn,
  keepTraining,
  closeDebriefItem,
  markDebriefed,
  today,
  registerReady,
  removeLeave,
  stillOutTomorrow,
  backAtWork,
  setSelectedId,
  absenceStepTracked,
  logAbsenceAction,
  showPastLeave,
  setShowPastLeave,
  tpl,
}: {
  people: Person[];
  outTodayIds: Set<string>;
  markOutToday: (person: Person) => void;
  leavePersonId: string;
  setLeavePersonId: (id: string) => void;
  leaveFrom: string;
  setLeaveFrom: (value: string) => void;
  leaveTo: string;
  setLeaveTo: (value: string) => void;
  leaveFormValid: boolean;
  addLeave: () => void;
  leave: PlannedAbsenceReport;
  leaveHistory: PlannedAbsence[];
  debriefs: LeaveDebrief[];
  debriefed: Set<string>;
  debriefKey: (absenceId: string, knowledgeId: string) => string;
  promoteStandIn: (debrief: LeaveDebrief, entry: DebriefItem, standIn: Person) => void;
  keepTraining: (debrief: LeaveDebrief, entry: DebriefItem, standIn: Person) => void;
  closeDebriefItem: (debrief: LeaveDebrief, entry: DebriefItem) => void;
  markDebriefed: (absenceId: string) => void;
  today: string;
  registerReady: boolean;
  removeLeave: (id: string) => void;
  stillOutTomorrow: (window: PlannedAbsenceReport["windows"][number]) => void;
  backAtWork: (window: PlannedAbsenceReport["windows"][number]) => void;
  setSelectedId: (id: string) => void;
  absenceStepTracked: StepTrack;
  logAbsenceAction: LogStep;
  showPastLeave: boolean;
  setShowPastLeave: Dispatch<SetStateAction<boolean>>;
  tpl: IndustryTemplate;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted" />
          Out today and planned leave
        </CardTitle>
        <CardDescription>
          Someone called in sick? Press their name and today&apos;s cover sheet appears: what stops,
          who steps in, where the procedure lives. Known absences — holidays, parental leave,
          surgery — go in the form. Overlapping absences are flagged, and once anyone is back a
          debrief asks whether the stand-in can now run it alone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {people.length === 0 ? (
          <p className="text-muted">Add people to the team to record leave.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Out today:</span>
            {people.map((p) => {
              const out = outTodayIds.has(p.id);
              return (
                <Button
                  key={p.id}
                  size="sm"
                  variant={out ? "secondary" : "outline"}
                  className="h-7 px-2 text-xs"
                  disabled={out}
                  aria-label={out ? `${p.name} is already out today` : `${p.name} out today`}
                  onClick={() => markOutToday(p)}
                >
                  <UserMinus className="size-3.5" /> {firstName(p.name)}
                  {out ? " · out" : ""}
                </Button>
              );
            })}
          </div>
        )}
        {people.length > 0 && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addLeave();
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-muted">
              Who
              <select
                className={inputClass}
                value={leavePersonId}
                onChange={(e) => setLeavePersonId(e.target.value)}
              >
                <option value="">Choose…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              First day out
              <input
                type="date"
                className={inputClass}
                value={leaveFrom}
                onChange={(e) => setLeaveFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Last day out
              <input
                type="date"
                className={inputClass}
                value={leaveTo}
                min={leaveFrom || undefined}
                onChange={(e) => setLeaveTo(e.target.value)}
              />
            </label>
            <Button type="submit" size="sm" disabled={!leaveFormValid}>
              <Plus className="size-4" /> Add leave
            </Button>
          </form>
        )}
        {leave.windows.length === 0 && leaveHistory.length === 0 && people.length > 0 && (
          <p className="text-xs text-muted">
            Nobody is out or has leave booked. Add known absences and the weekly plan, printed
            report and Pioneer will warn ahead of each one; press a name above the day someone calls
            in sick.
          </p>
        )}
        {debriefs.map((d) => (
          <LeaveDebriefCard
            key={d.absence.id}
            debrief={d}
            people={people}
            answered={(e) => debriefed.has(debriefKey(d.absence.id, e.item.id))}
            onPromote={(e, s) => promoteStandIn(d, e, s)}
            onKeepTraining={(e, s) => keepTraining(d, e, s)}
            onClose={(e) => closeDebriefItem(d, e)}
            onDismiss={() => {
              markDebriefed(d.absence.id);
              toast.success("Absence closed without register changes.");
            }}
          />
        ))}
        {leave.windows.map((w) => (
          <LeaveWindow
            key={w.absence.id}
            window={w}
            today={today}
            assessed={registerReady}
            onRemove={() => removeLeave(w.absence.id)}
            onExtend={() => stillOutTomorrow(w)}
            onBack={() => backAtWork(w)}
            onSelect={setSelectedId}
            tracked={(a) => absenceStepTracked(a, w.absence.id)}
            onLog={(a) => logAbsenceAction(a, handoffDeadline(w, today), w.absence.id)}
          />
        ))}
        {leaveHistory.length > 0 && (
          <div className="text-xs text-muted">
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => setShowPastLeave((v) => !v)}
            >
              {showPastLeave ? "Hide" : "Show"} {leaveHistory.length} past or unmatched{" "}
              {leaveHistory.length === 1 ? "entry" : "entries"}
            </button>
            {showPastLeave && (
              <ul className="mt-1 space-y-1">
                {leaveHistory.map((a) => {
                  const person = tpl.people.find((p) => p.id === a.personId);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span>
                        {person?.name ?? "Someone no longer on the team"} ·{" "}
                        {formatDateRange(a.from, a.to)}
                        {!person || !person.active ? " · not on the active team" : ""}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5"
                        aria-label="Remove leave"
                        onClick={() => removeLeave(a.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LeavingTeamCard({
  staying,
  leaverPersonId,
  setLeaverPersonId,
  leaverLastDay,
  setLeaverLastDay,
  leaverFormValid,
  recordLastDay,
  leaving,
  today,
  registerReady,
  setSelectedId,
  changeLastDay,
  cancelLeaving,
  markAsLeft,
  absenceStepTracked,
  logAbsenceAction,
}: {
  staying: Person[];
  leaverPersonId: string;
  setLeaverPersonId: (id: string) => void;
  leaverLastDay: string;
  setLeaverLastDay: (value: string) => void;
  leaverFormValid: boolean;
  recordLastDay: () => void;
  leaving: Leaver[];
  today: string;
  registerReady: boolean;
  setSelectedId: (id: string) => void;
  changeLastDay: (leaver: Leaver, lastDay: string) => void;
  cancelLeaving: (leaver: Leaver) => void;
  markAsLeft: (leaver: Leaver) => void;
  absenceStepTracked: StepTrack;
  logAbsenceAction: LogStep;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="size-4 text-muted" />
          Leaving the team
        </CardTitle>
        <CardDescription>
          Someone has given notice? Record their last day. They keep counting as cover until then,
          and the hand-over below lists everything only they can run, who to train and what to write
          down &mdash; each step due before they go.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <LeaverAccessList />
        {staying.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Who
              <select
                className={inputClass}
                value={leaverPersonId}
                onChange={(e) => setLeaverPersonId(e.target.value)}
                aria-label="Who is leaving"
              >
                <option value="">Choose…</option>
                {staying.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Last working day
              <input
                type="date"
                className={inputClass}
                value={leaverLastDay}
                onChange={(e) => setLeaverLastDay(e.target.value)}
                aria-label="Last working day"
              />
            </label>
            <Button size="sm" disabled={!leaverFormValid} onClick={recordLastDay}>
              <Plus className="size-3.5" /> Record last day
            </Button>
          </div>
        )}
        {leaving.length === 0 && (
          <p className="text-xs text-muted">
            Nobody has given notice. When someone does, record the date here rather than removing
            them &mdash; the weekly plan, printed report and Pioneer will count down to it and chase
            the hand-over.
          </p>
        )}
        {leaving.map((l) => (
          <LeaverCard
            key={l.person.id}
            leaver={l}
            today={today}
            assessed={registerReady}
            onSelect={setSelectedId}
            onChangeDate={(d) => changeLastDay(l, d)}
            onCancel={() => cancelLeaving(l)}
            onMarkLeft={() => markAsLeft(l)}
            tracked={(a) => absenceStepTracked(a)}
            onLog={(a) => logAbsenceAction(a, handoverDeadline(l, today))}
          />
        ))}
      </CardContent>
    </Card>
  );
}

export function DependenceCard({
  registerReady,
  report,
}: {
  registerReady: boolean;
  report: CoverageReport;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who the business leans on</CardTitle>
        <CardDescription>
          Share of must-do work that stops if each person is out — the app's own index, in which a
          critical item counts three, an important item two, and a can-wait item nothing. Spread the
          top names' sole items to bring these down.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!registerReady && <p className="text-sm text-muted">{NOT_ASSESSED_ABSENCE}</p>}
        {registerReady &&
          report.people
            .filter((l) => l.person.active)
            .map((l) => (
              <div key={l.person.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{l.person.name}</span>
                  <span className="text-xs text-muted">
                    {l.soleItems.length} sole · {l.sharedItems.length} shared ·{" "}
                    {l.learningItems.length} learning
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-elevated">
                  <div
                    className={cn(
                      "h-full rounded",
                      l.dependence >= 50 ? "bg-danger" : l.dependence >= 25 ? "bg-warn" : "bg-ok",
                    )}
                    style={{ width: `${Math.max(2, l.dependence)}%` }}
                  />
                </div>
                {l.soleItems.length > 0 && (
                  <div className="mt-1 text-xs text-muted">
                    Only they can do: {l.soleItems.map((k) => k.name).join(", ")}
                  </div>
                )}
              </div>
            ))}
      </CardContent>
    </Card>
  );
}
