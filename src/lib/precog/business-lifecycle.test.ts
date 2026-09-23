import { describe, expect, it } from "vitest";
import { processesToEdit } from "./business-lifecycle";
import { ownBusinessProfile } from "./onboarding/own-team";
import { defaultProfile } from "./practice-profile";
import type { Person } from "./types";

const ownTeam: Person[] = [
  { id: "own-1", name: "Al Owner", role: "Owner", active: true, entitlements: ["approve_payroll"] },
  {
    id: "own-2",
    name: "Bea Books",
    role: "Bookkeeper",
    active: true,
    entitlements: ["bank_reconcile"],
  },
];

describe("the first edit to an owner's starter map", () => {
  it("carries no sample owner ids into the owner's saved map", () => {
    const own = ownBusinessProfile(defaultProfile("general"), {
      practiceName: "Own Co",
      people: ownTeam,
    });
    const ownIds = new Set(ownTeam.map((p) => p.id));
    const seeded = processesToEdit(own);
    expect(seeded.length).toBeGreaterThan(0);
    for (const process of seeded) {
      for (const id of process.ownerPersonIds ?? [])
        expect(ownIds.has(id), process.name).toBe(true);
    }
  });

  it("keeps the sample's owners while the sample team is in use", () => {
    const sample = defaultProfile("general");
    expect(processesToEdit(sample).some((p) => (p.ownerPersonIds ?? []).length > 0)).toBe(true);
  });

  it("starts from the owner's own map once there is one", () => {
    const own = ownBusinessProfile(defaultProfile("general"), {
      practiceName: "Own Co",
      people: ownTeam,
    });
    const custom = [{ ...processesToEdit(own)[0], name: "Warranty claims" }];
    expect(processesToEdit({ ...own, customProcesses: custom })).toBe(custom);
  });
});
