import { describe, expect, it } from "vitest";
import type { RoleAssignment } from "@/lib/precog/sod/detect";
import { shownAssignment } from "./use-power-map-builder";

const person = (personId: string): RoleAssignment => ({
  personId,
  personName: personId,
  role: "Staff",
  entitlements: [],
});

describe("shownAssignment", () => {
  const assignments = [person("bookkeeper"), person("owner")];

  it("shows the person picked", () => {
    expect(shownAssignment(assignments, "owner")?.personId).toBe("owner");
  });

  it("shows the first person after Undo removes the modeled hire that was picked", () => {
    // The conflict tile and the resolution planner filter on this person's id,
    // not on the stale "sim-" id, so they describe the person on screen.
    const shown = shownAssignment(assignments, "sim-1");
    expect(shown?.personId).toBe("bookkeeper");
    const conflicts = [{ personId: "bookkeeper" }, { personId: "owner" }];
    expect(conflicts.filter((c) => c.personId === shown?.personId)).toHaveLength(1);
  });

  it("shows nobody on an empty map", () => {
    expect(shownAssignment([], "owner")).toBeUndefined();
  });
});
