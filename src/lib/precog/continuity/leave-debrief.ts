import type { DecisionEntry, PlannedAbsence } from "../practice-profile";
import {
  continuityCommitments,
  continuityStepKey,
  handoffCommitment,
} from "../decisions/follow-through";
import type { IndustryId } from "../industry";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeLevel, Person } from "../types";
import {
  absenceImpact,
  daysBetween,
  isCalendarDate,
  relationLevel,
  STRONG_LEVELS,
} from "./coverage";

/** How long after leave ends the debrief keeps asking before it is treated as history. */
export const DEBRIEF_WINDOW_DAYS = 60;

export interface DebriefItem {
  item: KnowledgeItem;
  /** Who stood in: the person the hand-off was logged to, else who the register says would have. */
  standIn: Person | null;
  /** The stand-in's level on the register today. */
  standInLevel: KnowledgeLevel | undefined;
  /** Open hand-off logged for this leave (or an older unkeyed one); closed when the debrief resolves the item. */
  handoff: DecisionEntry | null;
  /** Open cross-training step already logged for this item, so "Not yet" continues it rather than adding another. */
  training: DecisionEntry | null;
}

export interface LeaveDebrief {
  absence: PlannedAbsence;
  person: Person;
  /** Days away including both ends. */
  lengthDays: number;
  /** Days since the last day away; 1 the day after. */
  daysSince: number;
  /** Register entries only this person could run alone, so the business had to manage without them. */
  items: DebriefItem[];
}

/**
 * Leave that has ended and not been debriefed yet: for each register entry
 * only the returning person can run alone, who covered it and whether they
 * can now be promoted. Entries already covered by two people are left out
 * unless a hand-off is still open for them. Stops prompting after
 * `DEBRIEF_WINDOW_DAYS`, so old leave entered after the fact stays quiet.
 */
export function leaveDebriefs(
  tpl: IndustryTemplate,
  absences: readonly PlannedAbsence[],
  decisions: readonly DecisionEntry[],
  industry: IndustryId,
  today: string,
): LeaveDebrief[] {
  if (!isCalendarDate(today)) return [];
  const committed = continuityCommitments(decisions, tpl, today);
  const out: LeaveDebrief[] = [];
  for (const absence of absences) {
    if (absence.industry !== industry || absence.debriefedAt || absence.to >= today) continue;
    const daysSince = daysBetween(absence.to, today) ?? 0;
    if (daysSince > DEBRIEF_WINDOW_DAYS) continue;
    const person = tpl.people.find((p) => p.active && p.id === absence.personId);
    if (!person) continue;
    const impact = absenceImpact(tpl, [person.id]);
    if (!impact) continue;

    const items: DebriefItem[] = [];
    const seen = new Set<string>();
    const push = (item: KnowledgeItem, suggested: Person | null) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      const handoff = handoffCommitment(committed, item.id, absence.id);
      const named =
        (handoff?.decision.linkedPersonId &&
          tpl.people.find((p) => p.active && p.id === handoff.decision.linkedPersonId)) ||
        null;
      const standIn = named ?? suggested;
      const training = committed.get(continuityStepKey(item.id, "cover"))?.decision ?? null;
      items.push({
        item,
        standIn,
        standInLevel: standIn ? relationLevel(tpl.relations, standIn.id, item.id) : undefined,
        handoff: handoff?.decision ?? null,
        training,
      });
    };
    for (const stop of impact.stops) push(stop.item, stop.standIn);
    for (const item of impact.continues) {
      if (!handoffCommitment(committed, item.id, absence.id)) continue;
      const otherPrimary =
        tpl.people.find(
          (p) =>
            p.active &&
            p.id !== person.id &&
            STRONG_LEVELS.has(relationLevel(tpl.relations, p.id, item.id) ?? "aware"),
        ) ?? null;
      push(item, otherPrimary);
    }
    if (items.length === 0) continue;
    out.push({
      absence,
      person,
      lengthDays: (daysBetween(absence.from, absence.to) ?? 0) + 1,
      daysSince,
      items,
    });
  }
  out.sort(
    (a, b) => b.absence.to.localeCompare(a.absence.to) || a.person.name.localeCompare(b.person.name),
  );
  return out;
}

/** Whether the stand-in can already be counted on, so the only thing left is to close the hand-off. */
export function standInAlreadyStrong(entry: DebriefItem): boolean {
  return entry.standInLevel !== undefined && STRONG_LEVELS.has(entry.standInLevel);
}

/** "Chris covered PMS admin for 8 days; can he run it alone now?" */
export function describeDebriefItem(debrief: LeaveDebrief, entry: DebriefItem): string {
  const days = `${debrief.lengthDays} day${debrief.lengthDays === 1 ? "" : "s"}`;
  if (!entry.standIn) {
    return `Nobody was lined up for ${entry.item.name} for those ${days} — did someone step in?`;
  }
  const first = entry.standIn.name.split(" ")[0];
  if (standInAlreadyStrong(entry)) {
    return `${first} covered ${entry.item.name} for ${days} and the register already says they can run it alone.`;
  }
  return `${first} covered ${entry.item.name} for ${days}; can they run it alone now?`;
}

/** "Maya's back — Chris covered PMS admin for 8 days; can he run it alone now?" plus a count of the rest. */
export function describeDebrief(debrief: LeaveDebrief): string {
  const first = debrief.person.name.split(" ")[0];
  const lead = debrief.items[0];
  const more = debrief.items.length - 1;
  return `${first}'s back — ${describeDebriefItem(debrief, lead)}${more > 0 ? ` (and ${more} more ${more === 1 ? "entry" : "entries"} to debrief)` : ""}`;
}
