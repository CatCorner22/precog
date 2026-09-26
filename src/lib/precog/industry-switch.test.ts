import { afterEach, describe, expect, it, vi } from "vitest";
import { getBaseTemplate } from "./active-template";
import { defaultProfile, normalizeProfile, type PracticeProfile } from "./practice-profile";
import { withPeople, withStaff } from "./profile-actions";
import type { Person } from "./types";
import { describeEnteredWork, enteredWork, hasEnteredWork } from "./industry-switch";
import { joinWithAnd } from "./text";

const tpl = getBaseTemplate("dental");

describe("enteredWork", () => {
  afterEach(() => vi.useRealTimers());

  it("does not mark an untouched business as edited once the calendar moves on", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    const created = defaultProfile("dental");
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));
    const work = enteredWork(created);
    expect(work.settings).toBe(false);
    expect(hasEnteredWork(work)).toBe(false);

    const toggled = {
      ...created,
      dualRelease: {
        ...created.dualRelease,
        exceptions: created.dualRelease.exceptions.map((e, i) =>
          i === 0 ? { ...e, enabled: !e.enabled } : e,
        ),
      },
    };
    expect(enteredWork(toggled).settings).toBe(true);

    const windowed = created.dualRelease.exceptions.findIndex((e) => e.effectiveTo);
    expect(windowed).toBeGreaterThanOrEqual(0);
    const moved = {
      ...created,
      dualRelease: {
        ...created.dualRelease,
        exceptions: created.dualRelease.exceptions.map((e, i) =>
          i === windowed ? { ...e, effectiveTo: "2026-07-31" } : e,
        ),
      },
    };
    expect(enteredWork(moved).settings).toBe(true);
    const opened = {
      ...created,
      dualRelease: {
        ...created.dualRelease,
        exceptions: created.dualRelease.exceptions.map((e, i) =>
          i === windowed ? { ...e, effectiveFrom: undefined } : e,
        ),
      },
    };
    expect(enteredWork(opened).settings).toBe(true);
  });

  it("reports nothing to lose on a fresh template profile", () => {
    const work = enteredWork(defaultProfile("dental"));
    expect(hasEnteredWork(work)).toBe(false);
    expect(describeEnteredWork(work)).toEqual([]);
    expect(joinWithAnd([])).toBe("");
  });

  it("counts the team, register, leave and map work an industry switch would discard", () => {
    const p = defaultProfile("dental");
    p.customPeople = tpl.people.slice(0, 4);
    p.customKnowledge = tpl.knowledge.slice(0, 3);
    p.customRelations = tpl.relations.slice(0, 12);
    p.plannedAbsences = [
      {
        id: "abs1",
        personId: tpl.people[0].id,
        industry: "dental",
        from: "2026-09-21",
        to: "2026-09-21",
        unplanned: true,
      },
    ];
    const work = enteredWork(p);
    expect(hasEnteredWork(work)).toBe(true);
    expect(describeEnteredWork(work)).toEqual(["4 people", "12 who-holds-it marks", "1 absence"]);
    expect(joinWithAnd(describeEnteredWork(work))).toBe(
      "4 people, 12 who-holds-it marks and 1 absence",
    );
  });

  it("treats a cleared override, pinned map positions and moved settings as work to lose", () => {
    const cleared = defaultProfile("dental");
    cleared.customKnowledge = [];
    cleared.customRelations = [];
    cleared.customProcesses = [];
    expect(describeEnteredWork(enteredWork(cleared))).toEqual([
      "a cleared register",
      "a cleared process map",
    ]);

    const pinned = defaultProfile("dental");
    pinned.mapLayout = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } };
    expect(describeEnteredWork(enteredWork(pinned))).toEqual(["2 pinned map positions"]);

    const tuned = defaultProfile("dental");
    tuned.staff = { ...tuned.staff, teamSize: tuned.staff.teamSize + 3 };
    const work = enteredWork(tuned);
    expect(work.settings).toBe(true);
    expect(hasEnteredWork(work)).toBe(true);
    expect(describeEnteredWork(work)).toEqual(["edited team and control settings"]);

    const risk = defaultProfile("dental");
    risk.riskVariables = {
      ...risk.riskVariables,
      hasDualControl: !risk.riskVariables.hasDualControl,
    };
    expect(enteredWork(risk).settings).toBe(true);
  });

  it("falls back to register items when only the item list was edited, and uses singular forms", () => {
    const p = defaultProfile("dental");
    p.customPeople = tpl.people.slice(0, 1);
    p.customKnowledge = tpl.knowledge.slice(0, 1);
    p.customProcesses = tpl.processes.slice(0, 1);
    expect(describeEnteredWork(enteredWork(p))).toEqual([
      "1 person",
      "1 register item",
      "1 process",
    ]);
    expect(joinWithAnd(["1 person", "1 process"])).toBe("1 person and 1 process");
  });
});

describe("enteredWork for an own business", () => {
  const team: Person[] = [
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

  it("claims no edited settings when the owner never moved one", () => {
    const own = withPeople(defaultProfile("general"), team, "2026-09-25");
    const work = enteredWork(own);
    expect(work.settings).toBe(false);
    expect(describeEnteredWork(work)).toEqual(["3 people"]);
    expect(enteredWork(normalizeProfile(JSON.parse(JSON.stringify(own)))).settings).toBe(false);
  });

  it("counts a figure the owner set by hand", () => {
    const own = withPeople(defaultProfile("general"), team, "2026-09-25");
    const tuned = withStaff(own, {
      ...own.staff,
      segregationScore: own.staff.segregationScore - 10,
    });
    expect(enteredWork(tuned).settings).toBe(true);
  });

  it("names the monthly closes, open leaver checks, reconciliation and dates an industry switch drops", () => {
    const p = {
      ...defaultProfile("dental"),
      monthlyReviews: [
        {
          key: "bank_rec",
          period: "2026-08",
          result: "done",
          ownerName: "Ana",
          notes: "",
          recordedAt: "2026-09-01",
        },
      ],
      leaverAccessChecks: [
        { id: "l1", name: "Bea", industry: "dental", notedOn: "2026-09-01", source: "marked" },
        {
          id: "l2",
          name: "Cal",
          industry: "dental",
          notedOn: "2026-09-01",
          source: "marked",
          confirmedOn: "2026-09-02",
        },
      ],
      accessReconciliation: { importedAt: "2026-09-01", source: "qbo", users: [], vendors: [] },
      engagement: { startedAt: "2026-08-01T00:00:00Z", reportSentAt: "2026-09-01T00:00:00Z" },
    } as unknown as PracticeProfile;
    const work = enteredWork(p);
    expect(hasEnteredWork(work)).toBe(true);
    expect(describeEnteredWork(work)).toEqual([
      "1 monthly close result",
      "1 open leaver check",
      "an access reconciliation",
      "the dates you started and sent the report",
    ]);
  });
});
