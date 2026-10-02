import { describe, expect, it } from "vitest";
import { defaultProfile } from "./practice-profile";
import { withMapHealth, withPracticeName } from "./profile-actions";
import { profileReducer } from "./profile-reducer";

const STAMP = "2026-01-01T00:00:00.000Z";
const start = () => ({ ...defaultProfile("general"), updatedAt: STAMP });

describe("profileReducer", () => {
  it("swaps a loaded profile in without a stamp", () => {
    const loaded = { ...defaultProfile("retail"), updatedAt: "2025-05-05T00:00:00.000Z" };
    expect(profileReducer(start(), { load: loaded })).toBe(loaded);
  });

  it("adopts another tab's save only when no edit landed since it was read", () => {
    const state = start();
    const theirs = { ...state, practiceName: "Other tab" };
    expect(profileReducer(state, { adopt: theirs, ifState: state })).toBe(theirs);
    expect(profileReducer(state, { adopt: theirs, ifState: start() })).toBe(state);
  });

  it("stamps an owner's edit and keeps the same object for a no-op", () => {
    const state = start();
    const edited = profileReducer(state, (p) => withPracticeName(p, "Corner Bistro"));
    expect(edited.practiceName).toBe("Corner Bistro");
    expect(edited.updatedAt).not.toBe(STAMP);
    expect(profileReducer(state, (p) => p)).toBe(state);
  });

  it("records a derived map completeness point without stamping updatedAt", () => {
    const state = start();
    const now = new Date("2026-09-26T10:00:00Z");
    const next = profileReducer(state, { derive: (p) => withMapHealth(p, 74, now) });
    expect(next.mapCompletenessHistory?.map((point) => point.score)).toEqual([74]);
    expect(next.updatedAt).toBe(STAMP);
  });
});
