import { getIndustryTemplate, type IndustryTemplate } from "../templates";
import type { PracticeProfile } from "../practice-profile";
import type { IndustryId } from "../industry";
import type { KnowledgeItem } from "../types";

/**
 * What an item says, without when it was last confirmed: marking and then
 * unmarking someone stamps a confirmation date, which is not a change to the
 * list itself.
 */
function itemContent(item: KnowledgeItem): string {
  return JSON.stringify([
    item.id,
    item.name,
    item.criticality,
    item.category,
    item.kind ?? "",
    Boolean(item.documented),
    item.procedureLocation ?? "",
  ]);
}

/** True when a list says exactly what the industry's starter list says. */
export function isStarterList(knowledge: readonly KnowledgeItem[], industry: IndustryId): boolean {
  const starter = getIndustryTemplate(industry).knowledge;
  if (knowledge === starter) return true;
  if (knowledge.length !== starter.length) return false;
  return knowledge.every((item, i) => itemContent(item) === itemContent(starter[i]));
}

/**
 * Where the duty, task and know-how register came from.
 *
 * - "sample": the demo team with the demo register (no own people entered).
 * - "starter": the owner's own people over the industry's starter list, with
 *   nobody marked on any item yet. The list is a starting point, not a fact
 *   about the business.
 * - "own": the owner wrote their own list, or marked people on the starter list.
 */
export type RegisterSource = "sample" | "starter" | "own";

export function registerSource(
  profile: Pick<
    PracticeProfile,
    "industry" | "customPeople" | "customKnowledge" | "customRelations"
  >,
): RegisterSource {
  if ((profile.customRelations?.length ?? 0) > 0) return "own";
  // A copy of the starter list (after marking and unmarking someone, or a
  // re-import of the unmarked starter export) is still the starter list.
  if (profile.customKnowledge && !isStarterList(profile.customKnowledge, profile.industry)) {
    return "own";
  }
  return profile.customPeople ? "starter" : "sample";
}

/**
 * Whether the continuity figures (backed up, single points, written down,
 * confirmed recently) describe a register someone has filled in.
 *
 * An empty list would score 100 percent backed up, and the industry's
 * starter list with nobody marked would score every item as a single point
 * with nobody. Neither is a fact about the business, so the figures wait
 * until the register holds at least one item and either someone is marked
 * on an item or the owner has written the list themselves (a list the owner
 * wrote with nobody marked is their register as it stands).
 */
export function registerAssessed(
  tpl: Pick<IndustryTemplate, "id" | "knowledge" | "relations">,
): boolean {
  if (tpl.knowledge.length === 0) return false;
  if (tpl.relations.length > 0) return true;
  return !isStarterList(tpl.knowledge, tpl.id);
}

/**
 * Freshness (when each item was last confirmed) is tracked only for a
 * register the owner filled in: the sample register carries no confirmation
 * dates, and an unassessed one has nothing to confirm.
 */
export function trackRegisterFreshness(
  profile: Pick<
    PracticeProfile,
    "industry" | "customPeople" | "customKnowledge" | "customRelations"
  >,
  tpl: Pick<IndustryTemplate, "id" | "knowledge" | "relations">,
): boolean {
  return registerSource(profile) !== "sample" && registerAssessed(tpl);
}
