/**
 * The continuity planner's decisions that do not need React: which steps
 * still need logging, when a debrief is settled, whom the what-if card starts
 * with, which check-in to show, and what a confirmation says before the
 * register loses data. The hook in use-continuity-planner.ts calls these; the
 * tests call them directly.
 */
import type { AbsenceAction } from "@/lib/precog/continuity/absence-impact";
import type { ContinuityStep } from "@/lib/precog/decisions/follow-through";
import type { CoverageReport } from "@/lib/precog/continuity/coverage";
import type { DebriefItem, LeaveDebrief } from "@/lib/precog/continuity/leave-debrief";
import type { CheckInPlan } from "@/lib/precog/continuity/staleness";
import {
  continuityStepKey,
  handoffCommitment,
  type ContinuityCommitment,
} from "@/lib/precog/decisions/follow-through";
import { UNHELD_VIEW } from "@/lib/precog/continuity/planner-copy";
import type { KnowledgeItem, KnowledgeRelation, Person } from "@/lib/precog/types";
import { count } from "@/lib/precog/text";

/**
 * The open Journal entry for a step on an item, from `continuityCommitments`
 * (the same lookup the leaver and debrief reports use, so every card names
 * the same entry). A hand-off is looked up for its own absence first.
 */
export function stepCommitment(
  commitments: ReadonlyMap<string, ContinuityCommitment>,
  knowledgeId: string,
  step: ContinuityStep,
  absenceId?: string,
): ContinuityCommitment | undefined {
  return absenceId && step === "handoff"
    ? handoffCommitment(commitments, knowledgeId, absenceId)
    : commitments.get(continuityStepKey(knowledgeId, step));
}

/** Whether an open Journal entry already tracks this step on this item. */
type IsTracked = (knowledgeId: string, step: ContinuityStep) => boolean;

/** The items an absence step names that still need a Journal entry, in the step's order. */
export function untrackedItems(
  action: AbsenceAction,
  knowledge: readonly KnowledgeItem[],
  isTracked: IsTracked,
): KnowledgeItem[] {
  return action.knowledgeIds
    .map((id) => knowledge.find((k) => k.id === id))
    .filter((k): k is KnowledgeItem => Boolean(k))
    .filter((k) => !isTracked(k.id, action.step));
}

/**
 * Only a hand-off belongs to one absence; every other step outlives it, so
 * it is logged without the absence id and counts for later leave too.
 */
export function stepAbsenceId(step: ContinuityStep, absenceId?: string): string | undefined {
  return step === "handoff" ? absenceId : undefined;
}

/** The first item's value once every item the step names has one; otherwise undefined. */
export function wholeStep<T>(action: AbsenceAction, entry: (knowledgeId: string) => T | undefined) {
  return action.knowledgeIds.length > 0 && action.knowledgeIds.every((id) => entry(id))
    ? entry(action.knowledgeIds[0])
    : undefined;
}

/** Key of one answered debrief entry. */
export function debriefKey(absenceId: string, knowledgeId: string): string {
  return `${absenceId}:${knowledgeId}`;
}

/** True when answering `entry` leaves nothing else open on this debrief, so the leave stops asking. */
export function settlesDebrief(
  debrief: LeaveDebrief,
  entry: DebriefItem,
  answered: ReadonlySet<string>,
): boolean {
  return debrief.items.every(
    (e) => e.item.id === entry.item.id || answered.has(debriefKey(debrief.absence.id, e.item.id)),
  );
}

/** Promoting the stand-in closes the training step when it was aimed at them or at nobody in particular. */
export function promotionClosesTraining(entry: DebriefItem, standIn: Person): boolean {
  return Boolean(
    entry.training &&
    (!entry.training.linkedPersonId || entry.training.linkedPersonId === standIn.id),
  );
}

/**
 * Who the what-if card treats as out. Until the owner ticks or unticks
 * anyone (`ticked` is null) it starts with the person the business leans on
 * most and says so; after that it is exactly the people ticked who are still
 * on the active team, which may be nobody.
 */
export function whatIfAbsentIds(
  ticked: readonly string[] | null,
  people: readonly Person[],
  report: Pick<CoverageReport, "people">,
): { ids: string[]; startedWith: Person | null } {
  if (ticked !== null) {
    return { ids: ticked.filter((id) => people.some((p) => p.id === id)), startedWith: null };
  }
  const fallback = report.people.find((l) => l.person.active)?.person ?? null;
  return { ids: fallback ? [fallback.id] : [], startedWith: fallback };
}

/**
 * The check-in to show: the person chosen, or the unheld list when chosen and
 * not empty; otherwise the first person with stale items, else the unheld list.
 */
export function checkInViewFor(choice: string | null, plan: CheckInPlan): string {
  if (choice === UNHELD_VIEW && plan.unheld.length > 0) return UNHELD_VIEW;
  return (
    plan.checkIns.find((c) => c.person.id === choice)?.person.id ??
    plan.checkIns[0]?.person.id ??
    UNHELD_VIEW
  );
}

/** Asked before "Back to starter list" throws away the owner's own register. */
export function resetRegisterPrompt(register: RegisterContents, industryLabel: string): string {
  return `Replace your ${registerSize(register)} with the ${industryLabel.toLowerCase()} sample list? You lose your items and every mark on them, and you cannot undo this.`;
}

/** Asked before an imported file replaces the owner's own register. */
export function importRegisterPrompt(register: RegisterContents, file: RegisterContents): string {
  return `Replace your ${registerSize(register)} with the ${registerSize(file)} in this file? You lose what the register says now, and you cannot undo this.`;
}

/** Asked before one item, and everyone's mark on it, leaves the register. */
export function removeItemPrompt(
  item: Pick<KnowledgeItem, "id" | "name">,
  relations: readonly KnowledgeRelation[],
): string {
  const marks = relations.filter((r) => r.knowledgeId === item.id).length;
  return `Remove "${item.name}" from the register${
    marks > 0 ? ` with the ${count(marks, "mark")} on it` : ""
  }? You cannot undo this.`;
}

interface RegisterContents {
  knowledge: readonly KnowledgeItem[];
  relations: readonly KnowledgeRelation[];
}

function registerSize(register: RegisterContents): string {
  return `${count(register.knowledge.length, "item")} and ${count(register.relations.length, "mark")}`;
}
