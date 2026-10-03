import type { IndustryId } from "../industry";
import type { PlannedAbsence } from "../practice-profile";
import type { IndustryTemplate } from "../templates";
import type { KnowledgeItem, Person } from "../types";
import { absenceImpact, type AbsenceImpact } from "./absence-impact";
import type { StandInConflicts } from "./standin-conflicts";
import { procedurePointer } from "./documentation";
import { daysBetween, isCalendarDate, shiftDay, formatDayRange } from "../dates";
import { joinWithAnd, joinWithOr, firstName } from "../text";

/** How far ahead the weekly actions, the report and Pioneer start warning about known leave. */
const ABSENCE_LEAD_DAYS = 30;

interface AbsenceOverlap {
  absence: PlannedAbsence;
  person: Person;
  /** First and last shared day, inclusive. */
  from: string;
  to: string;
}

/** The stretch of a leave window with the most work stopped, and who is away during it. */
interface AbsencePeak {
  from: string;
  to: string;
  /** Everyone away on those days: the person on leave plus anyone overlapping then. */
  people: Person[];
  /** Register entries that stop only because of the overlapping leave; empty when this person alone stops them all. */
  extraStops: KnowledgeItem[];
}

/** A stand-in the window names who is away themselves for part of it. */
interface StandInAway {
  item: KnowledgeItem;
  standIn: Person;
  /** The days of the window they are out, inclusive. */
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
   * What stops on the worst stretch of the window — the days when the most
   * people are away together — not an average of it. Overlaps that never
   * share a day are never combined.
   */
  impact: AbsenceImpact;
  /** The stretch `impact` describes. Spans the whole window when nobody's leave overlaps. */
  peak: AbsencePeak;
  /**
   * Stand-ins `impact` names who are out on some days of the window: the
   * peak stretch alone does not show them, so `impact.actions` asks for a
   * second stand-in for those days.
   */
  standInsAway: StandInAway[];
  /**
   * What stops today, counting only the people away today. Null for an
   * upcoming window. Differs from `impact` when the worst stretch is still
   * ahead, so the cover sheet never lists a stop that has not happened yet.
   */
  todayImpact: AbsenceImpact | null;
}

interface PlannedAbsenceReport {
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

/** Stops, then critical share, then orphaned processes; ties keep the earlier stretch. */
function worse(a: AbsenceImpact, b: AbsenceImpact): boolean {
  return (
    a.stops.length > b.stops.length ||
    (a.stops.length === b.stops.length &&
      (a.dependence > b.dependence ||
        (a.dependence === b.dependence && a.orphanedProcesses.length > b.orphanedProcesses.length)))
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
  conflictsFor?: StandInConflicts,
): { impact: AbsenceImpact; peak: AbsencePeak } | null {
  const cuts = new Set<string>([absence.from]);
  for (const o of overlaps) {
    cuts.add(o.from);
    if (o.to < absence.to) cuts.add(shiftDay(o.to, 1));
  }
  const starts = [...cuts].sort();
  const solo = absenceImpact(tpl, [person.id], conflictsFor);
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
        conflictsFor,
      );
      if (!computed) continue;
      impact = computed;
      seen.set(key, impact);
    }
    if (!best || worse(impact, best.impact)) {
      const extraStops = impact.stops.filter((s) => !soloStops.has(s.item.id)).map((s) => s.item);
      best = { impact, peak: { from, to, people: away, extraStops } };
    }
  }
  return best;
}

/** The impact with an action, after the hand-offs, for each stand-in who is out part of the window. */
function withStandInsAway(impact: AbsenceImpact, away: readonly StandInAway[]): AbsenceImpact {
  if (away.length === 0) return impact;
  const added = away.map((a) => ({
    text: `${a.standIn.name} is out too on ${formatDayRange(a.from, a.to)}: name a second stand-in for "${a.item.name}" for those days.`,
    step: "handoff" as const,
    knowledgeIds: [a.item.id],
  }));
  const at = impact.actions.filter((a) => a.step === "handoff").length
    ? impact.actions.map((a) => a.step).lastIndexOf("handoff") + 1
    : 0;
  return {
    ...impact,
    actions: [...impact.actions.slice(0, at), ...added, ...impact.actions.slice(at)],
  };
}

/**
 * Known leave laid over the register: for each absence that has not ended,
 * what stops while that person — and anyone whose leave overlaps — is away,
 * and how many days the owner has left to hand things off. With
 * `conflictsFor`, stand-ins whose cover creates a duty conflict come last
 * and are flagged (see absenceImpact).
 */
export function plannedAbsenceReport(
  tpl: IndustryTemplate,
  absences: readonly PlannedAbsence[],
  industry: IndustryId,
  today: string,
  conflictsFor?: StandInConflicts,
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
    const peak = peakImpact(tpl, person, absence, overlaps, conflictsFor);
    if (!peak) continue;
    const standInsAway = peak.impact.stops.flatMap((stop) =>
      overlaps
        .filter((o) => o.person.id === stop.standIn?.id)
        .map((o) => ({ item: stop.item, standIn: o.person, from: o.from, to: o.to })),
    );
    const daysUntil = Math.max(0, daysBetween(today, absence.from) ?? 0);
    const current = absence.from <= today;
    const awayToday = current
      ? [
          person.id,
          ...overlaps.filter((o) => o.from <= today && today <= o.to).map((o) => o.person.id),
        ]
      : [];
    windows.push({
      absence,
      person,
      daysUntil,
      lengthDays: (daysBetween(absence.from, absence.to) ?? 0) + 1,
      status: current ? "current" : "upcoming",
      overlaps,
      impact: withStandInsAway(peak.impact, standInsAway),
      peak: peak.peak,
      standInsAway,
      todayImpact: current ? absenceImpact(tpl, awayToday, conflictsFor) : null,
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

/** "out now", "tomorrow", "in 12 days". */
export function leadLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "out now";
  if (daysUntil === 1) return "tomorrow";
  return `in ${daysUntil} days`;
}

/** The day to have hand-offs done by: the day before leave starts, or today once it is imminent or under way. */
export function handoffDeadline(window: AbsenceWindow, today: string): string {
  if (window.daysUntil <= 1) return today;
  return shiftDay(window.absence.from, -1);
}

/**
 * "Cy also out 8–10 Nov" for each overlapping coworker; with several of them,
 * names the stretch the stops are taken from: "worst 8–10 Nov, with Cy also out".
 */
function describeOverlaps(w: AbsenceWindow): string {
  if (w.overlaps.length === 0) return "";
  const listed = w.overlaps
    .map((o) => `${firstName(o.person.name)} also out ${formatDayRange(o.from, o.to)}`)
    .join("; ");
  const others = w.peak.people.filter((p) => p.id !== w.person.id);
  if (w.overlaps.length === 1 || w.peak.extraStops.length === 0) return ` (${listed})`;
  return ` (${listed}; worst ${formatDayRange(w.peak.from, w.peak.to)}, with ${joinWithAnd(others.map((p) => firstName(p.name)))} also out)`;
}

/** One line an advisor can say about a window: who, when, and the first thing that stops. */
export function describeWindow(w: AbsenceWindow): string {
  const first = firstName(w.person.name);
  const out = outPhrase(w.absence);
  const when = `${formatDayRange(w.absence.from, w.absence.to)}, ${leadLabel(w.daysUntil)}`;
  const overlap = describeOverlaps(w);
  const stops = w.impact.stops;
  if (!w.impact.assessed && w.impact.orphanedProcesses.length === 0) {
    return `${first} ${out} ${when}${overlap}: the register does not mark anyone yet, so Precog cannot tell what stops.`;
  }
  if (stops.length === 0 && w.impact.orphanedProcesses.length === 0) {
    const waiting = w.impact.alreadyStopped.filter((k) => k.criticality !== "nice-to-have");
    return waiting.length
      ? `${first} ${out} ${when}${overlap}: nothing more stops, but nobody can run ${joinWithOr(
          waiting.map((k) => k.name),
          2,
        )} alone even with ${first} in.`
      : `${first} ${out} ${when}${overlap}: nothing stops.`;
  }
  const critical = stops.filter((s) => s.item.criticality === "critical");
  const lead = (critical.length ? critical : stops).slice(0, 2);
  const detail = lead
    .map((s) =>
      s.standIn
        ? w.status === "current"
          ? `${s.item.name} — ${firstName(s.standIn.name)} covers (${procedurePointer(s.item)})`
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
