import type { IndustryId } from "../industry";
import type { PlannedAbsence } from "../practice-profile";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, Person } from "../types";
import {
  absenceImpact,
  daysBetween,
  firstName,
  isCalendarDate,
  type AbsenceImpact,
  type AbsenceStop,
} from "./coverage";

/** How far ahead the weekly plan, report and Pioneer start warning about known leave. */
export const ABSENCE_LEAD_DAYS = 30;

export interface AbsenceOverlap {
  absence: PlannedAbsence;
  person: Person;
  /** First and last shared day, inclusive. */
  from: string;
  to: string;
}

/** The stretch of a leave window with the most work stopped, and who is away during it. */
export interface AbsencePeak {
  from: string;
  to: string;
  /** Everyone away on those days: the person on leave plus anyone overlapping then. */
  people: Person[];
  /** Register entries that stop only because of the overlapping leave; empty when this person alone stops them all. */
  extraStops: KnowledgeItem[];
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
   * What stops on the worst stretch of the window — the days when the most
   * people are away together — not an average of it. Overlaps that never
   * share a day are never combined.
   */
  impact: AbsenceImpact;
  /** The stretch `impact` describes. Spans the whole window when nobody's leave overlaps. */
  peak: AbsencePeak;
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

export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** An absence recorded the day it happened: today only, extendable day by day while the person stays out. */
export function unplannedAbsenceToday(
  id: string,
  personId: string,
  industry: IndustryId,
  today: string,
): PlannedAbsence {
  return { id, personId, industry, from: today, to: today, unplanned: true };
}

/** "Still out tomorrow": the absence now runs one day past today or its current last day, whichever is later. */
export function extendAbsence(absence: PlannedAbsence, today: string): PlannedAbsence {
  const last = absence.to > today ? absence.to : today;
  return { ...absence, to: shiftDay(last, 1) };
}

/**
 * "Back at work": the absence ended yesterday, so the debrief can ask about it
 * today. Null when it had not started before today — there was nothing to cover,
 * so the entry should simply be removed.
 */
export function endAbsence(absence: PlannedAbsence, today: string): PlannedAbsence | null {
  if (absence.from >= today) return null;
  const yesterday = shiftDay(today, -1);
  return { ...absence, to: absence.to < yesterday ? absence.to : yesterday };
}

/** "is out", or "is out unexpectedly" when the absence was recorded on the day rather than planned. */
export function outPhrase(absence: PlannedAbsence): string {
  return absence.unplanned ? "is out unexpectedly" : "is out";
}

/**
 * Where the stand-in finds the written procedure for a stopped entry — the one
 * thing worth telling them on the morning someone calls in sick.
 */
export function procedurePointer(stop: AbsenceStop): string {
  if (!stop.item.documented) return "nothing written down";
  const where = stop.item.procedureLocation?.trim();
  return where ? `procedure at ${where}` : "written down, location not recorded";
}

/** Stops, then critical share, then orphaned processes; ties keep the earlier stretch. */
function worse(a: AbsenceImpact, b: AbsenceImpact): boolean {
  return (
    a.stops.length > b.stops.length ||
    (a.stops.length === b.stops.length &&
      (a.dependence > b.dependence ||
        (a.dependence === b.dependence &&
          a.orphanedProcesses.length > b.orphanedProcesses.length)))
  );
}

/**
 * Cut the window at every day someone's overlapping leave starts or ends, work
 * out who is away in each stretch, and keep the stretch where the most stops.
 * Two coworkers who each overlap a different part of the leave are never
 * treated as away on the same day.
 */
function peakImpact(
  tpl: IndustryTemplate,
  person: Person,
  absence: PlannedAbsence,
  overlaps: readonly AbsenceOverlap[],
): { impact: AbsenceImpact; peak: AbsencePeak } | null {
  const cuts = new Set<string>([absence.from]);
  for (const o of overlaps) {
    cuts.add(o.from);
    if (o.to < absence.to) cuts.add(shiftDay(o.to, 1));
  }
  const starts = [...cuts].sort();
  const solo = absenceImpact(tpl, [person.id]);
  if (!solo) return null;
  const soloStops = new Set(solo.stops.map((s) => s.item.id));
  let best: { impact: AbsenceImpact; peak: AbsencePeak } | null = null;
  const seen = new Map<string, AbsenceImpact>();
  for (const [index, from] of starts.entries()) {
    const to = index + 1 < starts.length ? shiftDay(starts[index + 1], -1) : absence.to;
    const away: Person[] = [person];
    for (const o of overlaps) {
      if (o.from <= from && from <= o.to && !away.some((p) => p.id === o.person.id)) {
        away.push(o.person);
      }
    }
    const key = away.map((p) => p.id).join("|");
    let impact = seen.get(key);
    if (!impact) {
      const computed = absenceImpact(
        tpl,
        away.map((p) => p.id),
      );
      if (!computed) continue;
      impact = computed;
      seen.set(key, impact);
    }
    if (!best || worse(impact, best.impact)) {
      const extraStops = impact.stops
        .filter((s) => !soloStops.has(s.item.id))
        .map((s) => s.item);
      best = { impact, peak: { from, to, people: away, extraStops } };
    }
  }
  return best;
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
    const peak = peakImpact(tpl, person, absence, overlaps);
    if (!peak) continue;
    const daysUntil = Math.max(0, daysBetween(today, absence.from) ?? 0);
    windows.push({
      absence,
      person,
      daysUntil,
      lengthDays: (daysBetween(absence.from, absence.to) ?? 0) + 1,
      status: absence.from <= today ? "current" : "upcoming",
      overlaps,
      impact: peak.impact,
      peak: peak.peak,
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

/**
 * "Cy also out 8–10 Nov" for each overlapping coworker; with several of them,
 * names the stretch the stops are taken from: "worst 8–10 Nov, with Cy also out".
 */
export function describeOverlaps(w: AbsenceWindow): string {
  if (w.overlaps.length === 0) return "";
  const listed = w.overlaps
    .map((o) => `${firstName(o.person.name)} also out ${formatDateRange(o.from, o.to)}`)
    .join("; ");
  const others = w.peak.people.filter((p) => p.id !== w.person.id);
  if (w.overlaps.length === 1 || w.peak.extraStops.length === 0) return ` (${listed})`;
  return ` (${listed}; worst ${formatDateRange(w.peak.from, w.peak.to)}, with ${others
    .map((p) => firstName(p.name))
    .join(" and ")} also out)`;
}

/** One line an advisor can say about a window: who, when, and the first thing that stops. */
export function describeWindow(w: AbsenceWindow): string {
  const first = firstName(w.person.name);
  const out = outPhrase(w.absence);
  const when = `${formatDateRange(w.absence.from, w.absence.to)}, ${leadLabel(w.daysUntil)}`;
  const overlap = describeOverlaps(w);
  const stops = w.impact.stops;
  if (stops.length === 0 && w.impact.orphanedProcesses.length === 0) {
    return `${first} ${out} ${when}${overlap}: nothing stops.`;
  }
  const critical = stops.filter((s) => s.item.criticality === "critical");
  const lead = (critical.length ? critical : stops).slice(0, 2);
  const detail = lead
    .map((s) =>
      s.standIn
        ? w.status === "current"
          ? `${s.item.name} — ${firstName(s.standIn.name)} covers (${procedurePointer(s)})`
          : `${s.item.name} — hand off to ${firstName(s.standIn.name)}`
        : `${s.item.name} has no one`,
    )
    .join("; ");
  const more = stops.length - lead.length;
  const processes = w.impact.orphanedProcesses.length
    ? `${detail ? "; " : ""}${w.impact.orphanedProcesses.length} process${w.impact.orphanedProcesses.length === 1 ? "" : "es"} without an owner`
    : "";
  return `${first} ${out} ${when}${overlap}: ${detail}${more > 0 ? ` and ${more} more` : ""}${processes}.`;
}
