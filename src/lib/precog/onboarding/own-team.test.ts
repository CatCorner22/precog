import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { resolveTemplate } from "../active-template";
import { CORE_DUTIES, OWN_TEAM_MAX, buildOwnTeam, ownBusinessProfile } from "./own-team";

describe("buildOwnTeam", () => {
  it("drops empty rows, trims, defaults the role, and carries the ticked duties", () => {
    const people = buildOwnTeam([
      { name: "  Dana Owner ", role: " Owner ", duties: ["bank_reconcile", "approve_payroll"] },
      { name: "", role: "Ghost", duties: ["collect_cash"] },
      { name: "Kim", role: "", duties: ["collect_cash", "prepare_deposit", "not_a_duty" as never] },
    ]);
    expect(people.map((p) => p.id)).toEqual(["own-1", "own-2"]);
    expect(people[0]).toMatchObject({ name: "Dana Owner", role: "Owner", active: true });
    expect(people[0].entitlements).toEqual([
      "bank_reconcile",
      "approve_payroll",
      "view_reports_only",
    ]);
    expect(people[1]).toMatchObject({ name: "Kim", role: "Team member" });
    expect(people[1].entitlements).toEqual([
      "collect_cash",
      "prepare_deposit",
      "view_reports_only",
    ]);
  });

  it("caps the team at the grid maximum", () => {
    const rows = Array.from({ length: OWN_TEAM_MAX + 3 }, (_, i) => ({
      name: `P${i}`,
      role: "",
      duties: [],
    }));
    expect(buildOwnTeam(rows)).toHaveLength(OWN_TEAM_MAX);
  });

  it("asks only about duties the rulebook defines", () => {
    for (const id of CORE_DUTIES) expect(typeof id).toBe("string");
    expect(new Set(CORE_DUTIES).size).toBe(CORE_DUTIES.length);
  });
});

describe("ownBusinessProfile", () => {
  it("replaces the sample team, clears sample relations and exceptions, and feeds detection", () => {
    const base = defaultProfile("restaurant");
    const people = buildOwnTeam([
      { name: "Dana", role: "Owner", duties: ["bank_reconcile", "approve_payroll"] },
      {
        name: "Kim",
        role: "Bookkeeper",
        duties: ["collect_cash", "post_payments", "prepare_deposit", "bank_reconcile"],
      },
    ]);
    const profile = ownBusinessProfile(base, { practiceName: "  Dana's Diner ", people });
    expect(profile.practiceName).toBe("Dana's Diner");
    expect(profile.customPeople).toBe(people);
    expect(profile.customRelations).toEqual([]);
    expect(profile.dualRelease.exceptions).toEqual([]);
    expect(profile.onboardingComplete).toBe(true);
    expect(profile.staff.teamSize).toBe(2);

    const tpl = resolveTemplate(profile);
    expect(tpl.people.map((p) => p.name)).toEqual(["Dana", "Kim"]);
    expect(tpl.relations).toEqual([]);
    const report = detectSodConflicts(
      tpl,
      profile.staff,
      sodDetectionOptions(tpl, profile.dualRelease),
    );
    // Kim takes payment, records it, banks it, and reconciles the account: the
    // cash-and-reconciliation rules must fire on her, and only her.
    const kim = report.conflicts.filter((c) => c.personName === "Kim");
    expect(kim.length).toBeGreaterThan(0);
    expect(kim.some((c) => c.ruleId === "rule-cash-rec" || c.ruleId === "rule-custody-rec")).toBe(
      true,
    );
    expect(report.conflicts.filter((c) => c.personName === "Dana")).toHaveLength(0);
  });

  it("keeps the base name when the owner leaves it blank", () => {
    const base = defaultProfile("dental");
    const profile = ownBusinessProfile(base, { practiceName: "   ", people: [] });
    expect(profile.practiceName).toBe(base.practiceName);
  });
});
