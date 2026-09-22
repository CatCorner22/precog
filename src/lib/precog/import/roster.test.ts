import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { parseHireDate, tenureFromHireDate } from "./people-csv";
import { parseRoster } from "./roster";

const general = getBaseTemplate("general");
const today = new Date("2026-09-22T00:00:00Z");

describe("parseRoster", () => {
  it("reads a Workday-style worker export with tabs, hire dates, and an active flag", () => {
    const text = [
      "Employee ID\tWorker\tBusiness Title\tJob Profile\tCost Center\tHire Date\tActive Status",
      "1001\tAna Ruiz\tOffice Manager\tOffice Manager\tAdmin\t03/15/2019\tYes",
      "1002\tBen Ochoa\tSenior Accounts Payable Specialist\tAP Specialist\tFinance\t7/1/2024\tYes",
      "1003\tCal Diaz\tCashier\tCashier\tStore 1\t2020-01-10\tNo",
    ].join("\n");
    const result = parseRoster(text, general, { today });
    expect(result.people.map((p) => p.id)).toEqual(["emp-1001", "emp-1002", "emp-1003"]);
    expect(result.people[0]).toMatchObject({
      name: "Ana Ruiz",
      role: "Office Manager",
      department: "Admin",
      active: true,
      tenureYears: 7.5,
    });
    expect(result.people[0].entitlements).toEqual(
      expect.arrayContaining(["post_payments", "release_payment", "enter_payroll"]),
    );
    expect(result.people[1].entitlements).toEqual(
      expect.arrayContaining(["enter_invoices", "create_vendor", "release_payment"]),
    );
    expect(result.people[2]).toMatchObject({
      active: false,
      entitlements: ["collect_cash", "view_reports_only"],
    });
    expect(result.titles.map((t) => t.catalogTitle)).toEqual([
      "Office Manager",
      "Accounts Payable Specialist",
      "Cashier / Sales Associate",
    ]);
    expect(result.issues).toEqual([]);
  });

  it("reads SAP SuccessFactors and Oracle HCM status wording", () => {
    const sap = parseRoster(
      "Person ID External,User ID,First Name,Last Name,Job Title,Department,Employment Status\n77,u77,Flo,Ng,Payroll Administrator,HR,Terminated\n",
      general,
      { today },
    );
    expect(sap.people[0]).toMatchObject({
      id: "emp-77",
      name: "Flo Ng",
      active: false,
      department: "HR",
    });
    expect(sap.people[0].entitlements).toContain("edit_payroll_master");
    const oracle = parseRoster(
      "Person Number,Display Name,Job Name,Position Name,Department Name,Assignment Status,Hire Date\n300,Dee Park,Staff Accountant,Accountant I,Finance,Active - Payroll Eligible,15-Mar-2021\n301,Eve Lam,Controller,Controller,Finance,Inactive - Payroll Eligible,01-JAN-19\n",
      general,
      { today },
    );
    expect(oracle.people[0]).toMatchObject({ name: "Dee Park", active: true, tenureYears: 5.5 });
    expect(oracle.people[0].entitlements).toContain("post_journal_entries");
    expect(oracle.people[1]).toMatchObject({ active: false });
    expect(oracle.people[1].entitlements).toContain("sign_checks");
  });

  it("reads a plain pasted list with commas, tabs, or dashes and no header", () => {
    const result = parseRoster(
      "Ana Ruiz, Office Manager\nBen Ochoa\tBookkeeper\nCal Diaz - Server\nDee Park - Chief Happiness Wrangler",
      general,
      { today },
    );
    expect(result.people.map((p) => p.name)).toEqual([
      "Ana Ruiz",
      "Ben Ochoa",
      "Cal Diaz",
      "Dee Park",
    ]);
    expect(result.people[2].entitlements).toEqual(["collect_cash", "view_reports_only"]);
    expect(result.people[3].entitlements).toBeUndefined();
    expect(result.issues).toEqual([
      {
        row: 4,
        message:
          'Title "Chief Happiness Wrangler" is not in the catalog; duties left for you to tick',
      },
    ]);
    expect(result.titles[3].title).toBe("Chief Happiness Wrangler");
    expect(result.titles[3].catalogTitle).toBeUndefined();
  });

  it("prefers listed duties over the catalog and template roles over both", () => {
    const result = parseRoster(
      "name,role,duties\nAna,Bookkeeper,bank rec\nBen,Operations Manager,\n",
      general,
      { today },
    );
    expect(result.people[0].entitlements).toEqual(["bank_reconcile"]);
    expect(result.people[1].entitlements).toBeUndefined();
    expect(result.titles[1]).toMatchObject({
      catalogTitle: "Operations Manager",
      confidence: "exact",
    });
  });

  it("parses the hire-date formats the common exports write", () => {
    expect(parseHireDate("2019-03-15")).toBe("2019-03-15");
    expect(parseHireDate("03/15/2019")).toBe("2019-03-15");
    expect(parseHireDate("3/5/19")).toBe("2019-03-05");
    expect(parseHireDate("15-Mar-2019")).toBe("2019-03-15");
    expect(parseHireDate("2019-03-15T00:00:00")).toBe("2019-03-15");
    expect(parseHireDate("March 2019")).toBeUndefined();
    expect(tenureFromHireDate("2019-03-15", today)).toBe(7.5);
    expect(tenureFromHireDate("2030-01-01", today)).toBe(0);
  });

  it("returns nothing for empty text", () => {
    expect(parseRoster("   ", general).people).toEqual([]);
  });
});
