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
  addPastedRows,
  addRowsByTitle,
  confirmTitleDuties,
  pasteSummary,
  pastedRows,
  peopleWithTitleDuties,
  rowOwnsBusiness,
  rowSeat,
  sharedTitles,
  titleDutiesSentence,
  untickDutyForTitle,
  type OwnTeamRow,
} from "./own-team";
import type { EntitlementId } from "../sod/conflict-rules";

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

describe("setup grid: pasting, adding and reading titles", () => {
  const tpl = getBaseTemplate("general");
  const paste = (text: string, today = new Date("2026-09-22T00:00:00Z")) =>
    pastedRows(parseRoster(text, tpl, { today }), "general");

  it("pasting an updated roster updates the three people already in the table and adds only the new server", () => {
    const first = paste("Ana Ruiz, Office Manager\nBen Ochoa, Bookkeeper\nCal Diaz, Cashier");
    const typed: OwnTeamRow[] = [{ ...ownerRow(), name: "Olga Owner" }];
    const once = addPastedRows(typed, first.rows);
    const second = paste(
      "Ana Ruiz, Office Manager\nBen Ochoa, Bookkeeper\nCal Diaz, Cashier\nDee Park, Server",
    );
    const twice = addPastedRows(once.rows, second.rows);
    expect(twice.rows.map((r) => r.name)).toEqual([
      "Olga Owner",
      "Ana Ruiz",
      "Ben Ochoa",
      "Cal Diaz",
      "Dee Park",
    ]);
    expect(twice.added.map((r) => r.name)).toEqual(["Dee Park"]);
    expect(twice.matched).toBe(3);
    const { note } = pasteSummary({
      added: twice.added.length,
      matched: twice.matched,
      notAdded: twice.notAdded,
      dropped: 0,
      recognised: 4,
      partial: 0,
      unmatched: 0,
      inactiveNames: [],
      ownerRow: "none",
      onLeaveNames: [],
    });
    expect(note).toMatch(
      /^Added 1 person; 3 people already in the table were updated, not added again\./,
    );
  });

  it("an owner who typed 'Dale Hutchins' and pastes a QuickBooks list with 'Hutchins, Dale' appears once", () => {
    const typed: OwnTeamRow[] = [{ ...ownerRow(), name: "Dale Hutchins" }];
    const { rows } = paste('Employee,Job Title\n"Hutchins, Dale",Owner\n"Smith, Jo",Bookkeeper');
    const { kept } = rowsKeptForAdding(typed, true);
    const outcome = addPastedRows(kept, rows);
    expect(outcome.rows.map((r) => r.name)).toEqual(["Dale Hutchins", "Jo Smith"]);
    expect(outcome.matched).toBe(1);
    expect(outcome.rows.filter((r) => rowOwnsBusiness(r))).toHaveLength(1);
  });

  it("a 5,000-row HR export is counted in full, names the 250-row read limit and stays in the box", () => {
    const lines = ["Name,Title,Status,Hire Date"];
    for (let i = 0; i < 5000; i++) lines.push(`Person${i} Test${i},Cashier,Active,01/01/2020`);
    const result = parseRoster(lines.join("\n"), tpl);
    const { rows } = pastedRows(result, "general");
    const { kept } = rowsKeptForAdding([ownerRow()], false);
    const outcome = addPastedRows(kept, rows);
    expect(outcome.rows).toHaveLength(OWN_TEAM_MAX);
    const summary = pasteSummary({
      added: outcome.added.length,
      matched: outcome.matched,
      notAdded: outcome.notAdded,
      dropped: result.dropped ?? 0,
      recognised: outcome.added.length,
      partial: 0,
      unmatched: 0,
      inactiveNames: [],
      ownerRow: "kept",
      onLeaveNames: [],
    });
    expect(summary.note).toContain("Added 59 of the 5,000 people.");
    expect(summary.note).toContain("one paste reads the first 250 rows");
    expect(summary.note).toContain("this table holds 60 people");
    expect(summary.note).toContain("How work flows > Build > Team");
    expect(summary.keepPaste).toBe(true);
  });

  it("a paste into a full 60-person table adds nobody, keeps the paste and points to the team editor", () => {
    const full: OwnTeamRow[] = Array.from({ length: OWN_TEAM_MAX }, (_, i) => ({
      name: `Staff ${i + 1}`,
      role: "Cashier",
      duties: ["collect_cash"],
    }));
    const { rows } = paste("Extra One, Cashier\nExtra Two, Cashier");
    const outcome = addPastedRows(full, rows);
    expect(outcome.rows).toHaveLength(OWN_TEAM_MAX);
    expect(outcome.notAdded).toBe(2);
    const summary = pasteSummary({
      added: 0,
      matched: 0,
      notAdded: outcome.notAdded,
      dropped: 0,
      recognised: 0,
      partial: 0,
      unmatched: 0,
      inactiveNames: [],
      ownerRow: "kept",
      onLeaveNames: [],
    });
    expect(summary.note).toMatch(/^Added none of the 2 people\./);
    expect(summary.note).not.toContain("Owner row");
    expect(summary.note).toContain("How work flows > Build > Team");
    expect(summary.note).not.toContain("Who controls what");
    expect(summary.keepPaste).toBe(true);
    // "Add 5 people" by title adds nobody either, and says why.
    expect(addRowsByTitle(full, jobCatalogEntry("bookkeeper")!, 5, "general")).toMatchObject({
      added: 0,
      notAdded: 5,
    });
  });

  it("a terminated cashier left out of the paste is named, and a person on leave is kept", () => {
    const { rows, inactiveNames } = paste(
      "Name,Title,Status\nAna Morales,Client Service Representative,Inactive - Leave of Absence\nBo Chen,Cashier,Terminated\nCy Dunn,Bookkeeper,Active",
    );
    expect(rows.map((r) => r.name)).toEqual(["Ana Morales", "Cy Dunn"]);
    expect(inactiveNames).toEqual(["Bo Chen"]);
    const { note } = pasteSummary({
      added: 2,
      matched: 0,
      notAdded: 0,
      dropped: 0,
      recognised: 2,
      partial: 0,
      unmatched: 0,
      inactiveNames,
      ownerRow: "kept",
      onLeaveNames: ["Ana Morales"],
    });
    expect(note).toContain("1 person marked inactive was left out: Bo Chen.");
    expect(note).toContain("Ana Morales is on leave");
  });

  it("adding one more server after removing Server 2 gives Server 4, not a second Server 3", () => {
    const server = jobCatalogEntry("server")!;
    const three = addRowsByTitle([ownerRow()], server, 3, "restaurant").rows;
    const withoutTwo = three.filter((r) => r.name !== "Server 2");
    const next = addRowsByTitle(withoutTwo, server, 1, "restaurant").rows;
    expect(next.map((r) => r.name)).toEqual(["", "Server 1", "Server 3", "Server 4"]);
  });

  it("unticks write-off approval for all 13 physical therapists in one step", () => {
    const rows: OwnTeamRow[] = [
      ...Array.from({ length: 13 }, (_, i) => ({
        name: `PT ${i + 1}`,
        role: i === 0 ? "Physical Therapist " : "Physical Therapist",
        duties: ["approve_writeoffs", "collect_cash"] as EntitlementId[],
      })),
      { name: "Bea Billing", role: "Billing Manager", duties: ["approve_writeoffs"] },
    ];
    expect(sharedTitles(rows)).toEqual([{ role: "Physical Therapist", count: 13 }]);
    const result = untickDutyForTitle(rows, "physical therapist", "approve_writeoffs");
    expect(result.changed).toBe(13);
    expect(result.rows.slice(0, 13).every((r) => !r.duties.includes("approve_writeoffs"))).toBe(
      true,
    );
    expect(result.rows[0].duties).toEqual(["collect_cash"]);
    expect(result.rows[13].duties).toEqual(["approve_writeoffs"]);
  });

  it("shows which catalog seat each title was read as, and marks a partial match", () => {
    const { rows } = paste(
      "Name,Title,Location\nAna Ruiz,Bookkeeper,Larkspur - Maple Ave\nBo Park,Senior Paralegal (Part-Time),Riverside\nCy Dunn,Chief Vibes Officer,Riverside",
    );
    expect(rows[0].department).toBe("Larkspur - Maple Ave");
    expect(rowSeat(rows[0], "general")).toEqual({ title: "Bookkeeper", partial: false });
    expect(rowSeat(rows[2], "general")).toEqual({ partial: false });
    // A title typed over the pasted one is read again.
    expect(rowSeat({ ...rows[0], role: "Office Manager" }, "general")?.title).toBe(
      jobCatalogEntry("office-manager")!.title,
    );
    expect(rowSeat({ role: "Owner / Office Manager" }, "general")?.partial).toBe(true);
    expect(rowSeat({ role: "  " }, "general")).toBeUndefined();
  });
});

describe("findings that rest on duties guessed from job titles", () => {
  it("marks people whose ticks are still the usual ones for their title, and nobody the owner changed", () => {
    const bookkeeper = rowsForJobTitle(jobCatalogEntry("bookkeeper")!, 1, [], "dental")[0];
    const cashier = rowsForJobTitle(jobCatalogEntry("cashier")!, 1, [], "dental")[0];
    const people = buildOwnTeam(
      [
        { ...ownerRow(), name: "Olga Owner" },
        { ...bookkeeper, name: "Ben Ochoa" },
        // The owner unticked one of the cashier's duties.
        { ...cashier, name: "Cal Diaz", duties: cashier.duties.slice(1) },
        // Typed by hand, with no title to guess from.
        { name: "Dee Park", role: "Chief Vibes Officer", duties: ["collect_cash"] },
        // A title the catalog cannot read ticks nothing, so nothing is guessed.
        {
          name: "Eve Ng",
          role: "Chief Vibes Officer",
          duties: [],
          suggestedFor: "Chief Vibes Officer",
        },
      ],
      "dental",
    );
    expect(people.map((p) => [p.name, p.dutiesFromTitle ?? false])).toEqual([
      ["Olga Owner", true],
      ["Ben Ochoa", true],
      ["Cal Diaz", false],
      ["Dee Park", false],
      ["Eve Ng", false],
    ]);
    expect(peopleWithTitleDuties(people).map((p) => p.name)).toEqual(["Olga Owner", "Ben Ochoa"]);
    expect(titleDutiesSentence(people)).toBe(
      "Duties for 2 of your 5 people are the usual ones for their job titles, not ones you confirmed.",
    );
  });

  it("a row whose title was changed after its duties were ticked is not marked", () => {
    const bookkeeper = rowsForJobTitle(jobCatalogEntry("bookkeeper")!, 1, [], "general")[0];
    const [person] = buildOwnTeam(
      [{ ...bookkeeper, name: "Ben Ochoa", role: "Controller" }],
      "general",
    );
    expect(person.dutiesFromTitle).toBeUndefined();
  });

  it("clears every mark once the owner says the duties are right", () => {
    const people = buildOwnTeam([{ ...ownerRow(), name: "Olga Owner" }], "general");
    expect(titleDutiesSentence(people)).toBe(
      "Duties for your one person are the usual ones for their job title, not ones you confirmed.",
    );
    const confirmed = confirmTitleDuties(people);
    expect(confirmed[0]).not.toHaveProperty("dutiesFromTitle");
    expect(titleDutiesSentence(confirmed)).toBe("");
  });
});
