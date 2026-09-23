import { getIndustryTemplate, type IndustryTemplate } from "../templates";
import type { PracticeProfile } from "../practice-profile";

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
  profile: Pick<PracticeProfile, "customPeople" | "customKnowledge" | "customRelations">,
): RegisterSource {
  if (profile.customKnowledge || (profile.customRelations?.length ?? 0) > 0) return "own";
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
  return tpl.knowledge !== getIndustryTemplate(tpl.id).knowledge;
}

/**
 * Freshness (when each item was last confirmed) is tracked only for a
 * register the owner filled in: the sample register carries no confirmation
 * dates, and an unassessed one has nothing to confirm.
 */
export function trackRegisterFreshness(
  profile: Pick<PracticeProfile, "customPeople" | "customKnowledge" | "customRelations">,
  tpl: Pick<IndustryTemplate, "id" | "knowledge" | "relations">,
): boolean {
  return registerSource(profile) !== "sample" && registerAssessed(tpl);
}
