import type { Person } from "./types";

/**
 * Where a business's people came from.
 *
 * - "sample": the industry sample's people, as nothing of the owner's has
 *   been entered.
 * - "own": the owner entered a team, even one they have since emptied.
 *
 * Every screen and engine that asks "sample or own?" asks here, so they all
 * agree. A check that goes on to read the people themselves still narrows
 * `customPeople` directly (see builder/map-state).
 */
export type TeamSource = "sample" | "own";

export function teamSource(profile: { customPeople?: readonly Person[] | null }): TeamSource {
  return profile.customPeople == null ? "sample" : "own";
}
