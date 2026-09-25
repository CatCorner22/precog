import type { PracticeProfile } from "../practice-profile";

/** Domain edits and the layout travel together through undo/redo. */
export type MapSnapshot = Pick<PracticeProfile, "customProcesses" | "customPeople" | "mapLayout">;

export function captureMapSnapshot(profile: PracticeProfile): MapSnapshot {
  return {
    customProcesses: profile.customProcesses,
    customPeople: profile.customPeople,
    mapLayout: profile.mapLayout,
  };
}

/** Do not restore unrelated account, journal, or insurance state. */
export function applyMapSnapshot(profile: PracticeProfile, snapshot: MapSnapshot): PracticeProfile {
  return {
    ...profile,
    customProcesses: snapshot.customProcesses ?? null,
    customPeople: snapshot.customPeople ?? null,
    mapLayout: snapshot.mapLayout ?? {},
  };
}
