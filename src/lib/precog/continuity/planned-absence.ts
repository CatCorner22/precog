import type { IndustryId } from "../industry";
import type { PlannedAbsence } from "../practice-profile";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { absenceImpact, daysBetween, isCalendarDate, type AbsenceImpact } from "./coverage";

/** How far ahead the weekly plan, report and Pioneer start warning about known leave. */
export const ABSENCE_LEAD_DAYS = 30;

export interface AbsenceOverlap {
  absence: PlannedAbsence;
  person: Person;
  /** First and last shared day, inclusive. */
  from: string;
  to: string;
}

export interface AbsenceWindow {
  absence: PlannedAbsence;
  person: Person;
  /** Days until the first day away; 0 once it has started. */
  daysUntil: number;
  /** Days away including both ends. */
  lengthDays: number;
  status: "current" | "upcoming";
  /** Other planned leave sharing at least one day with this one. */
  overlaps: AbsenceOverlap[];
  /**
   * What stops with everyone whose leave overlaps this one away at once — the
   * worst day of the window, not an average of it.
   */
  impact: AbsenceImpact;
}

export interface PlannedAbsenceReport {
  /** Leave that has started or is still to come, soonest first. */
  windows: AbsenceWindow[];
  /** Entries whose last day is before today. */
  past: PlannedAbsence[];
  /** Entries for people no longer on the active team (or another industry's register). */
  unmatched: PlannedAbsence[];
}

function activePerson(tpl: IndustryTemplate, id: string): Person | undefined {
  return tpl.people.find((p) => p.active && p.id === id);
}

function overlapsWith(a: PlannedAbsence, b: PlannedAbsence): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/**
 * Known leave laid over the register: for each absence that has not ended,
 * what stops while that person — and anyone whose leave overlaps — is away,
 * and how many days the owner has left to hand things off.
 */
export function plannedAbsenceReport(
  tpl: IndustryTemplate,
  absences: readonly PlannedAbsence[],
  industry: IndustryId,
  today: string,
): PlannedAbsenceReport {
  const scoped = absences.filter((a) => a.industry === industry);
  const unmatched = scoped.filter((a) => !activePerson(tpl, a.personId));
  const matched = scoped.filter((a) => activePerson(tpl, a.personId));
  const validToday = isCalendarDate(today);
  const past = validToday ? matched.filter((a) => a.to < today) : [];
  const live = validToday ? matched.filter((a) => a.to >= today) : [];

  const windows: AbsenceWindow[] = [];
  for (const absence of live) {
    const person = activePerson(tpl, absence.personId);
    if (!person) continue;
    const overlaps: AbsenceOverlap[] = [];
    for (const other of live) {
      if (other.id === absence.id || other.personId === absence.personId) continue;
      if (!overlapsWith(absence, other)) continue;
      const otherPerson = activePerson(tpl, other.personId);
      if (!otherPerson) continue;
      overlaps.push({
        absence: other,
        person: otherPerson,
        from: absence.from > other.from ? absence.from : other.from,
        to: absence.to < other.to ? absence.to : other.to,
      });
    }
    overlaps.sort(
      (a, b) => a.from.localeCompare(b.from) || a.person.name.localeCompare(b.person.name),
    );
    const away = [person.id, ...new Set(overlaps.map((o) => o.person.id))];
    const impact = absenceImpact(tpl, away);
    if (!impact) continue;
    const daysUntil = Math.max(0, daysBetween(today, absence.from) ?? 0);
    windows.push({
      absence,
      person,
      daysUntil,
      lengthDays: (daysBetween(absence.from, absence.to) ?? 0) + 1,
      status: absence.from <= today ? "current" : "upcoming",
      overlaps,
      impact,
    });
  }
  windows.sort(
    (a, b) =>
      a.absence.from.localeCompare(b.absence.from) ||
      a.absence.to.localeCompare(b.absence.to) ||
      a.person.name.localeCompare(b.person.name),
  );
  return { windows, past, unmatched };
}

/** Windows the owner should be acting on now: started, or starting within the lead time. */
export function absencesNeedingAttention(
  windows: readonly AbsenceWindow[],
  leadDays = ABSENCE_LEAD_DAYS,
): AbsenceWindow[] {
  return windows.filter((w) => w.daysUntil <= leadDays);
}

const RANGE_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const RANGE_DAY_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "3–10 Nov", "28 Oct – 3 Nov", or "30 Dec 2025 – 2 Jan 2026" when the range crosses a year. */
export function formatDateRange(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${from} – ${to}`;
  if (from === to) return RANGE_DAY.format(start);
  if (from.slice(0, 4) !== to.slice(0, 4)) {
    return `${RANGE_DAY_YEAR.format(start)} – ${RANGE_DAY_YEAR.format(end)}`;
  }
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${start.getUTCDate()}–${RANGE_DAY.format(end)}`;
  }
  return `${RANGE_DAY.format(start)} – ${RANGE_DAY.format(end)}`;
}

/** "out now", "tomorrow", "in 12 days". */
export function leadLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "out now";
  if (daysUntil === 1) return "tomorrow";
  return `in ${daysUntil} days`;
}

/** The day to have hand-offs done by: the day before leave starts, or today once it is imminent or under way. */
export function handoffDeadline(window: AbsenceWindow, today: string): string {
  if (window.daysUntil <= 1) return today;
  const day = new Date(`${window.absence.from}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/** One line an advisor can say about a window: who, when, and the first thing that stops. */
export function describeWindow(w: AbsenceWindow): string {
  const first = w.person.name.split(" ")[0];
  const when = `${formatDateRange(w.absence.from, w.absence.to)}, ${leadLabel(w.daysUntil)}`;
  const overlap = w.overlaps.length
    ? ` (${w.overlaps
        .map((o) => `${o.person.name.split(" ")[0]} also out ${formatDateRange(o.from, o.to)}`)
        .join("; ")})`
    : "";
  const stops = w.impact.stops;
  if (stops.length === 0 && w.impact.orphanedProcesses.length === 0) {
    return `${first} is out ${when}${overlap}: nothing stops.`;
  }
  const critical = stops.filter((s) => s.item.criticality === "critical");
  const lead = (critical.length ? critical : stops).slice(0, 2);
  const detail = lead
    .map((s) =>
      s.standIn
        ? `${s.item.name} — hand off to ${s.standIn.name.split(" ")[0]}`
        : `${s.item.name} has no one`,
    )
    .join("; ");
  const more = stops.length - lead.length;
  const processes = w.impact.orphanedProcesses.length
    ? `${detail ? "; " : ""}${w.impact.orphanedProcesses.length} process${w.impact.orphanedProcesses.length === 1 ? "" : "es"} without an owner`
    : "";
  return `${first} is out ${when}${overlap}: ${detail}${more > 0 ? ` and ${more} more` : ""}${processes}.`;
}
