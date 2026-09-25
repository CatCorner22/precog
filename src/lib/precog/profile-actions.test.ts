import { describe, expect, it } from "vitest";
import { defaultProfile } from "./practice-profile";
import { industryMeta } from "./industry";
import {
  isMapCustomized,
  MAX_DECISIONS,
  withDecision,
  withIndustry,
  withMapHealth,
  withPeople,
  withPracticeName,
  withStaff,
} from "./profile-actions";
import type { Person } from "./types";

const NOW = new Date("2026-09-25T10:00:00Z");

describe("profile actions", () => {
  it("keeps a real name across an industry change but swaps a demo name", () => {
    const demo = defaultProfile("dental");
    expect(withIndustry(demo, "retail").practiceName).toBe(industryMeta("retail").demoName);
    const own = withPracticeName(demo, "Riverside Dental");
    expect(withIndustry(own, "retail").practiceName).toBe("Riverside Dental");
    expect(withIndustry(own, "retail").decisions).toBe(own.decisions);
  });

  it("adds decisions newest first and caps the journal", () => {
    let p = defaultProfile("general");
    for (let i = 0; i < MAX_DECISIONS + 5; i += 1) {
      p = withDecision(p, { subject: `s${i}`, kind: "monitor", note: "" }, `d${i}`, NOW);
    }
    expect(p.decisions).toHaveLength(MAX_DECISIONS);
    expect(p.decisions[0].id).toBe(`d${MAX_DECISIONS + 4}`);
  });

  it("collapses health points within a minute and ignores an unchanged score", () => {
    let p = withMapHealth(defaultProfile("general"), 50, NOW);
    p = withMapHealth(p, 60, new Date(NOW.getTime() + 30_000));
    expect(p.mapHealthHistory?.map((h) => h.score)).toEqual([60]);
    const same = withMapHealth(p, 60, new Date(NOW.getTime() + 120_000));
    expect(same).toBe(p);
    p = withMapHealth(p, 70, new Date(NOW.getTime() + 120_000));
    expect(p.mapHealthHistory?.map((h) => h.score)).toEqual([60, 70]);
  });

  it("notes a leaver when someone on the owner's team is marked as left", () => {
    const people: Person[] = [
      {
        id: "a",
        name: "Ada",
        role: "Owner",
        active: true,
        owner: true,
        entitlements: ["approve_invoices"],
      },
      { id: "b", name: "Bea", role: "Bookkeeper", active: true, entitlements: ["bank_reconcile"] },
    ];
    const withTeam = withPeople(defaultProfile("general"), people, "2026-09-25");
    expect(withTeam.customPeople?.map((x) => x.name)).toEqual(["Ada", "Bea"]);
    const left = withPeople(withTeam, [people[0], { ...people[1], active: false }], "2026-09-26");
    expect(left.leaverAccessChecks?.map((c) => [c.name, c.source])).toEqual([["Bea", "marked"]]);
    expect(isMapCustomized(left)).toBe(true);
  });

  it("marks a hand-set bank reconciliation flag as manual only for a real team", () => {
    const sample = defaultProfile("general");
    const flipped = withStaff(sample, {
      ...sample.staff,
      independentBankRec: !sample.staff.independentBankRec,
    });
    expect(flipped.staff.bankRecSource).toBe(sample.staff.bankRecSource);
    const own = withPeople(
      sample,
      [{ id: "a", name: "Ada", role: "Owner", active: true, owner: true, entitlements: [] }],
      "2026-09-25",
    );
    const ownFlipped = withStaff(own, {
      ...own.staff,
      independentBankRec: !own.staff.independentBankRec,
    });
    expect(ownFlipped.staff.bankRecSource).toBe("manual");
  });
});
