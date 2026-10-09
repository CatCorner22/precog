import type { IndustryTemplate } from "../templates";
import type { KnowledgeItem, Person } from "../types";
import type { ContinuityStep } from "../decisions/follow-through";
import { joinWithAnd, joinWithOr, firstName, quoted } from "../text";
import { itemRecorded, registerAssessed } from "./register-state";
import { coverageReport, CRITICALITY_WEIGHT, dependenceFor, suggestBackups } from "./coverage";
import { documentationState, draftPointer, isWritten, procedurePointer } from "./documentation";
import type { DetectedConflict } from "../sod/detect";
import { standInConflictNote, type StandInConflicts } from "./standin-conflicts";

/**
 * What stops when someone is away, who picks it up, and the one action that
 * closes the gap — for planned leave, a departure, or a what-if.
 */
interface AbsenceStop {
  item: KnowledgeItem;
  /** Best person to pick it up while the holder is out, if anyone. */
  standIn: Person | null;
  /** Why the stand-in was chosen, or why nobody is available. */
  note: string;
  /**
   * Duty conflicts the stand-in would newly hold by covering this, when the
   * caller passed a checker (see standInConflicts); empty otherwise.
   */
  conflicts: DetectedConflict[];
}

export interface AbsenceImpact {
  people: Person[];
  /**
   * False while nobody is marked on the register (see registerAssessed): the
   * impact then claims nothing about the register, lists no stops, and its
   * one action says the app cannot tell yet.
   */
  assessed: boolean;
  /** Active people still in, whoever the work falls to. */
  remaining: Person[];
  /** Items only this person can run alone — work that stops on day one. */
  stops: AbsenceStop[];
  /**
   * Items nobody on the team can run alone, whoever is out: work that is
   * already stopped, most critical first. Not counted in `dependence`, which
   * measures what the absence itself stops.
   */
  alreadyStopped: KnowledgeItem[];
  /** Items this person can run alone that another person can also run. */
  continues: KnowledgeItem[];
  /** Processes where this person is the only listed owner. */
  orphanedProcesses: string[];
  /** 0–100 share of must-do work that stops (same weighted index as PersonLoad.dependence). */
  dependence: number;
  /**
   * What to do: hand-offs first, then what to write down and who to
   * cross-train. The text carries no timing; the card that shows it says
   * whether it is for today or before the leave starts.
   */
  actions: AbsenceAction[];
}

export interface AbsenceAction {
  text: string;
  step: ContinuityStep;
  /** Register items the action is about; empty when it concerns processes or nothing at all. */
  knowledgeIds: string[];
}

interface OwnerlessProcess {
  id: string;
  name: string;
  /** The listed owners, all of whom have left the team. */
  formerOwners: Person[];
}

/**
 * Processes whose every listed owner has been marked as left. The owner ids
 * stay on the process for history, so nothing else notices the gap. Pure.
 */
export function ownerlessProcesses(tpl: IndustryTemplate): OwnerlessProcess[] {
  const byId = new Map(tpl.people.map((p) => [p.id, p]));
  const out: OwnerlessProcess[] = [];
  for (const p of tpl.processes) {
    const owners = (p.ownerPersonIds ?? [])
      .map((id) => byId.get(id))
      .filter((x): x is Person => Boolean(x));
    if (owners.length > 0 && owners.every((o) => !o.active)) {
      out.push({ id: p.id, name: p.name, formerOwners: owners });
    }
  }
  return out;
}

/**
 * What happens if one person is unavailable tomorrow — sick, on leave, or
 * gone. Reads the coverage report and names a stand-in per stopped item;
 * "stand-in" here means the best cross-training candidate, not someone who
 * can already do it (if such a person existed the item would not stop).
 * With `conflictsFor`, a candidate whose cover would create a duty conflict
 * is chosen only when nobody else can stand in, and the stop says so.
 */
export function absenceImpact(
  tpl: IndustryTemplate,
  personIds: readonly string[],
  conflictsFor?: StandInConflicts,
): AbsenceImpact | null {
  const requested = new Set(personIds);
  const absentPeople = tpl.people.filter((p) => requested.has(p.id));
  if (absentPeople.length === 0) return null;
  const absent = new Set(absentPeople.map((p) => p.id));
  const report = coverageReport(tpl);
  const remaining = tpl.people.filter((p) => p.active && !absent.has(p.id));
  const single = absentPeople.length === 1;
  const soleCountByPerson = new Map(report.people.map((l) => [l.person.id, l.soleItems.length]));
  const firstNames = absentPeople.map((p) => firstName(p.name));
  const names = joinWithAnd(firstNames);

  const where = (item: KnowledgeItem) =>
    documentationState(item) === "located" ? ` (${procedurePointer(item)})` : "";

  const stops: AbsenceStop[] = report.items
    .filter((i) => i.primaries.length >= 1 && i.primaries.every((p) => absent.has(p.id)))
    .sort(
      (a, b) =>
        CRITICALITY_WEIGHT[b.item.criticality] - CRITICALITY_WEIGHT[a.item.criticality] ||
        a.item.name.localeCompare(b.item.name),
    )
    .map((i): AbsenceStop => {
      const available = (p: Person) => p.active && !absent.has(p.id);
      const conflictsOf = (p: Person) => conflictsFor?.(p.id, i.item.id) ?? [];
      const clear = (p: Person) => conflictsOf(p).length === 0;
      const learners = i.learners.filter(available);
      // A covered item carries no ranked backups; when every holder is out at
      // once it still needs a stand-in, so rank the remaining team here.
      const candidates = () =>
        (i.suggestedBackups.length
          ? i.suggestedBackups
          : suggestBackups(tpl, i.item, soleCountByPerson)
        ).filter((s) => available(s.person));
      // Someone whose cover would create a duty conflict comes after everyone
      // whose would not; in a small team they may still be the only cover.
      const cleanLearner = learners.find(clear);
      const cleanCandidate = cleanLearner ? undefined : candidates().find((s) => clear(s.person));
      const learner = cleanLearner ?? (cleanCandidate ? undefined : learners[0]) ?? null;
      const withConflicts = (stop: Omit<AbsenceStop, "conflicts">): AbsenceStop => {
        const conflicts = stop.standIn ? conflictsOf(stop.standIn) : [];
        return conflicts.length && stop.standIn
          ? {
              ...stop,
              note: `${stop.note} ${standInConflictNote(stop.standIn.name, conflicts)}`,
              conflicts,
            }
          : { ...stop, conflicts };
      };
      if (learner) {
        return withConflicts({
          item: i.item,
          standIn: learner,
          note: isWritten(i.item)
            ? `${learner.name} has the basics and there is a written procedure to follow${where(i.item)}.`
            : draftPointer(i.item)
              ? `${learner.name} has the basics, and the only steps are a draft not yet fitted to this business (${draftPointer(i.item)}) — expect mistakes.`
              : `${learner.name} has the basics but nobody has written the steps down — expect mistakes.`,
        });
      }
      const candidate = cleanCandidate ?? candidates()[0] ?? null;
      if (!candidate) {
        return {
          item: i.item,
          standIn: null,
          note:
            remaining.length === 0
              ? "Nobody else is on the team."
              : "Nobody else has touched this; it waits or goes to an outside provider.",
          conflicts: [],
        };
      }
      return withConflicts({
        item: i.item,
        standIn: candidate.person,
        note: isWritten(i.item)
          ? `${candidate.person.name} has never done it but could follow the written procedure${where(i.item)} (${candidate.reasons[0]}).`
          : draftPointer(i.item)
            ? `${candidate.person.name} would be starting cold with only a draft not yet fitted to this business, ${draftPointer(i.item)} (${candidate.reasons[0]}).`
            : `${candidate.person.name} would be starting cold with nothing written down (${candidate.reasons[0]}).`,
      });
    });

  const continues = report.items
    .filter(
      (i) =>
        i.primaries.some((p) => absent.has(p.id)) && i.primaries.some((p) => !absent.has(p.id)),
    )
    .map((i) => i.item);

  const assessed = registerAssessed(tpl);
  const alreadyStopped = report.items
    .filter((i) => assessed && i.primaries.length === 0 && itemRecorded(tpl, i.item.id))
    .map((i) => i.item)
    .sort(
      (a, b) =>
        CRITICALITY_WEIGHT[b.criticality] - CRITICALITY_WEIGHT[a.criticality] ||
        a.name.localeCompare(b.name),
    );

  const orphanedProcesses = tpl.processes
    .filter((p) => {
      const owners = (p.ownerPersonIds ?? []).filter((id) =>
        tpl.people.some((x) => x.id === id && x.active),
      );
      return owners.length > 0 && owners.every((id) => absent.has(id));
    })
    .map((p) => p.name);

  const actions: AbsenceAction[] = [];
  const ids = (list: AbsenceStop[]) => list.map((s) => s.item.id);
  if (remaining.length === 0)
    actions.push({
      text: `Nobody remains in the business while ${names} ${single ? "is" : "are"} out. Line up outside help or close for those days.`,
      step: "cover",
      knowledgeIds: [],
    });
  const critical = stops.filter((s) => s.item.criticality === "critical");
  if (critical.length) {
    const named = critical.filter((s) => s.standIn);
    if (named.length)
      actions.push({
        text: `Hand ${joinWithAnd(
          named.map((s) => `${quoted(s.item.name)} to ${s.standIn?.name}`),
          3,
        )}.`,
        step: "handoff",
        knowledgeIds: ids(named),
      });
    const cold = critical.filter((s) => !s.standIn);
    if (cold.length)
      actions.push({
        text: `No one can cover ${joinWithOr(
          cold.map((s) => quoted(s.item.name)),
          2,
        )} — line up an outside provider or accept that it stops.`,
        step: "cover",
        knowledgeIds: ids(cold),
      });
  }
  const undocumented = stops.filter((s) => !isWritten(s.item));
  if (undocumented.length)
    actions.push({
      text: `Have ${names} write down ${joinWithAnd(
        undocumented.map((s) => quoted(s.item.name)),
        3,
      )}.`,
      step: "document",
      knowledgeIds: ids(undocumented),
    });
  const unlocated = stops.filter((s) => documentationState(s.item) === "unlocated");
  if (unlocated.length)
    actions.push({
      text: `Record where the written procedure for ${joinWithAnd(
        unlocated.map((s) => quoted(s.item.name)),
        3,
      )} lives so a stand-in can find it without ${names}.`,
      step: "locate",
      knowledgeIds: ids(unlocated),
    });
  const trainable = stops.filter((s) => s.standIn).slice(0, 3);
  if (trainable.length)
    actions.push({
      text: `Cross-train so ${names} ${single ? "is" : "are"} not the only one${single ? "" : "s"}: ${joinWithAnd(
        trainable.map((s) => `${s.standIn?.name} on ${quoted(s.item.name)}`),
      )}.`,
      step: "cover",
      knowledgeIds: ids(trainable),
    });
  if (orphanedProcesses.length)
    actions.push({
      text: `Name a second owner on ${joinWithAnd(orphanedProcesses.map(quoted), 3)}.`,
      step: "cover",
      knowledgeIds: [],
    });
  if (!assessed)
    actions.push({
      text: `The register does not mark anyone yet, so Precog cannot tell what stops if ${names} ${single ? "is" : "are"} out. Mark who can do each item first.`,
      step: "cover",
      knowledgeIds: [],
    });
  const waiting = alreadyStopped.filter((item) => item.criticality !== "nice-to-have");
  if (waiting.length)
    actions.push({
      text: `Already stopped, whoever is in: nobody can run ${joinWithOr(
        waiting.map((item) => quoted(item.name)),
        2,
      )} alone. Mark who can, or line up an outside provider.`,
      step: "cover",
      knowledgeIds: waiting.map((item) => item.id),
    });
  // "Nothing stops" is said only when it is true: no item waits on the absent
  // people, none waits on nobody, and someone is left to do the work.
  if (!actions.length)
    actions.push({
      text: alreadyStopped.length
        ? `Nothing more stops if ${names} ${single ? "is" : "are"} out; ${joinWithAnd(
            alreadyStopped.map((item) => quoted(item.name)),
            2,
          )} already ${alreadyStopped.length === 1 ? "waits" : "wait"} because nobody can run ${alreadyStopped.length === 1 ? "it" : "them"} alone.`
        : `Nothing stops if ${names} ${single ? "is" : "are"} out. Keep it that way as duties change.`,
      step: "cover",
      knowledgeIds: [],
    });

  return {
    people: absentPeople,
    assessed,
    remaining,
    stops,
    alreadyStopped,
    continues,
    orphanedProcesses,
    dependence: dependenceFor(
      report.items.map((i) => i.item),
      stops.map((s) => s.item),
    ),
    actions,
  };
}

/**
 * One contingency card per active person whose absence stops work or leaves a
 * process without an owner, most-depended-on first. Feeds the printed report.
 */
export function contingencyCards(tpl: IndustryTemplate): AbsenceImpact[] {
  return tpl.people
    .filter((p) => p.active)
    .map((p) => absenceImpact(tpl, [p.id]))
    .filter((c): c is AbsenceImpact => Boolean(c))
    .filter((c) => c.stops.length > 0 || c.orphanedProcesses.length > 0)
    .sort(
      (a, b) =>
        b.dependence - a.dependence ||
        b.stops.length - a.stops.length ||
        a.people[0].name.localeCompare(b.people[0].name),
    );
}
