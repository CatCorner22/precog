import { jobCatalogEntry } from "./job-catalog";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import { parseRoster } from "../import/roster";
import {
  CORE_DUTIES,
  OWN_TEAM_MAX,
  addableDuties,
  buildOwnTeam,
  coreDutiesForTitle,
  firstUnnamedWithDuties,
  mergeTeamRows,
  onLeavePersonIds,
  ownerRow,
  suggestedDuties,
  placeholderNames,
  rowFromImportedPerson,
  ownBusinessProfile,
  OWN_BUSINESS_FALLBACK_NAME,
  rowsForJobTitle,
  rowsKeptForAdding,
  type OwnTeamRow,
} from "./own-team";

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
    // The sample business pre-accepts the payments-versus-reconciliation
    // control; an own business must not inherit that decision.
    expect(report.conflicts.some((c) => c.residualRiskAccepted)).toBe(false);
  });

  it("uses a neutral name, not the sample business's, when the owner leaves it blank", () => {
    const base = defaultProfile("dental");
    const profile = ownBusinessProfile(base, { practiceName: "   ", people: [] });
    expect(profile.practiceName).toBe(OWN_BUSINESS_FALLBACK_NAME);
    expect(profile.practiceName).not.toBe(base.practiceName);
  });
});

describe("rowsForJobTitle", () => {
  it("makes numbered placeholder rows with the title's core duties", () => {
    const server = jobCatalogEntry("server")!;
    const rows = rowsForJobTitle(server, 3, 2);
    expect(rows.map((r) => r.name)).toEqual(["Server 3", "Server 4", "Server 5"]);
    expect(rows[0]).toMatchObject({ role: "Server", duties: ["collect_cash"] });
  });

  it("bounds the count and carries every duty the title holds", () => {
    const controller = jobCatalogEntry("controller")!;
    expect(rowsForJobTitle(controller, 0)).toEqual([]);
    const [row] = rowsForJobTitle(controller, 1);
    expect(row.duties).toEqual(
      expect.arrayContaining(["release_payment", "bank_reconcile", "sign_checks"]),
    );
    expect(row.duties).toContain("post_journal_entries");
  });

  it("adds an office manager's reconciliation in a dental office, as the title match does", () => {
    const office = jobCatalogEntry("office-manager")!;
    expect(rowsForJobTitle(office, 1, 0, "dental")[0].duties).toContain("bank_reconcile");
    expect(rowsForJobTitle(office, 1, 0, "general")[0].duties).not.toContain("bank_reconcile");
  });
});

describe("grid rows from a roster", () => {
  it("carries tenure and department from a pasted roster into the people", () => {
    const [person] = buildOwnTeam([
      {
        name: "Ben Ochoa",
        role: "Office Manager",
        duties: ["post_payments"],
        tenureYears: 11.4,
        department: "Admin",
      },
    ]);
    expect(person).toMatchObject({ tenureYears: 11.4, department: "Admin" });
    const [bare] = buildOwnTeam([{ name: "Cal", role: "Front Desk", duties: [] }]);
    expect(bare).not.toHaveProperty("tenureYears");
    expect(bare).not.toHaveProperty("department");
  });

  it("starts the grid with an owner whose usual duties are ticked", () => {
    const row = ownerRow();
    expect(row.role).toBe("Owner");
    expect(row.duties).toEqual(expect.arrayContaining(["approve_payroll", "approve_writeoffs"]));
    // Reconciling the bank is left for the owner to tick: a bookkeeper usually does it.
    expect(row.duties).not.toContain("bank_reconcile");
    expect(row.suggestedFor).toBe("Owner");
    expect(coreDutiesForTitle("Chief Happiness Wrangler")).toEqual([]);
  });
});

describe("an own business's policy and staff flags", () => {
  it("reads dual-release approver roles off the owner's team and derives independent reconciliation", () => {
    const people = buildOwnTeam([
      { name: "Ana Ruiz", role: "Owner", duties: ["approve_payroll", "bank_reconcile"] },
      { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments", "release_payment"] },
    ]);
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz", people });
    const roles = new Set(
      profile.dualRelease.rules.flatMap((r) => [...r.firstApproverRoles, ...r.secondApproverRoles]),
    );
    expect([...roles].every((r) => r === "Owner" || r === "Office Manager")).toBe(true);
    expect(profile.dualRelease.exceptions).toEqual([]);
    expect(profile.staff.independentBankRec).toBe(true);
    const tangled = ownBusinessProfile(defaultProfile(), {
      practiceName: "Ruiz",
      people: buildOwnTeam([
        { name: "Ana Ruiz", role: "Owner", duties: ["approve_payroll"] },
        { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments", "bank_reconcile"] },
      ]),
    });
    expect(tangled.staff.independentBankRec).toBe(false);
  });
});

describe("the unnamed Owner row when people are added", () => {
  const fresh = (): OwnTeamRow[] => [
    ownerRow(),
    { name: "", role: "", duties: [] },
    { name: "", role: "", duties: [] },
  ];

  it("keeps the Owner row with its duties when a pasted roster or Add 3 Server has no owner", () => {
    const { kept, ownerRow: owner } = rowsKeptForAdding(fresh(), false);
    expect(owner).toBe("kept");
    expect(kept).toEqual([ownerRow()]);
  });

  it("lets an owner in the paste take the place of the empty Owner row", () => {
    const { kept, ownerRow: owner } = rowsKeptForAdding(fresh(), true);
    expect(owner).toBe("replaced");
    expect(kept).toEqual([]);
  });

  it("keeps named rows and unnamed rows with duties ticked, and drops empty ones", () => {
    const rows: OwnTeamRow[] = [
      { ...ownerRow(), name: "Dana" },
      { name: "", role: "Bookkeeper", duties: ["bank_reconcile"] },
      { name: "", role: "", duties: [] },
    ];
    const { kept, ownerRow: owner } = rowsKeptForAdding(rows, true);
    expect(owner).toBe("none");
    expect(kept.map((r) => r.role)).toEqual(["Owner", "Bookkeeper"]);
  });

  it("points at a row that finishing would drop with its duties", () => {
    expect(firstUnnamedWithDuties(fresh())).toBe(0);
    expect(firstUnnamedWithDuties([{ ...ownerRow(), name: "Dana" }, ...fresh().slice(1)])).toBe(-1);
  });
});

describe("duties beyond the grid columns", () => {
  it("offers every rulebook duty that is not a column, view-only, or already held", () => {
    const offered = addableDuties(["manage_user_access", "collect_cash"]);
    expect(offered).toContain("change_fee_schedule");
    expect(offered).toContain("pms_admin_roles");
    expect(offered).not.toContain("manage_user_access");
    expect(offered).not.toContain("view_reports_only");
    for (const column of CORE_DUTIES) expect(offered).not.toContain(column);
  });
});

describe("people on leave in a pasted roster", () => {
  it("gives the rows marked on leave the ids buildOwnTeam gives them", () => {
    const rows: OwnTeamRow[] = [
      { name: "", role: "", duties: [] },
      { name: "Rosa Alvarez", role: "Medical Assistant", duties: [] },
      { name: "Layla Haddad", role: "Medical Assistant - Float", duties: [], onLeave: true },
    ];
    const people = buildOwnTeam(rows);
    expect(onLeavePersonIds(rows)).toEqual(["own-2"]);
    expect(people.find((p) => p.id === "own-2")).toMatchObject({
      name: "Layla Haddad",
      active: true,
    });
  });
});

describe("long job titles", () => {
  it("keeps a real 46-character title whole and bounds a runaway one at 80", () => {
    const title = "Site Director / Physical Therapist - Riverside";
    const [site, runaway] = buildOwnTeam([
      { name: "Dana Ruiz", role: title, duties: [] },
      { name: "Lee Park", role: "x".repeat(200), duties: [] },
    ]);
    expect(site.role).toBe(title);
    expect(runaway.role).toHaveLength(80);
  });
});

describe("the owner's mark on the setup grid", () => {
  it("starts the first row marked and keeps the mark when the title becomes a profession", () => {
    const row = { ...ownerRow(), name: "Dr. Ana Ruiz", role: "Dentist" };
    expect(row.owner).toBe(true);
    const [owner] = buildOwnTeam([row]);
    expect(owner.owner).toBe(true);
  });

  it("keeps the owner's pairs owner-held for an owner titled 'Dentist'", () => {
    const people = buildOwnTeam([
      {
        name: "Dr. Ana Ruiz",
        role: "Dentist",
        duties: ["sign_checks", "bank_reconcile", "approve_vendor", "create_vendor"],
        owner: true,
      },
      { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments"] },
    ]);
    const tpl = resolveTemplate({ industry: "dental", customPeople: people });
    const conflicts = detectSodConflicts(tpl).conflicts.filter((c) => c.personId === "own-1");
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.every((c) => c.ownerHeld)).toBe(true);
  });

  it("reads the title when a pasted row carries no mark", () => {
    const [owner, partner] = buildOwnTeam([
      { name: "Ana Ruiz", role: "Owner / President", duties: [] },
      { name: "Lee Park", role: "Principal Accountant", duties: [] },
    ]);
    expect(owner.owner).toBe(true);
    expect(partner.owner).toBe(false);
  });
});

describe("suggestedDuties", () => {
  it("keeps the owner's usual duties when the owner calls their job 'Dentist'", () => {
    const owner = coreDutiesForTitle("Owner");
    expect(suggestedDuties("Dentist", true, "dental")).toEqual(expect.arrayContaining(owner));
    expect(suggestedDuties("Dentist", false, "dental")).toEqual(
      coreDutiesForTitle("Dentist", "dental"),
    );
  });
});

describe("own team from a pasted roster, round three", () => {
  const today = new Date("2026-09-22T00:00:00Z");

  it("numbers placeholder servers after the highest number in use, never reusing a name", () => {
    expect(placeholderNames("Server", 2, ["Server 1", "Server 3", "Ana Ruiz"])).toEqual([
      "Server 4",
      "Server 5",
    ]);
    expect(placeholderNames("Server", 1, [])).toEqual(["Server 1"]);
    expect(placeholderNames("Front Desk", 1, ["front desk 2"])).toEqual(["Front Desk 3"]);
    const server = jobCatalogEntry("server")!;
    expect(rowsForJobTitle(server, 2, ["Server 1", "Server 3"]).map((r) => r.name)).toEqual([
      "Server 4",
      "Server 5",
    ]);
    // A count still works as before.
    expect(rowsForJobTitle(server, 1, 2).map((r) => r.name)).toEqual(["Server 3"]);
  });

  it("fills the grid from the same roster pasted twice without doubling anyone", () => {
    const tpl = getBaseTemplate("general");
    const first = parseRoster(
      "Ana Ruiz, Office Manager\nBen Ochoa, Bookkeeper\nCal Diaz, Cashier",
      tpl,
    );
    const rows = first.people.map((p) => rowFromImportedPerson(p, "general"));
    rows[1] = { ...rows[1], duties: ["post_payments"] };
    const second = parseRoster(
      "Ana Ruiz, Office Manager\nBen Ochoa, Bookkeeper\nCal Diaz, Server\nDee Park, Server",
      tpl,
    );
    const merged = mergeTeamRows(
      [{ name: "Olga Owner", role: "Owner", duties: [] }, ...rows],
      second.people.map((p) => rowFromImportedPerson(p, "general")),
    );
    expect(merged.rows.map((r) => [r.name, r.role])).toEqual([
      ["Olga Owner", "Owner"],
      ["Ana Ruiz", "Office Manager"],
      ["Ben Ochoa", "Bookkeeper"],
      ["Cal Diaz", "Server"],
      ["Dee Park", "Server"],
    ]);
    expect(merged.added.map((r) => r.name)).toEqual(["Dee Park"]);
    expect(merged.updated.map((r) => r.name)).toEqual(["Cal Diaz"]);
    // Ben's title is unchanged, so the duties ticked by hand stay.
    expect(merged.rows[2].duties).toEqual(["post_payments"]);
  });

  it("matches a pasted row to the grid by employee id before the name", () => {
    const merged = mergeTeamRows(
      [
        { name: "Ana Ruiz", role: "Cashier", duties: ["collect_cash"], employeeId: "1001" },
        { name: "Ana Ruiz", role: "Cashier", duties: ["collect_cash"], employeeId: "1002" },
      ],
      [{ name: "Ana Ruiz", role: "Shift Lead", duties: ["prepare_deposit"], employeeId: "1002" }],
    );
    expect(merged.rows.map((r) => [r.employeeId, r.role])).toEqual([
      ["1001", "Cashier"],
      ["1002", "Shift Lead"],
    ]);
    expect(merged.added).toEqual([]);
  });

  it("keeps a Workday employee id and a notice-period last day from the paste on the saved person", () => {
    const tpl = getBaseTemplate("general");
    const result = parseRoster(
      "Employee ID\tWorker\tBusiness Title\tTermination Date\n1001\tAna Ruiz\tOffice Manager\t12/31/2026",
      tpl,
      { today },
    );
    const [person] = buildOwnTeam(result.people.map((p) => rowFromImportedPerson(p, "general")));
    expect(person).toMatchObject({ name: "Ana Ruiz", employeeId: "1001", lastDay: "2026-12-31" });
  });

  it("strips a right-to-left override from a name typed or pasted into the grid", () => {
    const people = buildOwnTeam([
      { name: "\u202EAdam Evans", role: "Bookkeeper\u200F", duties: ["bank_reconcile"] },
      { name: "\u202E", role: "Cashier", duties: ["collect_cash"] },
    ]);
    expect(people.map((p) => [p.id, p.name, p.role])).toEqual([
      ["own-1", "Adam Evans", "Bookkeeper"],
    ]);
  });
});
