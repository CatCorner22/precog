import { describe, expect, it } from "vitest";
import { defaultProfile } from "./practice-profile";
import { industryMeta } from "./industry";
import {
  isMapCustomized,
  makeMapVersion,
  MAX_DECISIONS,
  withDecision,
  withRosterLeavers,
  withIndustry,
  withMapHealth,
  withMapSnapshot,
  withPeople,
  withPracticeName,
  withReportSent,
  withRestoredVersion,
  withStaff,
} from "./profile-actions";
import { captureMapSnapshot } from "./builder/map-history";
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

describe("withRosterLeavers", () => {
  it("does not treat someone on the team as a leaver when the roster drops the accents", () => {
    const p = defaultProfile("dental");
    const people = [
      { id: "p1", name: "José Pérez", role: "Office manager" },
    ] as unknown as Person[];
    const next = withRosterLeavers(p, people, [{ name: "Jose Perez" }], "2026-09-26");
    expect(next.leaverAccessChecks ?? []).toHaveLength(0);
  });
});

describe("undo, redo and restoring a saved version", () => {
  const teamA: Person[] = [
    {
      id: "a",
      name: "Ana",
      role: "Owner",
      active: true,
      owner: true,
      entitlements: ["approve_payroll"],
    },
    { id: "b", name: "Ben", role: "Clerk", active: true, entitlements: ["post_payments"] },
    { id: "c", name: "Cy", role: "Bookkeeper", active: true, entitlements: ["bank_reconcile"] },
  ];
  const teamB: Person[] = [
    teamA[0],
    {
      ...teamA[1],
      entitlements: [
        "post_payments",
        "bank_reconcile",
        "create_vendor",
        "release_payment",
        "sign_checks",
      ],
    },
  ];
  const figures = (p: ReturnType<typeof defaultProfile>) => ({
    teamSize: p.staff.teamSize,
    segregationScore: p.staff.segregationScore,
    independentBankRec: p.staff.independentBankRec,
  });

  it("re-derives the staff figures from the team that comes back", () => {
    const withA = withPeople(defaultProfile("general"), teamA, "2026-09-25");
    const withB = withPeople(withA, teamB, "2026-09-25");
    expect(figures(withB)).not.toEqual(figures(withA));

    const undone = withMapSnapshot(withB, captureMapSnapshot(withA), "2026-09-25");
    expect(undone.customPeople?.map((p) => p.name)).toEqual(["Ana", "Ben", "Cy"]);
    expect(figures(undone)).toEqual(figures(withA));

    const restored = withRestoredVersion(withB, makeMapVersion(withA, "A", 50), "2026-09-25");
    expect(figures(restored)).toEqual(figures(withA));
  });

  it("applies the nonprofit owner rule to a restored team", () => {
    const nonprofit = withPeople(defaultProfile("nonprofit"), teamA, "2026-09-25");
    const version = { ...makeMapVersion(nonprofit, "v", 50), people: teamA };
    const restored = withRestoredVersion(nonprofit, version, "2026-09-25");
    expect(restored.customPeople?.some((p) => p.owner)).toBe(false);
  });
});

describe("small edits", () => {
  it("writes leaverAccessChecks only when a departure added one", () => {
    const p = defaultProfile("general");
    delete p.leaverAccessChecks;
    const team: Person[] = [
      { id: "a", name: "Ada", role: "Owner", active: true, owner: true, entitlements: [] },
    ];
    expect("leaverAccessChecks" in withPeople(p, team, "2026-09-25")).toBe(false);
  });

  it("keeps the first report-sent stamp", () => {
    const sent = withReportSent(defaultProfile("general"), NOW);
    expect(sent.engagement?.reportSentAt).toBe(NOW.toISOString());
    expect(withReportSent(sent, new Date("2026-10-01T00:00:00Z"))).toBe(sent);
  });

  it("does not treat someone on the team as a leaver when the roster spaces the name differently", () => {
    const people = [{ id: "p1", name: "Jordan  Lee", role: "Cook" }] as unknown as Person[];
    const next = withRosterLeavers(
      defaultProfile("general"),
      people,
      [{ name: "Jordan Lee" }],
      "2026-09-26",
    );
    expect(next.leaverAccessChecks ?? []).toHaveLength(0);
  });
});
