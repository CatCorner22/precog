import type { PracticeProfile } from "../practice-profile";

/**
 * Domain edits and the layout travel together through undo/redo;
 * `withMapSnapshot` (profile-actions) puts one back.
 */
export type MapSnapshot = Pick<PracticeProfile, "customProcesses" | "customPeople" | "mapLayout">;

export function captureMapSnapshot(profile: PracticeProfile): MapSnapshot {
  return {
    customProcesses: profile.customProcesses,
    customPeople: profile.customPeople,
    mapLayout: profile.mapLayout,
  };
}
