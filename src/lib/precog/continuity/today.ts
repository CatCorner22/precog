import type { DecisionEntry, PlannedAbsence } from "../practice-profile";
import type { IndustryId } from "../industry";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, Person } from "../types";
import { continuityCommitments, handoffCommitment } from "../decisions/follow-through";
import { firstName } from "./coverage";
import { leaveDebriefs } from "./leave-debrief";
import { registerAssessed } from "./register-state";
import { leaverLead, leavers, type Leaver } from "./leavers";
import {
  formatDateRange,
  plannedAbsenceReport,
  procedurePointer,
  type AbsenceWindow,
} from "./planned-absence";
import { joinWithAnd } from "../text";

/** Leave starting within this many days counts as "starting soon" on the dashboard. */
export const SOON_DAYS = 7;
/** A last day within this many days puts the leaver on the dashboard. */
export const LEAVING_SOON_DAYS = 30;

interface TodayStop {
  item: KnowledgeItem;
  standIn: Person | null;
  /** True when nobody left has ever touched the item — the stand-in, if any, starts cold. */
  cold: boolean;
  /** Where the stand-in finds the written procedure, or that there is none. */
  procedure: string;
  /** True when a hand-off for this item and absence is already open in the Journal. */
  handoffLogged: boolean;
}

interface TodayOut {
  window: AbsenceWindow;
  person: Person;
  unplanned: boolean;
  stops: TodayStop[];
}

interface TodayUpcoming {
  window: AbsenceWindow;
  person: Person;
  daysUntil: number;
  /** Stopped items with no hand-off logged yet. */
  unlogged: number;
}

export interface TodayBrief {
  /** Everyone out right now, most critical impact first. */
  out: TodayOut[];
  /** Stopped items across everyone out that nobody left has ever done. */
  cold: number;
  /** Stopped items across everyone out with nothing written down. */
  unwritten: number;
  /** Stopped items across everyone out whose hand-off is not in the Journal. */
  unlogged: number;
  /** Leave starting within SOON_DAYS, soonest first. */
  startingSoon: TodayUpcoming[];
  /** Absences that ended and still await a debrief. */
  debriefs: number;
  /** People working their notice with a last day within LEAVING_SOON_DAYS, soonest first. */
  leaving: Leaver[];
  /** People whose last day has passed but who are still counted as cover. */
  gone: Leaver[];
  /** False while nobody is marked on the register: the brief cannot say what stops. */
  assessed: boolean;
  /** One plain sentence for the top of the dashboard; null when there is nothing to say. */
  headline: string | null;
}

/**
 * What the owner needs to know about staffing when they open the app this
 * morning: who is out, what that stops, who covers it, and what is about to
 * start. Pure — the dashboard, and anything else, renders from this.
 */
export function todayBrief(
  tpl: IndustryTemplate,
  absences: readonly PlannedAbsence[],
  decisions: readonly DecisionEntry[],
  industry: IndustryId,
  today: string,
): TodayBrief {
  const leave = plannedAbsenceReport(tpl, absences, industry, today);
  const committed = continuityCommitments(decisions, tpl, today);
  const touched = new Set(tpl.relations.map((r) => `${r.personId}\u0000${r.knowledgeId}`));
  const out: TodayOut[] = leave.windows
    .filter((w) => w.status === "current")
    .map((w) => ({
      window: w,
      person: w.person,
      unplanned: Boolean(w.absence.unplanned),
      stops: (w.todayImpact ?? w.impact).stops.map((s) => ({
        item: s.item,
        standIn: s.standIn,
        cold: !s.standIn || !touched.has(`${s.standIn.id}\u0000${s.item.id}`),
        procedure: procedurePointer(s),
        handoffLogged: Boolean(handoffCommitment(committed, s.item.id, w.absence.id)),
      })),
    }))
    .sort(
      (a, b) =>
        (b.window.todayImpact ?? b.window.impact).dependence -
        (a.window.todayImpact ?? a.window.impact).dependence,
    );
  const stops = out.flatMap((o) => o.stops);
  const startingSoon: TodayUpcoming[] = leave.windows
    .filter((w) => w.status === "upcoming" && w.daysUntil <= SOON_DAYS)
    .map((w) => ({
      window: w,
      person: w.person,
      daysUntil: w.daysUntil,
      unlogged: w.impact.stops.filter((s) => !handoffCommitment(committed, s.item.id, w.absence.id))
        .length,
    }));
  const debriefs = leaveDebriefs(tpl, absences, decisions, industry, today).length;
  const departing = leavers(tpl, decisions, today);
  const brief: TodayBrief = {
    out,
    cold: stops.filter((s) => s.cold).length,
    unwritten: stops.filter((s) => !s.item.documented).length,
    unlogged: stops.filter((s) => !s.handoffLogged).length,
    startingSoon,
    debriefs,
    leaving: departing.filter((l) => l.status === "notice" && l.daysLeft <= LEAVING_SOON_DAYS),
    gone: departing.filter((l) => l.status === "gone"),
    assessed: registerAssessed(tpl),
    headline: null,
  };
  brief.headline = headline(brief);
  return brief;
}

function headline(b: TodayBrief): string | null {
  if (b.out.length > 0) {
    const names = b.out.map((o) => firstName(o.person.name));
    const who = joinWithAnd(names);
    const unexpected = b.out.filter((o) => o.unplanned).length;
    const how =
      unexpected === b.out.length
        ? "out unexpectedly"
        : unexpected === 1
          ? "out (one unexpectedly)"
          : unexpected > 1
            ? `out (${unexpected} unexpectedly)`
            : "out";
    const count = b.out.flatMap((o) => o.stops).length;
    const first = b.out[0].window;
    const waiting = (first.todayImpact ?? first.impact).alreadyStopped.filter(
      (k) => k.criticality !== "nice-to-have",
    ).length;
    const stops = !b.assessed
      ? "nobody is marked on the register yet, so the app cannot tell what stops"
      : count === 0 && waiting > 0
        ? `nothing more on the register stops, but ${waiting} ${waiting === 1 ? "entry" : "entries"} nobody can run alone already ${waiting === 1 ? "waits" : "wait"}`
        : count === 0
          ? "nothing on the register stops"
          : `${count} register ${count === 1 ? "entry stops" : "entries stop"}`;
    const tail = [
      b.cold > 0 ? `${b.cold} that nobody left has done before` : "",
      b.unwritten > 0 ? `${b.unwritten} with nothing written down` : "",
    ].filter(Boolean);
    return `${who} ${names.length === 1 ? "is" : "are"} ${how} today — ${stops}${tail.length ? `, ${tail.join(", ")}` : ""}.`;
  }
  if (b.gone.length > 0) {
    const l = b.gone[0];
    const first = firstName(l.person.name);
    return `${first} ${leaverLead(l.daysLeft)} but still counts as cover — mark ${first} as left${l.handover.length > 0 ? ` (${l.handover.length} ${l.handover.length === 1 ? "entry" : "entries"} only ${first} could run alone)` : ""}.`;
  }
  if (b.startingSoon.length > 0) {
    const w = b.startingSoon[0];
    const when = w.daysUntil === 1 ? "tomorrow" : `in ${w.daysUntil} days`;
    return `${firstName(w.person.name)} is out ${formatDateRange(w.window.absence.from, w.window.absence.to)}, ${when}${w.unlogged > 0 ? ` — ${w.unlogged} hand-off${w.unlogged === 1 ? "" : "s"} not yet logged` : ""}.`;
  }
  if (b.leaving.length > 0) {
    const l = b.leaving[0];
    const first = firstName(l.person.name);
    const work = !b.assessed
      ? "the app cannot tell yet what depends on them alone"
      : l.handover.length === 0
        ? "nothing on the register depends on them alone"
        : `${l.handover.length} ${l.handover.length === 1 ? "entry" : "entries"} to hand over${l.unlogged > 0 ? `, ${l.unlogged} not yet in the Journal` : ""}`;
    return `${first} ${leaverLead(l.daysLeft)} — ${work}.`;
  }
  if (b.debriefs > 0) {
    return `${b.debriefs} absence${b.debriefs === 1 ? "" : "s"} just ended — debrief the stand-ins.`;
  }
  return null;
}
