import { describe, expect, it } from "vitest";
import { looksLikeRosterHeader, mapColumns, startsWithColumnHeading } from "./roster-columns";

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

describe("startsWithColumnHeading", () => {
  it("is true for a header without a name column and false for a person or a lone title", () => {
    expect(startsWithColumnHeading(["role", "active"])).toBe(true);
    expect(startsWithColumnHeading(["Employee #", "Title"])).toBe(true);
    expect(startsWithColumnHeading(["Ana Ruiz", "Owner"])).toBe(false);
    expect(startsWithColumnHeading(["Jose", "Staff"])).toBe(false);
    expect(startsWithColumnHeading(["Employees"])).toBe(false);
  });
});

describe("mapColumns", () => {
  it("never reads a preferred name as the whole name beside first and last name columns", () => {
    const columns = mapColumns(["Preferred Name", "First Name", "Last Name"], []);
    expect(columns.name).toBeUndefined();
    expect([columns.first, columns.last]).toEqual([1, 2]);
    expect(mapColumns(["Employee Name", "First Name", "Last Name"], []).name).toBe(0);
  });
});
