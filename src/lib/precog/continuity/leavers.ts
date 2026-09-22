import type { DecisionEntry } from "../practice-profile";
import { continuityCommitments, continuityStepKey } from "../decisions/follow-through";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeLevel, Person } from "../types";
import {
  absenceImpact,
  daysBetween,
  firstName,
  isCalendarDate,
  relationLevel,
  STRONG_LEVELS,
  type AbsenceAction,
} from "./coverage";
import { formatDateRange } from "./planned-absence";

/** A hand-over with this many days or fewer left is urgent. */
export const HANDOVER_URGENT_DAYS = 7;

export interface HandoverItem {
  item: KnowledgeItem;
  /** Who takes it over: the best remaining learner or cross-training candidate, if anyone. */
  successor: Person | null;
  /** The successor's level on the register today. */
  successorLevel: KnowledgeLevel | undefined;
  /** Why this successor, or why there is none. */
  note: string;
  /** Open cross-training step already logged for this item. */
  training: DecisionEntry | null;
  /** Open write-it-down or locate step already logged for this item. */
  documenting: DecisionEntry | null;
}

export interface Leaver {
  person: Person;
  lastDay: string;
  /** Days until the last day: 0 on the day itself, negative once it has passed. */
  daysLeft: number;
  /** "notice" while they are still working; "gone" once the last day has passed and they are still marked active. */
  status: "notice" | "gone";
  /** Register entries only this person can run alone — what has to be handed over. */
  handover: HandoverItem[];
  /** Entries they hold that someone else can already run alone. */
  shared: KnowledgeItem[];
  /** Processes where they are the only listed owner. */
  orphanedProcesses: string[];
  remaining: Person[];
  /** 0–100 share of must-do work that leaves with them today (same weighted index as PersonLoad.dependence). */
  dependence: number;
  /** Hand-over items with no cross-training step in the Journal yet. */
  unlogged: number;
  actions: AbsenceAction[];
}

/** The date to have hand-over steps done by: the last day, or today once it has passed. */
export function handoverDeadline(leaver: Pick<Leaver, "lastDay">, today: string): string {
  return leaver.lastDay < today ? today : leaver.lastDay;
}

/**
 * Everyone active with a last day recorded, soonest first: what only they can
 * run, who should pick each entry up, and what is already in the Journal.
 * People marked inactive have left and are not listed. Pure.
 *
 * Coverage is judged as of each person's last day, with everyone whose last
 * day falls on or before it already gone: two people who share payroll and
 * both resign each get payroll on their hand-over list, pointed at someone
 * who is staying, rather than each counting the other as cover.
 */
export function leavers(
  tpl: IndustryTemplate,
  decisions: readonly DecisionEntry[],
  today: string,
): Leaver[] {
  if (!isCalendarDate(today)) return [];
  const committed = continuityCommitments(decisions, tpl, today);
  const departing = tpl.people.filter(
    (p): p is Person & { lastDay: string } =>
      p.active && typeof p.lastDay === "string" && isCalendarDate(p.lastDay),
  );
  const out: Leaver[] = [];
  for (const person of departing) {
    const daysLeft = daysBetween(today, person.lastDay);
    if (daysLeft === null) continue;
    const goneByThen = departing.filter((o) => o.id === person.id || o.lastDay <= person.lastDay);
    const impact = absenceImpact(
      tpl,
      goneByThen.map((o) => o.id),
    );
    const own = absenceImpact(tpl, person.id);
    if (!impact || !own) continue;
    const holdsAlone = (itemId: string) =>
      STRONG_LEVELS.has(relationLevel(tpl.relations, person.id, itemId) ?? "aware");
    const owns = new Set(
      tpl.processes.filter((p) => (p.ownerPersonIds ?? []).includes(person.id)).map((p) => p.name),
    );
    const handover: HandoverItem[] = impact.stops
      .filter((s) => holdsAlone(s.item.id))
      .map((s) => ({
        item: s.item,
        successor: s.standIn,
        successorLevel: s.standIn
          ? relationLevel(tpl.relations, s.standIn.id, s.item.id)
          : undefined,
        note: s.note,
        training: committed.get(continuityStepKey(s.item.id, "cover"))?.decision ?? null,
        documenting:
          committed.get(continuityStepKey(s.item.id, "document"))?.decision ??
          committed.get(continuityStepKey(s.item.id, "locate"))?.decision ??
          null,
      }));
    const orphanedProcesses = impact.orphanedProcesses.filter((n) => owns.has(n));
    out.push({
      person,
      lastDay: person.lastDay,
      daysLeft,
      status: daysLeft < 0 ? "gone" : "notice",
      handover,
      shared: impact.continues.filter((i) => holdsAlone(i.id)),
      orphanedProcesses,
      remaining: impact.remaining,
      dependence: own.dependence,
      unlogged: handover.filter((h) => !h.training).length,
      actions: handoverActions(person, handover, orphanedProcesses, impact.remaining),
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || b.dependence - a.dependence);
}

function handoverActions(
  person: Person,
  handover: HandoverItem[],
  orphanedProcesses: string[],
  remaining: Person[],
): AbsenceAction[] {
  const first = firstName(person.name);
  const actions: AbsenceAction[] = [];
  const ids = (list: HandoverItem[]) => list.map((h) => h.item.id);
  const quoted = (list: HandoverItem[], max: number) =>
    `${list
      .slice(0, max)
      .map((h) => `"${h.item.name}"`)
      .join(", ")}${list.length > max ? ` and ${list.length - max} more` : ""}`;

  const trainable = handover.filter((h) => h.successor);
  if (trainable.length)
    actions.push({
      text: `Train the successor before ${first} goes: ${trainable
        .slice(0, 3)
        .map((h) => `${h.successor?.name} on "${h.item.name}"`)
        .join(", ")}${trainable.length > 3 ? ` and ${trainable.length - 3} more` : ""}.`,
      step: "cover",
      knowledgeIds: ids(trainable),
    });
  const nobody = handover.filter((h) => !h.successor);
  if (nobody.length)
    actions.push({
      text:
        remaining.length === 0
          ? `Nobody else is on the team to take ${quoted(nobody, 2)} — hire or line up an outside provider before ${first} goes.`
          : `Nobody left has touched ${quoted(nobody, 2)} — decide who takes it on, or line up an outside provider, before ${first} goes.`,
      step: "cover",
      knowledgeIds: ids(nobody),
    });
  const undocumented = handover.filter((h) => !h.item.documented);
  if (undocumented.length)
    actions.push({
      text: `Have ${first} write down ${quoted(undocumented, 3)} while ${first} is still here.`,
      step: "document",
      knowledgeIds: ids(undocumented),
    });
  const unlocated = handover.filter((h) => h.item.documented && !h.item.procedureLocation?.trim());
  if (unlocated.length)
    actions.push({
      text: `Record where the written procedure for ${quoted(unlocated, 3)} lives — after ${first} goes, nobody can ask.`,
      step: "locate",
      knowledgeIds: ids(unlocated),
    });
  if (orphanedProcesses.length)
    actions.push({
      text: `Name a new owner on ${orphanedProcesses
        .slice(0, 3)
        .map((n) => `"${n}"`)
        .join(
          ", ",
        )}${orphanedProcesses.length > 3 ? ` and ${orphanedProcesses.length - 3} more` : ""}.`,
      step: "cover",
      knowledgeIds: [],
    });
  if (!actions.length)
    actions.push({
      text: `Nothing on the register leaves with ${first}; someone else can already run everything ${first} does.`,
      step: "cover",
      knowledgeIds: [],
    });
  return actions;
}

/** "leaves in 12 days", "leaves tomorrow", "last day today", "left 3 days ago". */
export function leaverLead(daysLeft: number): string {
  if (daysLeft === 0) return "last day today";
  if (daysLeft === 1) return "leaves tomorrow";
  if (daysLeft > 1) return `leaves in ${daysLeft} days`;
  return daysLeft === -1 ? "left yesterday" : `left ${-daysLeft} days ago`;
}

/** "Maya leaves in 12 days (last day 14 Oct): 3 entries only she can run — train Chris on PMS admin, …" */
export function describeLeaver(l: Leaver): string {
  const first = firstName(l.person.name);
  const when = `${first} ${leaverLead(l.daysLeft)} (last day ${formatDateRange(l.lastDay, l.lastDay)})`;
  if (l.status === "gone") {
    const n = l.handover.length;
    return `${when} and is still counted as on the team — mark ${first} as left${
      n > 0
        ? ` so the register stops relying on ${first} for ${n} ${n === 1 ? "entry" : "entries"}`
        : ""
    }.`;
  }
  if (l.handover.length === 0 && l.orphanedProcesses.length === 0) {
    return `${when}: nothing on the register leaves with ${first}.`;
  }
  const n = l.handover.length;
  const named = l.handover.filter((h) => h.successor).slice(0, 2);
  const nobody = l.handover.filter((h) => !h.successor);
  const parts = [
    ...named.map((h) => `train ${firstName(h.successor?.name ?? "")} on ${h.item.name}`),
    ...(nobody.length
      ? [
          `${nobody.map((h) => h.item.name).join(", ")} ${nobody.length === 1 ? "has" : "have"} no one to take over`,
        ]
      : []),
    ...(l.orphanedProcesses.length
      ? [
          `${l.orphanedProcesses.length} process${l.orphanedProcesses.length === 1 ? "" : "es"} need${l.orphanedProcesses.length === 1 ? "s" : ""} a new owner`,
        ]
      : []),
  ];
  const stops =
    n === 0 ? "" : `${n} register ${n === 1 ? "entry" : "entries"} only ${first} can run alone`;
  return `${when}: ${[stops, ...parts].filter(Boolean).join(" — ")}${
    l.unlogged > 0 && n > 0
      ? `; ${l.unlogged === n ? "none" : `${n - l.unlogged} of ${n}`} logged in the Journal`
      : ""
  }.`;
}

/** Record or clear a person's last day on the team list; other people untouched. */
export function setLastDay(
  people: readonly Person[],
  personId: string,
  lastDay: string | null,
): Person[] {
  return people.map((p) =>
    p.id !== personId
      ? p
      : lastDay
        ? { ...p, lastDay }
        : (({ lastDay: _lastDay, ...rest }) => rest)(p),
  );
}

/** Whether a person's last day has passed, so they can be marked as left. */
export function canMarkLeft(person: Pick<Person, "lastDay">, today: string): boolean {
  return (
    typeof person.lastDay === "string" &&
    isCalendarDate(person.lastDay) &&
    isCalendarDate(today) &&
    person.lastDay < today
  );
}

/**
 * They have left: kept on the list for history, dropped from coverage. Only
 * applies once the recorded last day is in the past — someone still working
 * their notice stays counted as cover, so this is a no-op until then.
 */
export function markLeft(people: readonly Person[], personId: string, today: string): Person[] {
  return people.map((p) =>
    p.id === personId && canMarkLeft(p, today) ? { ...p, active: false } : p,
  );
}
