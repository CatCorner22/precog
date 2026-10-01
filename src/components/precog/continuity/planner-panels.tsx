import { CalendarDays, LogOut, Plus, Trash2, UserMinus } from "lucide-react";
import { LeaverAccessList } from "@/components/precog/leaver-access";
import {
  LeaveDebriefCard,
  LeaverCard,
  LeaveWindow,
} from "@/components/precog/continuity/leave-cards";
import {
  AlreadyStopped,
  ItemButton,
  JournalStepStatus,
  PeopleLine,
} from "@/components/precog/continuity/parts";
import type {
  JournalSteps,
  LeavePlanner,
  LeavingPlanner,
  WhatIf,
} from "@/components/precog/continuity/use-continuity-planner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type CoverageReport } from "@/lib/precog/continuity/coverage";
import { handoverDeadline } from "@/lib/precog/continuity/leavers";
import { CRITICALITY_LABEL, NOT_ASSESSED_ABSENCE } from "@/lib/precog/continuity/planner-copy";
import { inputClass } from "./styles";
import { handoffDeadline } from "@/lib/precog/continuity/planned-absence";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import { joinWithAnd, firstName } from "@/lib/precog/text";
import type { Person } from "@/lib/precog/types";
import { cn } from "@/lib/utils";
import { formatDayRange } from "@/lib/precog/dates";

/** What-if: tick who is out and see what stops, who picks it up, and what to do first. */
export function OutTomorrowCard({
  whatIf,
  people,
  registerAssessed,
  journal,
  onSelect,
}: {
  whatIf: WhatIf;
  people: Person[];
  registerAssessed: boolean;
  journal: JournalSteps;
  onSelect: (knowledgeId: string) => void;
}) {
  const { absentIds, absence, startedWith } = whatIf;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserMinus className="size-4 text-muted" />
          If someone is out tomorrow
        </CardTitle>
        <CardDescription>
          Sick, on leave, or leaving. What stops, who picks it up, and what to do first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <fieldset className="flex flex-col gap-1 text-xs text-muted">
          <legend>
            {startedWith
              ? `Starting with ${firstName(startedWith.name)}, who the business leans on most. Tick everyone who is out:`
              : "Who is out (tick everyone):"}
          </legend>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={absentIds.includes(p.id)}
                  aria-label={p.name}
                  onChange={() => whatIf.toggle(p.id)}
                />
                {p.name} · {p.role}
              </label>
            ))}
          </div>
        </fieldset>
        {!registerAssessed ? (
          <p className="text-muted">{NOT_ASSESSED_ABSENCE}</p>
        ) : people.length > 0 && absentIds.length === 0 ? (
          <p className="text-muted">Tick someone to see what stops.</p>
        ) : absence ? (
          <>
            {absence.people.length > 1 && (
              <p className="text-xs font-medium text-muted">
                If {joinWithAnd(absence.people.map((p) => firstName(p.name)))} are all out:
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
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{s.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <AlreadyStopped items={absence.alreadyStopped} onSelect={onSelect} />
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
                    {a.knowledgeIds.length > 0 && (
                      <JournalStepStatus
                        inline
                        commitment={journal.stepTracked(a)}
                        onLog={() => journal.logAbsenceAction(a)}
                      />
                    )}
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

/** Out today and known leave: the cover sheet for each absence and the debrief once someone is back. */
export function PlannedLeaveCard({
  leave,
  people,
  tpl,
  today,
  journal,
  onSelect,
}: {
  leave: LeavePlanner;
  people: Person[];
  tpl: IndustryTemplate;
  today: string;
  journal: JournalSteps;
  onSelect: (knowledgeId: string) => void;
}) {
  const leaveHistory = leave.history;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted" />
          Out today and planned leave
        </CardTitle>
        <CardDescription>
          Someone called in sick? Press their name and today&apos;s stand-in sheet appears: what
          stops, who steps in, where the procedure lives. Known absences — holidays, parental leave,
          surgery — go in the form. Precog flags overlapping absences, and once anyone is back a
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
              const out = leave.outTodayIds.has(p.id);
              return (
                <Button
                  key={p.id}
                  size="sm"
                  variant={out ? "secondary" : "outline"}
                  className="h-7 px-2 text-xs"
                  disabled={out}
                  aria-label={out ? `${p.name} is already out today` : `${p.name} out today`}
                  onClick={() => leave.markOutToday(p)}
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
              leave.add();
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-muted">
              Who
              <select
                className={inputClass}
                value={leave.personId}
                onChange={(e) => leave.setPersonId(e.target.value)}
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
                value={leave.from}
                onChange={(e) => leave.setFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Last day out
              <input
                type="date"
                className={inputClass}
                value={leave.to}
                min={leave.from || undefined}
                onChange={(e) => leave.setTo(e.target.value)}
              />
            </label>
            <Button type="submit" size="sm" disabled={!leave.formValid}>
              <Plus className="size-4" /> Add leave
            </Button>
          </form>
        )}
        {leave.report.windows.length === 0 && leaveHistory.length === 0 && people.length > 0 && (
          <p className="text-xs text-muted">
            Nobody is out and nobody has booked leave. Add leave you know about, and the weekly
            plan, the printed report and Pioneer will warn before it starts. The day someone calls
            in sick, press their name above.
          </p>
        )}
        {leave.debriefs.map((d) => (
          <LeaveDebriefCard
            key={d.absence.id}
            debrief={d}
            people={people}
            answered={(e) => leave.answered(d, e)}
            conflictsFor={leave.conflictsFor}
            onPromote={(e, s) => leave.promoteStandIn(d, e, s)}
            onKeepTraining={(e, s) => leave.keepTraining(d, e, s)}
            onClose={(e) => leave.closeDebriefItem(d, e)}
            onDismiss={() => leave.dismissDebrief(d.absence.id)}
          />
        ))}
        {leave.report.windows.map((w) => (
          <LeaveWindow
            key={w.absence.id}
            window={w}
            today={today}
            onRemove={() => leave.remove(w.absence.id)}
            onExtend={() => leave.stillOutTomorrow(w)}
            onBack={() => leave.backAtWork(w)}
            onSelect={onSelect}
            tracked={(a) => journal.stepTracked(a, w.absence.id)}
            onLog={(a) => journal.logAbsenceAction(a, handoffDeadline(w, today), w.absence.id)}
          />
        ))}
        {leaveHistory.length > 0 && (
          <div className="text-xs text-muted">
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => leave.setShowPast((v) => !v)}
            >
              {leave.showPast ? "Hide" : "Show"} {leaveHistory.length} past or unmatched{" "}
              {leaveHistory.length === 1 ? "entry" : "entries"}
            </button>
            {leave.showPast && (
              <ul className="mt-1 space-y-1">
                {leaveHistory.map((a) => {
                  const person = tpl.people.find((p) => p.id === a.personId);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span>
                        {person?.name ?? "Someone no longer on the team"} ·{" "}
                        {formatDayRange(a.from, a.to)}
                        {!person || !person.active ? " · not on the active team" : ""}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5"
                        aria-label="Remove leave"
                        onClick={() => leave.remove(a.id)}
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

/** People who have given notice: their last day, the hand-off, and who picks up what. */
export function LeavingTeamCard({
  leaving,
  today,
  journal,
  onSelect,
}: {
  leaving: LeavingPlanner;
  today: string;
  journal: JournalSteps;
  onSelect: (knowledgeId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="size-4 text-muted" />
          Leaving the team
        </CardTitle>
        <CardDescription>
          Someone has given notice? Record their last day. They keep counting as a stand-in until
          then, and the hand-off below lists everything only they can run, who to train and what to
          write down &mdash; each step due before they go.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <LeaverAccessList explainOnSample />
        {leaving.staying.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Who
              <select
                className={inputClass}
                value={leaving.personId}
                onChange={(e) => leaving.setPersonId(e.target.value)}
                aria-label="Who is leaving"
              >
                <option value="">Choose…</option>
                {leaving.staying.map((p) => (
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
                value={leaving.lastDay}
                onChange={(e) => leaving.setLastDay(e.target.value)}
                aria-label="Last working day"
              />
            </label>
            <Button size="sm" disabled={!leaving.formValid} onClick={leaving.recordLastDay}>
              <Plus className="size-3.5" /> Record last day
            </Button>
          </div>
        )}
        {leaving.list.length === 0 && (
          <p className="text-xs text-muted">
            Nobody has given notice. When someone does, record the date here rather than removing
            them &mdash; the weekly plan, printed report and Pioneer will count down to it and chase
            the hand-off.
          </p>
        )}
        {leaving.list.map((l) => (
          <LeaverCard
            key={l.person.id}
            leaver={l}
            today={today}
            onSelect={onSelect}
            onChangeDate={(d) => leaving.changeLastDay(l, d)}
            onCancel={() => leaving.cancelLeaving(l)}
            onMarkLeft={() => leaving.markAsLeft(l)}
            tracked={(a) => journal.stepTracked(a)}
            onLog={(a) => journal.logAbsenceAction(a, handoverDeadline(l, today))}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/** Each active person's share of must-do work that stops without them. */
export function DependenceCard({
  registerAssessed,
  report,
}: {
  registerAssessed: boolean;
  report: CoverageReport;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who the business leans on</CardTitle>
        <CardDescription>
          Share of must-do work that stops if each person is out — Precog&apos;s own index, in which
          an item the business stops without counts three, one that hurts within a week counts two,
          and one that can wait counts nothing. Spread the top names&apos; sole items to bring these
          down.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!registerAssessed && <p className="text-sm text-muted">{NOT_ASSESSED_ABSENCE}</p>}
        {registerAssessed &&
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
