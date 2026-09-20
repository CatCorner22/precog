import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { parsePeopleCsv, peopleToCsv } from "./people-csv";

const dental = getBaseTemplate("dental");

describe("parsePeopleCsv", () => {
  it("handles aliases, quoted commas, CRLF, BOM, labels, aliases, unknowns, and inactive values", () => {
    const csv =
      "\uFEFFFULL NAME,JOB TITLE,Years of Service,Employed,Duties\r\n" +
      '"Doe, Jane",office manager,2.5,no,"Take payment from customers|payroll|mystery"\r\n';

    const result = parsePeopleCsv(csv, dental);

    expect(result.people).toEqual([
      {
        id: "p-doe-jane",
        name: "Doe, Jane",
        role: "Office Manager",
        active: false,
        tenureYears: 2.5,
        entitlements: ["collect_cash", "enter_payroll"],
      },
    ]);
    expect(result.unknownEntitlements).toEqual(["mystery"]);
    expect(result.issues).toEqual([{ row: 1, message: "Unknown entitlement(s): mystery" }]);
  });

  it("canonicalizes roles and deduplicates ids", () => {
    const result = parsePeopleCsv(
      "name,role,active\nAlex Smith,office manager,true\nAlex Smith,Office Manager,true",
      dental,
    );

    expect(result.people.map((person) => [person.id, person.role])).toEqual([
      ["p-alex-smith", "Office Manager"],
      ["p-alex-smith-2", "Office Manager"],
    ]);
  });

  it("reports a missing name column without importing rows", () => {
    expect(parsePeopleCsv("role,active\nManager,true", dental)).toEqual({
      people: [],
      issues: [{ row: 0, message: "Missing a name column" }],
      unknownEntitlements: [],
    });
  });

  it("truncates rows over maxRows", () => {
    const result = parsePeopleCsv("name\nOne\nTwo\nThree", dental, { maxRows: 2 });

    expect(result.people.map((person) => person.name)).toEqual(["One", "Two"]);
    expect(result.issues).toContainEqual({
      row: 3,
      message: "Import truncated to 2 rows",
    });
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
});
