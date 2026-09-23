import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import {
  looksLikeRosterHeader,
  parsePeopleCsv,
  peopleToCsv,
  removedPeopleImpact,
} from "./people-csv";

const dental = getBaseTemplate("dental");
const BOM = String.fromCharCode(0xfeff);

describe("parsePeopleCsv", () => {
  it("handles aliases, quoted commas, CRLF, BOM, labels, aliases, unknowns, and inactive values", () => {
    const csv =
      `${BOM}FULL NAME,JOB TITLE,Years of Service,Employed,Duties\r\n` +
      '"Doe, Jane",office manager,2.5,no,"Take payment from customers|payroll|mystery"\r\n';

    const result = parsePeopleCsv(csv, dental);

    // A "Last, First" name is read as "First Last".
    expect(result.people).toEqual([
      {
        id: "p-jane-doe",
        name: "Jane Doe",
        role: "Office Manager",
        active: false,
        tenureYears: 2.5,
        entitlements: ["collect_cash", "enter_payroll"],
      },
    ]);
    expect(result.unknownEntitlements).toEqual(["mystery"]);
    expect(result.issues).toEqual([{ row: 1, message: "Unknown entitlement(s): mystery" }]);
  });

  it("canonicalizes roles, deduplicates ids, and flags one name with two titles", () => {
    const result = parsePeopleCsv(
      "name,role,active\nAlex Smith,office manager,true\nAlex Smith,Dentist,true",
      dental,
    );

    expect(result.people.map((person) => [person.id, person.role])).toEqual([
      ["p-alex-smith", "Office Manager"],
      ["p-alex-smith-2", "Dentist"],
    ]);
    expect(result.issues).toEqual([
      {
        row: 2,
        message:
          '"Alex Smith" appears twice with different titles; check whether this is one person',
      },
    ]);
    expect(result.duplicates).toBe(0);
  });

  it("skips a row that repeats an earlier name and title", () => {
    const result = parsePeopleCsv(
      "name,role,active\nAlex Smith,office manager,true\nAlex Smith,Office Manager,true",
      dental,
    );
    expect(result.people.map((person) => person.id)).toEqual(["p-alex-smith"]);
    expect(result.issues).toEqual([
      { row: 2, message: '"Alex Smith" appears twice; second copy skipped' },
    ]);
    expect(result.duplicates).toBe(1);
  });

  it("reports a missing name column without importing rows", () => {
    expect(parsePeopleCsv("role,active\nManager,true", dental)).toEqual({
      people: [],
      issues: [{ row: 0, message: "Missing a name column (header: role, active)" }],
      unknownEntitlements: [],
      titles: [],
      removed: [],
      skipped: 0,
      duplicates: 0,
      dropped: 0,
      onLeave: [],
    });
  });

  it("finds the header under a report title in a saved CSV file", () => {
    const result = parsePeopleCsv(
      'Employee Roster as of 09/01/2026\n\nEmployee Name,Job Title,Department,Status\n"Ruiz, Ana",Owner,Admin,Active\n"Ochoa, Ben",Bookkeeper,Finance,Active',
      dental,
    );
    expect(result.people.map((p) => [p.name, p.role])).toEqual([
      ["Ana Ruiz", "Owner"],
      ["Ben Ochoa", "Bookkeeper"],
    ]);
    expect(result.issues).toEqual([
      { row: 0, message: 'Skipped 1 line at the top: "Employee Roster as of 09/01/2026"' },
    ]);
    expect(result.skipped).toBe(1);
  });

  it("keeps the id of anyone already on the team so their register assignments survive", () => {
    const result = parsePeopleCsv(
      "name,role\n  maya   CHEN ,Office Manager\nJordan Blake,Front Desk Lead\nJordan Blake,Front Desk Lead\nNew Hire,Front Desk Lead",
      dental,
    );

    // The repeated Jordan Blake row is a duplicate and is skipped.
    expect(result.people.map((p) => p.id)).toEqual(["p2", "p3", "p-new-hire"]);
    expect(result.duplicates).toBe(1);
    expect(result.people[0].name).toBe("maya   CHEN");
    expect(result.removed.map((p) => p.id)).toEqual(
      dental.people.filter((p) => !["p2", "p3"].includes(p.id)).map((p) => p.id),
    );

    const tpl = resolveTemplate({ industry: "dental", customPeople: result.people });
    const before = dental.relations.filter((r) => r.personId === "p3");
    expect(before.length).toBeGreaterThan(0);
    expect(tpl.relations.filter((r) => r.personId === "p3")).toEqual(before);
    expect(tpl.relations.every((r) => ["p2", "p3"].includes(r.personId))).toBe(true);
    const owned = tpl.processes.flatMap((p) => p.ownerPersonIds ?? []);
    expect(owned).toContain("p3");
    expect(owned.every((id) => ["p2", "p3"].includes(id))).toBe(true);
  });

  it("counts what leaves with the people who are not in the file", () => {
    const removed = dental.people.filter((p) => p.id === "p3");
    expect(removedPeopleImpact(dental, removed)).toEqual({
      assignments: dental.relations.filter((r) => r.personId === "p3").length,
      processOwnerships: dental.processes.filter((p) => p.ownerPersonIds?.includes("p3")).length,
    });
    expect(removedPeopleImpact(dental, [])).toEqual({ assignments: 0, processOwnerships: 0 });
  });

  it("truncates rows over maxRows and counts the dropped rows", () => {
    const result = parsePeopleCsv("name\nOne\nTwo\nThree", dental, { maxRows: 2 });

    expect(result.people.map((person) => person.name)).toEqual(["One", "Two"]);
    expect(result.issues).toContainEqual({
      row: 3,
      message: "Read the first 2 rows; 1 more row was not read, because one import reads up to 2",
    });
    expect(result.dropped).toBe(1);
  });

  it("round-trips people through CSV", () => {
    const people = [
      {
        id: "p-jane-doe",
        name: "Jane Doe",
        role: "Office Manager",
        active: true,
        tenureYears: 4.5,
        entitlements: ["create_vendor", "release_payment"],
      },
      {
        id: "p-john-doe",
        name: "John Doe",
        role: "Front Desk Lead",
        active: false,
        tenureYears: undefined,
        entitlements: ["view_reports_only"],
      },
    ];

    expect(parsePeopleCsv(peopleToCsv(people), dental).people).toEqual(people);
  });

  it("carries each person's last day through export and import", () => {
    const people = [
      {
        id: "p-maya",
        name: "Maya Chen",
        role: "Office Manager",
        active: true,
        lastDay: "2026-10-14",
      },
      { id: "p-chris", name: "Chris Diaz", role: "Front Desk Lead", active: true },
    ];
    const csv = peopleToCsv(people);
    expect(csv.split(/\r?\n/)[0]).toBe(
      "name,role,department,tenure_years,active,last_day,entitlements",
    );
    const back = parsePeopleCsv(csv, { ...dental, people }).people;
    expect(back.find((p) => p.name === "Maya Chen")?.lastDay).toBe("2026-10-14");
    expect("lastDay" in (back.find((p) => p.name === "Chris Diaz") ?? {})).toBe(false);
  });

  it("keeps a matched person's last day when the file has no such column, and validates it when it does", () => {
    const team = [
      {
        id: "p-maya",
        name: "Maya Chen",
        role: "Office Manager",
        active: true,
        lastDay: "2026-10-14",
      },
    ];
    const tpl = { ...dental, people: team };
    expect(parsePeopleCsv("name,role\nMaya Chen,Office Manager", tpl).people[0].lastDay).toBe(
      "2026-10-14",
    );
    expect(
      "lastDay" in parsePeopleCsv("name,role,last day\nMaya Chen,Office Manager,", tpl).people[0],
    ).toBe(false);
    const bad = parsePeopleCsv("name,leaving date\nMaya Chen,next month", tpl);
    expect(bad.people[0].lastDay).toBe("2026-10-14");
    expect(bad.issues).toContainEqual({
      row: 1,
      message: "Last day not understood: next month",
    });
    expect(parsePeopleCsv("name,last_day\nMaya Chen,2026-12-01", tpl).people[0].lastDay).toBe(
      "2026-12-01",
    );
  });

  it("gives only the first duplicate row the matched person's id and last day", () => {
    const tpl = {
      ...dental,
      people: [
        {
          id: "p-maya",
          name: "Maya Chen",
          role: "Office Manager",
          active: true,
          lastDay: "2026-10-14",
        },
      ],
    };
    const { people } = parsePeopleCsv(
      "name,role\nMaya Chen,Office Manager\nMaya Chen,Hygienist",
      tpl,
    );
    expect(people.map((p) => p.id)).toEqual(["p-maya", "p-maya-chen"]);
    expect(people[0].lastDay).toBe("2026-10-14");
    expect("lastDay" in people[1]).toBe(false);
  });
});

describe("looksLikeRosterHeader", () => {
  it("accepts a name column, first and last name columns, or three cells of column words", () => {
    expect(looksLikeRosterHeader(["Employee Name", "Job Title"])).toBe(true);
    expect(looksLikeRosterHeader([" Employee Name ", " Job Title "])).toBe(true);
    expect(looksLikeRosterHeader(["Employee #", "First Name", "Last Name"])).toBe(true);
    expect(looksLikeRosterHeader(["Given name", "Family name"])).toBe(true);
    expect(looksLikeRosterHeader(["LName", "FName"])).toBe(true);
    expect(looksLikeRosterHeader(["Nom", "Prénom", "Poste"])).toBe(true);
    expect(looksLikeRosterHeader(["Payroll Name", "Position Description", "Home Department"])).toBe(
      true,
    );
    expect(looksLikeRosterHeader(["Roles", "Departments", "Locations"])).toBe(true);
    expect(
      looksLikeRosterHeader(["Payroll Nme", "Position ID", "Position Description", "Hire Date"]),
    ).toBe(true);
    expect(
      looksLikeRosterHeader([
        "EmployeeNum",
        "LName",
        "FName",
        "MiddleI",
        "IsHidden",
        "ClockStatus",
        "PhoneExt",
        "PayrollID",
      ]),
    ).toBe(true);
    expect(looksLikeRosterHeader(["Name", "Title", "Department"])).toBe(true);
  });

  it("rejects a person's row, a report title, and a row with too few column words", () => {
    for (const title of ["Team Member", "Staff", "Employee", "Worker", "Person"]) {
      expect(looksLikeRosterHeader(["Ana Ruiz", ` ${title}`])).toBe(false);
      expect(looksLikeRosterHeader(["Jose", title])).toBe(false);
      expect(looksLikeRosterHeader(["maria lopez", title])).toBe(false);
    }
    // A numbering first cell does not make a name column a person's row.
    expect(looksLikeRosterHeader(["#", "Employee"])).toBe(true);
    expect(looksLikeRosterHeader(["Ana Ruiz"])).toBe(false);
    expect(looksLikeRosterHeader(["Worker Report - as of 09/01/2026"])).toBe(false);
    expect(looksLikeRosterHeader(["role", "active"])).toBe(false);
    expect(looksLikeRosterHeader(["David Lee", "Cashier", "Store"])).toBe(false);
  });
});

describe("team export opened in a spreadsheet", () => {
  it("writes a name that starts a formula as text and reads it back unchanged", () => {
    const tpl = getBaseTemplate("general");
    const people = [
      {
        id: "x1",
        name: '=HYPERLINK("http://evil")',
        role: "@Clerk",
        active: true,
        entitlements: ["collect_cash"],
      },
    ];
    const csv = peopleToCsv(people);
    const line = csv.split(/\r?\n/)[1];
    expect(line.startsWith("\"'=HYPERLINK")).toBe(true);
    const back = parsePeopleCsv(csv, { ...tpl, people: [] });
    expect(back.people[0]?.name).toBe('=HYPERLINK("http://evil")');
  });
});
