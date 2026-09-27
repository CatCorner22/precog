import type { SetStateAction } from "react";
import type { PracticeProfile } from "./practice-profile";

export type ProfileAction =
  | SetStateAction<PracticeProfile>
  | { load: PracticeProfile }
  | { adopt: PracticeProfile; ifState: PracticeProfile }
  | { derive: (current: PracticeProfile) => PracticeProfile };

/**
 * Every owner's edit stamps `updatedAt` in state, not only in localStorage,
 * so the sign-in merge compares the real time of the last local edit against
 * the server row. A `{ load }` action swaps the profile in without a stamp. An
 * `{ adopt }` action (another tab's save) applies only when no edit has landed
 * since it was read, so it can never swallow one. A `{ derive }` action
 * records something the app worked out rather than something the owner did
 * (the map-health history), so it changes the profile without a stamp and
 * never reads as the owner's edit.
 */
export function profileReducer(state: PracticeProfile, action: ProfileAction): PracticeProfile {
  if (typeof action === "object" && action !== null) {
    if ("load" in action) return action.load;
    if ("adopt" in action) return state === action.ifState ? action.adopt : state;
    if ("derive" in action) return action.derive(state);
  }
  const next = typeof action === "function" ? action(state) : action;
  return next === state ? state : { ...next, updatedAt: new Date().toISOString() };
}
