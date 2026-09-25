import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import {
  collectDueItems,
  dayKey,
  groupByDay,
  summarizeDue,
  type DueItem,
} from "@/lib/precog/builder/due";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
} from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

function statusTone(s: DueItem["status"]) {
  if (s === "overdue") return "danger" as const;
  if (s === "today" || s === "this_week") return "warn" as const;
  if (s === "unscheduled") return "default" as const;
  return "primary" as const;
}

function dueLabel(i: DueItem) {
  if (i.status === "unscheduled") return i.kind === "evidence" ? "never recorded" : "";
  if (i.daysLeft === null) return "";
  if (i.daysLeft < 0) return `overdue ${Math.abs(i.daysLeft)}d`;
  if (i.daysLeft === 0) return "today";
  if (i.daysLeft === 1) return "tomorrow";
  return `in ${i.daysLeft}d`;
}

/**
 * Dashboard card: what control work is due this week, with a 6-week calendar toggle.
 * Evidence "Done" marks the item complete straight from here.
 */
export function ControlCalendarCard({
  onOpenProcess,
  onOpenJournal,
  onOpenBuilder,
}: {
  onOpenProcess: (processId: string) => void;
  onOpenJournal: () => void;
  onOpenBuilder: () => void;
}) {
  const { profile, setCustomProcesses } = usePractice();
  const tpl = useTemplate();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Due items read only the decisions, map versions and custom map fields.
  const { decisions, mapVersions, customProcesses, customPeople } = profile;
  const { items, summary } = useMemo(() => {
    const due = collectDueItems(tpl.processes, tpl.people, profile);
    return { items: due, summary: summarizeDue(due) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the fields collectDueItems reads
  }, [tpl.processes, tpl.people, decisions, mapVersions, customProcesses, customPeople]);
  const byDay = useMemo(() => groupByDay(items), [items]);

  const actionable = items.filter((i) => i.status !== "later");
  const hasEvidence = tpl.processes.some((p) => (p.evidence ?? []).length > 0);

  function markDone(i: DueItem) {
    if (!i.processId || !i.evidenceId) return;
    setCustomProcesses((cur) =>
      cur.map((p) =>
        p.id === i.processId
          ? {
              ...p,
              evidence: (p.evidence ?? []).map((e) =>
                e.id === i.evidenceId ? { ...e, lastDoneAt: new Date().toISOString() } : e,
              ),
            }
          : p,
      ),
    );
  }

  const weeks = useMemo(() => {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        return day;
      }),
    );
  }, [weekOffset]);
  const todayKey = dayKey(new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" />
              Control calendar
            </CardTitle>
            <CardDescription>
              Evidence reviews, journal re-reviews, and map hygiene — what's due and when.
            </CardDescription>
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "px-2.5 py-1",
                view === "list" ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn(
                "border-l border-border px-2.5 py-1",
                view === "calendar" ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              Calendar
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summary.overdue > 0 && <Badge variant="danger">{summary.overdue} overdue</Badge>}
          {summary.today > 0 && <Badge variant="warn">{summary.today} today</Badge>}
          {summary.thisWeek > 0 && <Badge variant="warn">{summary.thisWeek} this week</Badge>}
          {summary.unscheduled > 0 && (
            <Badge variant="default">{summary.unscheduled} unscheduled</Badge>
          )}
          {summary.later > 0 && <Badge variant="primary">{summary.later} later</Badge>}
          {items.length === 0 && <Badge variant="ok">Nothing scheduled</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {view === "list" ? (
          actionable.length === 0 ? (
            <div className="space-y-2 text-sm text-muted">
              <p className="flex items-center gap-2 text-ok">
                <CheckCircle2 className="size-4" />
                {hasEvidence
                  ? "Nothing due this week. Next items show up in the calendar."
                  : "No evidence scheduled yet."}
              </p>
              {!hasEvidence && (
                <p>
                  Add evidence to your processes — the reviews that prove controls run — and this
                  card becomes your weekly checklist.
                </p>
              )}
              <Button size="sm" variant="secondary" onClick={onOpenBuilder}>
                <ClipboardList className="size-3.5" /> Open map builder
              </Button>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {actionable.slice(0, 8).map((i) => (
                <DueRow
                  key={i.id}
                  item={i}
                  onOpen={() => {
                    if (i.kind === "decision") onOpenJournal();
                    else if (i.kind === "snapshot") onOpenBuilder();
                    else if (i.processId) onOpenProcess(i.processId);
                  }}
                  onDone={i.kind === "evidence" ? () => markDone(i) : undefined}
                />
              ))}
              {actionable.length > 8 && (
                <li className="text-xs text-subtle">
                  +{actionable.length - 8} more in the calendar
                </li>
              )}
            </ul>
          )
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 6)}
                className="rounded p-1 hover:bg-elevated"
                aria-label="Earlier"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span>
                {weeks[0][0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
                {weeks[5][6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="ml-2 text-primary hover:underline"
                  >
                    today
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w + 6)}
                className="rounded p-1 hover:bg-elevated"
                aria-label="Later"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-xs text-subtle">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weeks.flat().map((day) => {
                const k = dayKey(day);
                const dayItems = byDay.get(k) ?? [];
                const isToday = k === todayKey;
                const past = day.getTime() < new Date(todayKey).getTime() && !isToday;
                const worst = dayItems.some((i) => i.status === "overdue")
                  ? "danger"
                  : dayItems.some((i) => i.status === "today" || i.status === "this_week")
                    ? "warn"
                    : dayItems.length
                      ? "primary"
                      : null;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedDay(selectedDay === k ? null : k)}
                    className={cn(
                      "flex h-12 flex-col items-center justify-between rounded-md border p-1 text-xs transition-colors",
                      selectedDay === k
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-elevated hover:border-border-strong",
                      isToday && "ring-1 ring-primary/50",
                      past && !dayItems.length && "opacity-50",
                    )}
                    aria-label={`${day.toDateString()}${dayItems.length ? `, ${dayItems.length} item(s)` : ""}`}
                  >
                    <span
                      className={cn(
                        "tabular",
                        isToday ? "font-semibold text-primary" : "text-muted",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {dayItems.length > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-xs font-semibold tabular",
                          worst === "danger" && "bg-danger/20 text-danger",
                          worst === "warn" && "bg-warn/20 text-warn",
                          worst === "primary" && "bg-primary/20 text-primary",
                        )}
                      >
                        {dayItems.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedDay && (
              <ul className="space-y-1.5 border-t border-border pt-2">
                {(byDay.get(selectedDay) ?? []).length === 0 ? (
                  <li className="text-xs text-subtle">Nothing due on this day.</li>
                ) : (
                  (byDay.get(selectedDay) ?? []).map((i) => (
                    <DueRow
                      key={i.id}
                      item={i}
                      onOpen={() => {
                        if (i.kind === "decision") onOpenJournal();
                        else if (i.processId) onOpenProcess(i.processId);
                      }}
                      onDone={i.kind === "evidence" ? () => markDone(i) : undefined}
                    />
                  ))
                )}
              </ul>
            )}
            {summary.unscheduled > 0 && (
              <p className="text-xs text-subtle">
                {summary.unscheduled} item(s) have never been recorded and so have no date — open
                them from &ldquo;This week&rdquo; and mark the first review done to start the
                cadence.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DueRow({
  item,
  onOpen,
  onDone,
}: {
  item: DueItem;
  onOpen: () => void;
  onDone?: () => void;
}) {
  const Icon = item.kind === "decision" ? BookOpen : item.kind === "snapshot" ? Camera : Clock;
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
        item.status === "overdue"
          ? "border-danger/40 bg-danger/10"
          : item.status === "today" || item.status === "this_week"
            ? "border-warn/40 bg-warn/5"
            : "border-border bg-elevated",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-fg">{item.title}</span>
          {dueLabel(item) && <Badge variant={statusTone(item.status)}>{dueLabel(item)}</Badge>}
        </span>
        <span className="mt-0.5 block text-muted">{item.detail}</span>
      </button>
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-fg hover:border-ok/50 hover:text-ok"
          title="Record this review as completed today"
        >
          Done
        </button>
      )}
    </li>
  );
}
