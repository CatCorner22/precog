import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { parseHireDate, readHireDate, tenureFromHireDate } from "./people-csv";
import { parseRoster } from "./roster";

const general = getBaseTemplate("general");
const today = new Date("2026-09-22T00:00:00Z");
const T = "\t";

/** Tab-separated lines, as Workday pastes them. */
function tsv(...rows: string[][]): string {
  return rows.map((row) => row.join(T)).join("\n");
}

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
      expect.arrayContaining(["enter_invoices", "create_vendor"]),
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
    expect(result).toMatchObject({ skipped: 0, duplicates: 0, dropped: 0 });
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
    expect(oracle.people[1]).toMatchObject({ active: false, tenureYears: 7.7 });
    expect(oracle.people[1].entitlements).toContain("sign_checks");
    expect(oracle.issues).toEqual([]);
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

  it("prefers listed duties, then the catalog, and keeps a template role's duties only when the catalog has no match", () => {
    const result = parseRoster(
      "name,role,duties\nAna,Bookkeeper,bank rec\nBen,Operations Manager,\nCal,Owner,\n",
      general,
      { today },
    );
    expect(result.people[0].entitlements).toEqual(["bank_reconcile"]);
    // A title that is also a template role still reads through the catalog.
    expect(result.people[1].entitlements).toEqual(
      expect.arrayContaining(["approve_vendor", "approve_payroll", "order_supplies"]),
    );
    expect(result.titles[1]).toMatchObject({
      catalogTitle: "General / Operations Manager",
      confidence: "exact",
    });
    expect(result.people[2].entitlements).toContain("sign_checks");
    expect(result.titles[2].catalogTitle).toBe("Owner / Principal");
    expect(result.issues).toEqual([]);

    const custom = {
      ...general,
      roleTemplates: {
        ...general.roleTemplates,
        "Chief Happiness Wrangler": ["view_reports_only" as const],
      },
    };
    const fallback = parseRoster("name,role\nDee Park,Chief Happiness Wrangler", custom, { today });
    expect(fallback.people[0].role).toBe("Chief Happiness Wrangler");
    expect(fallback.people[0].entitlements).toBeUndefined();
    expect(fallback.titles[0]).toMatchObject({
      catalogTitle: "Chief Happiness Wrangler",
      confidence: "exact",
    });
    expect(fallback.issues).toEqual([]);
  });

  it("finds the header under a report title and skips a footer row", () => {
    const workday = parseRoster(
      [
        "Worker Report - as of 09/01/2026",
        "",
        tsv(
          [
            "Employee ID",
            "Worker",
            "Business Title",
            "Job Profile",
            "Cost Center",
            "Hire Date",
            "Active Status",
          ],
          ["1001", "Ruiz, Ana", "Owner", "Owner", "CC100 Leadership", "01/10/2012", "Yes"],
          [
            "1002",
            "Ochoa, Ben",
            "Office Manager",
            "Office Manager",
            "CC200 Admin",
            "03/15/2019",
            "Yes",
          ],
          ["1003", "Diaz, Cal", "Bookkeeper", "Bookkeeper", "CC300 Finance", "07/01/2024", "Yes"],
          ["1004", "Roe, Fay", "Cashier", "Cashier", "CC400 Store", "01/10/2020", "No"],
          ["Total", "", "", "", "", "", "4"],
        ),
      ].join("\n"),
      general,
      { today },
    );
    expect(workday.people.map((p) => [p.id, p.name, p.role, p.active, p.tenureYears])).toEqual([
      ["emp-1001", "Ana Ruiz", "Owner", true, 14.7],
      ["emp-1002", "Ben Ochoa", "Office Manager", true, 7.5],
      ["emp-1003", "Cal Diaz", "Bookkeeper", true, 2.2],
      ["emp-1004", "Fay Roe", "Cashier", false, 6.7],
    ]);
    expect(workday.issues).toEqual([
      { row: 0, message: 'Skipped 1 line at the top: "Worker Report - as of 09/01/2026"' },
      { row: 5, message: 'Skipped a footer row: "Total"' },
    ]);
    expect(workday.skipped).toBe(2);

    const excel = parseRoster(
      'Employee Roster as of 09/01/2026\n\nEmployee Name,Job Title,Department,Status\n"Ruiz, Ana",Owner,Admin,Active\n"Ochoa, Ben",Bookkeeper,Finance,Active',
      general,
      { today },
    );
    expect(excel.people.map((p) => [p.name, p.role, p.department])).toEqual([
      ["Ana Ruiz", "Owner", "Admin"],
      ["Ben Ochoa", "Bookkeeper", "Finance"],
    ]);
    expect(excel.issues).toEqual([
      { row: 0, message: 'Skipped 1 line at the top: "Employee Roster as of 09/01/2026"' },
    ]);
  });

  it("skips a repeated header row and Total, Count, Page and Report generated footer rows", () => {
    const repeated = parseRoster(
      "Employee Name,Job Title,Department,Status\nAna Ruiz,Owner,Admin,Active\nBen Ochoa,Office Manager,Admin,Active\nEmployee Name,Job Title,Department,Status\nCal Diaz,Bookkeeper,Finance,Active\nFay Roe,Cashier,Store,Terminated",
      general,
      { today },
    );
    expect(repeated.people.map((p) => p.name)).toEqual([
      "Ana Ruiz",
      "Ben Ochoa",
      "Cal Diaz",
      "Fay Roe",
    ]);
    expect(repeated.issues).toEqual([{ row: 3, message: "Skipped a repeated header row" }]);
    expect(repeated.skipped).toBe(1);

    const footers = parseRoster(
      "Employee Name,Job Title,Department,Status\nAna Ruiz,Owner,Admin,Active\nBen Ochoa,Office Manager,Admin,Active\nCal Diaz,Bookkeeper,Finance,Active\nTotal,,,3\nCount: 3,,,\nPage 1 of 1,,,\nReport generated 09/01/2026 by Ana Ruiz,,,",
      general,
      { today },
    );
    expect(footers.people.map((p) => p.name)).toEqual(["Ana Ruiz", "Ben Ochoa", "Cal Diaz"]);
    expect(footers.issues.map((i) => [i.row, i.message])).toEqual([
      [4, 'Skipped a footer row: "Total"'],
      [5, 'Skipped a footer row: "Count: 3"'],
      [6, 'Skipped a footer row: "Page 1 of 1"'],
      [7, 'Skipped a footer row: "Report generated 09/01/2026 by Ana Ruiz"'],
    ]);
    expect(footers.skipped).toBe(4);
  });

  it("treats a row of column words as a header and reports the missing name column", () => {
    const result = parseRoster(
      'Payroll Nme,Position ID,Position Description,Home Department,Position Status,Hire Date\n"Ruiz, Ana",ABC000001,Owner,100 - Admin,A,01/10/2012',
      general,
      { today },
    );
    expect(result.people).toEqual([]);
    expect(result.issues).toEqual([
      {
        row: 0,
        message:
          "Missing a name column (header: Payroll Nme, Position ID, Position Description, Home Department, Position Status, Hire Date)",
      },
    ]);
  });

  it("reads ADP, Open Dental, French, 7shifts and Paylocity column names", () => {
    const adp = parseRoster(
      'Payroll Name,Position ID,Position Description,Home Department,Position Status,Hire Date\n"Ruiz, Ana",ABC000001,Owner,100 - Admin,A,01/10/2012\n"Ochoa, Ben",ABC000002,Office Manager,100 - Admin,A,03/15/2019\n"Diaz, Cal",ABC000003,Bookkeeper,200 - Finance,L,07/01/2024\n"Roe, Fay",ABC000004,Cashier,300 - Store,T,01/10/2020',
      general,
      { today },
    );
    expect(adp.people.map((p) => [p.name, p.role, p.department, p.active, p.id])).toEqual([
      ["Ana Ruiz", "Owner", "100 - Admin", true, "emp-abc000001"],
      ["Ben Ochoa", "Office Manager", "100 - Admin", true, "emp-abc000002"],
      ["Cal Diaz", "Bookkeeper", "200 - Finance", true, "emp-abc000003"],
      ["Fay Roe", "Cashier", "300 - Store", false, "emp-abc000004"],
    ]);
    // ADP's L is leave: the person stays on the team and the note says so.
    expect(adp.onLeave).toEqual(["emp-abc000003"]);
    expect(adp.issues).toEqual([
      { row: 3, message: '"Cal Diaz" is on leave (status "L"); kept on the team' },
    ]);

    const openDental = parseRoster(
      "EmployeeNum,LName,FName,MiddleI,IsHidden,ClockStatus,PhoneExt,PayrollID\n1,Ruiz,Ana,M,0,Home,101,P1\n2,Ochoa,Ben,,0,Working,102,P2\n3,Diaz,Cal,,1,Home,103,P3",
      general,
      { today },
    );
    expect(openDental.people.map((p) => [p.name, p.active, p.id])).toEqual([
      ["Ana Ruiz", true, "emp-1"],
      ["Ben Ochoa", true, "emp-2"],
      ["Cal Diaz", false, "emp-3"],
    ]);

    const french = parseRoster(
      "Nom;Prénom;Poste;Service;Statut;Date d'entrée\nRuiz;Ana;Gérante;Direction;Actif;15/03/2019\nOchoa;Ben;Comptable;Finance;Actif;01/07/2024\nDiaz;Cal;Caissier;Magasin;Sorti;10/01/2020",
      general,
      { today },
    );
    expect(french.people.map((p) => [p.name, p.role, p.active, p.tenureYears])).toEqual([
      ["Ana Ruiz", "Gérante", true, 7.5],
      ["Ben Ochoa", "Comptable", true, 2.2],
      ["Cal Diaz", "Caissier", false, 6.7],
    ]);

    const shifts = parseRoster(
      'First Name,Last Name,Email,Roles,Departments,Locations,Wage Type,Active,Hire Date\nAna,Ruiz,ana@example.com,Owner,Management,Main St,Salary,Yes,01/10/2012\nBen,Ochoa,ben@example.com,"Server, Bartender",Front of House,Main St,Hourly,Yes,03/15/2019\nCal,Diaz,cal@example.com,Cook,Back of House,Main St,Hourly,Yes,07/01/2024\nFay,Roe,fay@example.com,Host,Front of House,Main St,Hourly,No,01/10/2020',
      general,
      { today },
    );
    expect(shifts.people.map((p) => [p.role, p.department, p.active])).toEqual([
      ["Owner", "Management", true],
      ["Server, Bartender", "Front of House", true],
      ["Cook", "Back of House", true],
      ["Host", "Front of House", false],
    ]);
    expect(shifts.titles[1].catalogTitle).toBe("Server");
    expect(shifts.issues).toEqual([]);

    const paylocity = parseRoster(
      "Employee Id,Last Name,First Name,Job Title,Cost Center 1,Status,Hire Date,Employee Type\n101,Ruiz,Ana,Owner,Admin,A,01/10/2012,RFT\n102,Ochoa,Ben,Office Manager,Admin,A,03/15/2019,RFT\n103,Diaz,Cal,Bookkeeper,Finance,L,07/01/2024,RPT\n104,Roe,Fay,Cashier,Store,T,01/10/2020,RPT",
      general,
      { today },
    );
    expect(paylocity.people.map((p) => [p.id, p.name, p.department, p.active])).toEqual([
      ["emp-101", "Ana Ruiz", "Admin", true],
      ["emp-102", "Ben Ochoa", "Admin", true],
      ["emp-103", "Cal Diaz", "Finance", true],
      ["emp-104", "Fay Roe", "Store", false],
    ]);
    expect(paylocity.issues).toEqual([
      { row: 3, message: '"Cal Diaz" is on leave (status "L"); kept on the team' },
    ]);
  });

  it("reads Employee # as the employee id, never as the name", () => {
    const result = parseRoster(
      "Employee #,First Name,Last Name,Job Title,Department,Hire Date,Employment Status,Status\n12,Ana,Ruiz,Owner,Leadership,2012-01-10,Full-Time,Active\n15,Ben,Ochoa,Office Manager,Admin,2019-03-15,Full-Time,Active\n22,Cal,Diaz,Bookkeeper,Finance,2024-07-01,Part-Time,Active\n23,Fay,Roe,Cashier,Store,2020-01-10,Terminated,Inactive",
      general,
      { today },
    );
    expect(result.people.map((p) => [p.id, p.name, p.active])).toEqual([
      ["emp-12", "Ana Ruiz", true],
      ["emp-15", "Ben Ochoa", true],
      ["emp-22", "Cal Diaz", true],
      ["emp-23", "Fay Roe", false],
    ]);
    expect(result.issues).toEqual([]);
  });

  it("builds the name from first and last name, ignores a preferred name, reorders Last, First, and keeps suffixes", () => {
    const bamboo = parseRoster(
      "First Name,Last Name,Preferred Name,Job Title,Department,Hire Date,Employment Status,Status\nAna,Ruiz,,Owner,Leadership,2012-01-10,Full-Time,Active\nBenjamin,Ochoa,Ben,Office Manager,Admin,2019-03-15,Full-Time,Active\nCalvin,Diaz,,Bookkeeper,Finance,2024-07-01,Part-Time,Active\nFay,Roe,,Cashier,Store,2020-01-10,Terminated,Inactive",
      general,
      { today },
    );
    expect(bamboo.people.map((p) => p.name)).toEqual([
      "Ana Ruiz",
      "Benjamin Ochoa",
      "Calvin Diaz",
      "Fay Roe",
    ]);
    expect(bamboo.issues).toEqual([]);

    const preferredOnly = parseRoster("Preferred Name,Job Title\nBenny,Bookkeeper", general, {
      today,
    });
    expect(preferredOnly.people.map((p) => p.name)).toEqual(["Benny"]);

    const lastFirst = parseRoster(
      'Employee Name,Job Title,Department,Status,Hire Date\n"Ruiz, Ana",Owner,Admin,A,01/10/2012\n"Roe, Fay",Cashier,Store,T,01/10/2020',
      general,
      { today },
    );
    expect(lastFirst.people.map((p) => [p.id, p.name, p.active])).toEqual([
      ["p-ana-ruiz", "Ana Ruiz", true],
      ["p-fay-roe", "Fay Roe", false],
    ]);

    const suffixes = parseRoster(
      'Employee Name,Job Title,Status\n"Ruiz, Ana, Jr.",Owner,Active\nSam Lee III,Dental Hygienist,Active\n"Jane Roe, DDS",Dentist,Active\nDr. Ken Ito,Dentist,Active\nBen Ochoa Sr.,Bookkeeper,Active',
      general,
      { today },
    );
    expect(suffixes.people.map((p) => p.name)).toEqual([
      "Ana Ruiz Jr.",
      "Sam Lee III",
      "Jane Roe, DDS",
      "Dr. Ken Ito",
      "Ben Ochoa Sr.",
    ]);
  });

  it("drops a Workday id from the name and uses it as the employee id", () => {
    const result = parseRoster(
      tsv(
        ["Worker", "Business Title", "Hire Date"],
        ["Ana Ruiz (1001)", "Owner", "01/10/2012"],
        ["Ben Ochoa (1002)", "Bookkeeper", "03/15/2019"],
      ),
      general,
      { today },
    );
    expect(result.people.map((p) => [p.id, p.name])).toEqual([
      ["emp-1001", "Ana Ruiz"],
      ["emp-1002", "Ben Ochoa"],
    ]);
  });

  it("ranks status columns and treats a person as inactive when any status column says so", () => {
    const two = parseRoster(
      "First Name,Last Name,Job Title,Employment Status,Status\nAna,Ruiz,Owner,Full-Time,Active\nBen,Ochoa,Bookkeeper,Part-Time,Inactive\nCal,Diaz,Cashier,Terminated,Inactive",
      general,
      { today },
    );
    expect(two.people.map((p) => p.active)).toEqual([true, false, false]);
    expect(two.issues).toEqual([]);

    const reversed = parseRoster(
      "Name,Status,Employment Status\nAna Ruiz,Active,Terminated\nBen Ochoa,Active,Full-Time",
      general,
      { today },
    );
    expect(reversed.people.map((p) => p.active)).toEqual([false, true]);
  });

  it("reads every inactive word the exports write, keeps people on leave, and reports an unknown word once", () => {
    const inactive = [
      "Inactive",
      "Terminated",
      "Terminated - Voluntary",
      "Term",
      "Retired",
      "Furloughed",
      "Furlough",
      "No",
      "0",
      "T",
      "I",
      "N",
      "FALSE",
      "Deactivated",
      "Archived",
      "Deleted",
      "Deceased",
      "Suspended - Payroll Eligible",
      "Not on payroll",
      "Former Employee",
      "Former",
      "Dormant",
      "Discarded",
      "Separated",
      "Withdrawn",
      "Resigned",
      "Left",
      "Ended",
      "Not Active",
      "Non-Active",
      "Ex-employee",
      "Laid Off",
      "Reported No Show",
    ];
    const active = [
      "Active",
      "Active - Regular",
      "Active - Payroll Eligible",
      "Yes",
      "Y",
      "TRUE",
      "1",
      "A",
      "L",
      "Leave of Absence",
      "On Leave",
      "Unpaid Leave",
      "Paid Leave",
      "Contractor",
      "Contingent Worker",
      "Employee",
      "Full-Time",
      "Part-Time",
      "Hired",
      "Rehired",
      "",
    ];
    const rows = [...inactive, ...active, "Onboarding", "Onboarding", "Pre-hire"];
    const result = parseRoster(
      [
        "Employee Name,Job Title,Status",
        ...rows.map((s, i) => `Person ${i + 1},Cashier,${s}`),
      ].join("\n"),
      general,
      { today },
    );
    expect(result.people.slice(0, inactive.length).map((p) => p.active)).toEqual(
      inactive.map(() => false),
    );
    expect(result.people.slice(inactive.length).map((p) => p.active)).toEqual(
      [...active, "Onboarding", "Onboarding", "Pre-hire"].map(() => true),
    );
    // Leave statuses keep the person on the team and are noted; unknown words are reported once.
    const onLeave = ["L", "Leave of Absence", "On Leave", "Unpaid Leave", "Paid Leave"];
    const leaveRows = onLeave.map((status) => inactive.length + active.indexOf(status) + 1);
    expect(result.onLeave).toEqual(leaveRows.map((row) => `p-person-${row}`));
    expect(result.issues).toEqual([
      ...onLeave.map((status, i) => ({
        row: leaveRows[i],
        message: `"Person ${leaveRows[i]}" is on leave (status "${status}"); kept on the team`,
      })),
      {
        row: inactive.length + active.length + 1,
        message: 'Status "Onboarding" not recognised; treated as active',
      },
      {
        row: inactive.length + active.length + 3,
        message: 'Status "Pre-hire" not recognised; treated as active',
      },
    ]);

    const quickbooks = parseRoster(
      "Employee,Employee ID,Status,Hire date,Job title,Work location\nAna Ruiz,1,Active,01/10/2012,Owner,Main\nCal Diaz,3,Not on payroll,07/01/2024,Bookkeeper,Main\nEve Lam,5,Paid leave,05/05/2015,Cashier,Main\nGus Tan,6,Deceased,05/05/2010,Cashier,Main",
      general,
      { today },
    );
    expect(quickbooks.people.map((p) => [p.name, p.active, p.department])).toEqual([
      ["Ana Ruiz", true, "Main"],
      ["Cal Diaz", false, "Main"],
      ["Eve Lam", true, "Main"],
      ["Gus Tan", false, "Main"],
    ]);
    expect(quickbooks.issues).toEqual([
      { row: 3, message: '"Eve Lam" is on leave (status "Paid leave"); kept on the team' },
    ]);
  });

  it("keeps an ADP clinic worker on Leave on the team and lists them as on leave", () => {
    const clinic = parseRoster(
      'Payroll Name,Position Description,Home Department Description,Status,Hire Date\n"Alvarez, Rosa",Medical Assistant,Clinical - Nursing,Active,06/02/2014\n"Haddad, Layla",Medical Assistant - Float,Clinical - Nursing,Leave,05/15/2020\n"Kim, Grace",Bookkeeper (Contract),Administration,LOA,01/10/2018\n"Torres, Miguel",Front Desk Receptionist,Front Office,Terminated,02/03/2020',
      general,
      { today },
    );
    expect(clinic.people.map((p) => [p.name, p.active])).toEqual([
      ["Rosa Alvarez", true],
      ["Layla Haddad", true],
      ["Grace Kim", true],
      ["Miguel Torres", false],
    ]);
    expect(clinic.onLeave).toEqual(["p-layla-haddad", "p-grace-kim"]);
    expect(clinic.issues).toEqual([
      { row: 2, message: '"Layla Haddad" is on leave (status "Leave"); kept on the team' },
      { row: 3, message: '"Grace Kim" is on leave (status "LOA"); kept on the team' },
    ]);
  });

  it("reads an Employment Type column as schedule, so T for temporary keeps the person", () => {
    const result = parseRoster(
      "Employee Name,Job Title,Employment Type\nAna Ruiz,Bookkeeper,F\nBen Cole,Cashier,T\nCal Diaz,Cashier,P\nDee Park,Server,Terminated",
      general,
      { today },
    );
    expect(result.people.map((p) => [p.name, p.active])).toEqual([
      ["Ana Ruiz", true],
      ["Ben Cole", true],
      ["Cal Diaz", true],
      ["Dee Park", false],
    ]);
    expect(result.issues).toEqual([]);
    // A true status column beside it still decides.
    const both = parseRoster(
      "Employee Name,Job Title,Status,Worker Type\nAna Ruiz,Bookkeeper,T,Regular\nBen Cole,Cashier,A,T",
      general,
      { today },
    );
    expect(both.people.map((p) => p.active)).toEqual([false, true]);
  });

  it("reads two employees with one name and title by their different employee IDs", () => {
    const result = parseRoster(
      "Employee ID,Employee Name,Job Title\n1001,Maria Garcia,Server\n1002,Maria Garcia,Server",
      general,
      { today },
    );
    expect(result.people.map((p) => [p.id, p.name, p.role])).toEqual([
      ["emp-1001", "Maria Garcia", "Server"],
      ["emp-1002", "Maria Garcia", "Server"],
    ]);
    expect(result.duplicates).toBe(0);
    expect(result.issues).toEqual([
      {
        row: 2,
        message: '"Maria Garcia" appears twice with different employee IDs; kept as two people',
      },
    ]);
  });

  it("reads one employee ID on two positions as one person holding both jobs' duties", () => {
    const result = parseRoster(
      "Employee ID,Employee Name,Job Title\n1001,Ana Ruiz,Bookkeeper\n1001,Ana Ruiz,Cashier\n1001,Ana Ruiz,Cashier\n1002,Ben Cole,Server",
      general,
      { today },
    );
    expect(result.people.map((p) => [p.id, p.name, p.role])).toEqual([
      ["emp-1001", "Ana Ruiz", "Bookkeeper / Cashier"],
      ["emp-1002", "Ben Cole", "Server"],
    ]);
    expect(result.people[0].entitlements).toEqual(
      expect.arrayContaining(["collect_cash", "bank_reconcile", "post_payments"]),
    );
    expect(result.duplicates).toBe(1);
    expect(result.issues).toEqual([
      {
        row: 2,
        message:
          '"Ana Ruiz" (employee ID 1001) holds two positions, Bookkeeper and Cashier; read as one person with the duties of both',
      },
      { row: 3, message: '"Ana Ruiz" appears twice; second copy skipped' },
    ]);
    // An inactive second position adds nothing; an active one replaces an ended first one.
    const ended = parseRoster(
      "Employee ID,Employee Name,Job Title,Status\n7,Cal Diaz,Cashier,Active\n7,Cal Diaz,Bookkeeper,Terminated\n8,Dee Park,Cashier,Terminated\n8,Dee Park,Server,Active",
      general,
      { today },
    );
    expect(ended.people.map((p) => [p.name, p.role, p.active, p.entitlements])).toEqual([
      ["Cal Diaz", "Cashier", true, ["collect_cash", "view_reports_only"]],
      ["Dee Park", "Server", true, ["collect_cash", "view_reports_only"]],
    ]);
    expect(ended.issues[0].message).toBe(
      '"Cal Diaz" (employee ID 7): the Bookkeeper position is marked inactive, so its duties are left out',
    );
  });

  it("ranks title columns by specificity, skips numeric position codes, and tries a second title column for the catalog", () => {
    const sap = parseRoster(
      "Person ID External,User ID,First Name,Last Name,Position,Job Title,Department,Employment Status\n10001,aruiz,Ana,Ruiz,30001234,Owner,Leadership,Active\n10002,bochoa,Ben,Ochoa,30001235,Bookkeeper,Finance,Active\n10003,cdiaz,Cal,Diaz,30001236,Cashier,Store,Active",
      general,
      { today },
    );
    expect(sap.people.map((p) => p.role)).toEqual(["Owner", "Bookkeeper", "Cashier"]);
    expect(sap.issues).toEqual([]);

    const codesOnly = parseRoster("Name,Position\nAna Ruiz,30001234\nBen Ochoa,30001235", general, {
      today,
    });
    expect(codesOnly.people.map((p) => p.role)).toEqual(["Team member", "Team member"]);
    expect(codesOnly.issues.map((i) => i.message)).toEqual([
      "No job title; duties left for you to tick",
      "No job title; duties left for you to tick",
    ]);

    const homebase = parseRoster(
      "First name,Last name,Email,Phone,Role,Job title,Wage rate,Status\nAna,Ruiz,ana@example.com,555-0100,General Manager,Owner,0,Active\nBen,Ochoa,ben@example.com,555-0101,Manager,Kitchen Manager,25,Active\nCal,Diaz,cal@example.com,555-0102,Employee,Server,12,Active\nFay,Roe,fay@example.com,555-0103,Employee,Cashier,13,Archived",
      general,
      { today },
    );
    expect(homebase.people.map((p) => [p.role, p.active])).toEqual([
      ["Owner", true],
      ["Kitchen Manager", true],
      ["Server", true],
      ["Cashier", false],
    ]);
    expect(homebase.issues).toEqual([]);

    const twoTitles = parseRoster(
      tsv(
        ["Worker", "Business Title", "Job Profile", "Hire Date"],
        ["Ana Ruiz", "Chief Happiness Wrangler", "Office Manager", "03/15/2019"],
        ["Ben Ochoa", "Money Wizard", "Bookkeeper", "07/01/2024"],
        ["Cal Diaz", "Cashier", "Cashier", "01/10/2020"],
      ),
      general,
      { today },
    );
    expect(twoTitles.people.map((p) => p.role)).toEqual([
      "Chief Happiness Wrangler",
      "Money Wizard",
      "Cashier",
    ]);
    expect(twoTitles.titles.map((t) => [t.title, t.catalogTitle, t.confidence])).toEqual([
      ["Chief Happiness Wrangler", "Office Manager", "exact"],
      ["Money Wizard", "Bookkeeper", "exact"],
      ["Cashier", "Cashier / Sales Associate", "exact"],
    ]);
    expect(twoTitles.people[0].entitlements).toContain("enter_payroll");
    expect(twoTitles.issues).toEqual([]);
  });

  it("prefers a department column over a location column", () => {
    const result = parseRoster(
      "Employee Name,Job Title,Location,Department,Status\nAna Ruiz,Owner,Downtown,Leadership,Active\nBen Ochoa,Bookkeeper,Downtown,Finance,Active",
      general,
      { today },
    );
    expect(result.people.map((p) => p.department)).toEqual(["Leadership", "Finance"]);
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

    const at = { today };
    expect(readHireDate("03/15/2019 12:00:00 AM", at)).toBe("2019-03-15");
    expect(readHireDate("3/15/2019 0:00", at)).toBe("2019-03-15");
    expect(readHireDate("2019-03-15T00:00:00.000Z", at)).toBe("2019-03-15");
    expect(readHireDate("2019-03-15 00:00:00", at)).toBe("2019-03-15");
    expect(readHireDate("Mar 15, 2019", at)).toBe("2019-03-15");
    expect(readHireDate("March 15, 2019", at)).toBe("2019-03-15");
    expect(readHireDate("Sep 1, 2024", at)).toBe("2024-09-01");
    expect(readHireDate("15 March 2019", at)).toBe("2019-03-15");
    expect(readHireDate("01-JAN-19", at)).toBe("2019-01-01");
    expect(readHireDate("2019/03/15", at)).toBe("2019-03-15");
    expect(readHireDate("15.03.2019", at)).toBe("2019-03-15");
    expect(readHireDate("20190315", at)).toBe("2019-03-15");
    expect(readHireDate("2019-02-30", at)).toBeUndefined();
    expect(readHireDate("15/03/2019", at)).toBeUndefined();
    expect(readHireDate("15/03/2019", { ...at, dayFirst: true })).toBe("2019-03-15");
    expect(readHireDate("10/01/2020", { ...at, dayFirst: true })).toBe("2020-01-10");
  });

  it("pivots two-digit years so 99 is 1999 and reports a hire date in the future", () => {
    const at = { today };
    expect(readHireDate("01/01/99", at)).toBe("1999-01-01");
    expect(readHireDate("01-JAN-99", at)).toBe("1999-01-01");
    expect(readHireDate("01/01/70", at)).toBe("1970-01-01");
    expect(readHireDate("7/4/26", at)).toBe("2026-07-04");
    expect(readHireDate("12/31/27", at)).toBe("2027-12-31");

    const result = parseRoster(
      "Employee Name,Job Title,Hire Date\nAna Ruiz,Owner,01/01/99\nBen Ochoa,Bookkeeper,06/30/05\nGus Tan,Barista,12/31/27\nHal Ng,Cashier,01/01/70\nIda Fox,Server,2027-01-15\nJon Wu,Cook,15-Oct-2026\nKim Lee,Host,2026-09-22",
      general,
      { today },
    );
    expect(result.people.map((p) => p.tenureYears)).toEqual([
      27.7,
      21.2,
      undefined,
      56.7,
      undefined,
      undefined,
      0,
    ]);
    expect(result.issues).toEqual([
      { row: 3, message: "Hire date is in the future: 12/31/27" },
      { row: 5, message: "Hire date is in the future: 2027-01-15" },
      { row: 6, message: "Hire date is in the future: 15-Oct-2026" },
    ]);
  });

  it("reads a whole file day first when any of its dates only fits that order", () => {
    const result = parseRoster(
      "Last Name;First Name;Job Title;Department;Status;Hire Date\nRuiz;Ana;Owner;Admin;Active;15/03/2019\nOchoa;Ben;Bookkeeper;Finance;Active;01.07.2024\nDiaz;Cal;Cashier;Store;Terminated;10/01/2020",
      general,
      { today },
    );
    expect(result.people.map((p) => [p.name, p.tenureYears])).toEqual([
      ["Ana Ruiz", 7.5],
      ["Ben Ochoa", 2.2],
      ["Cal Diaz", 6.7],
    ]);
    expect(result.issues).toEqual([]);
  });

  it("reads the odd date forms of one file and leaves a blank date alone", () => {
    const result = parseRoster(
      'Employee Name,Job Title,Hire Date\nAna Ruiz,Owner,\n"Ben Ochoa",Bookkeeper,"March 15, 2019"\nCal Diaz,Cashier,2019/03/15\nDee Park,Server,15.03.2019\nEve Lam,Cook,20190315\nFay Roe,Host,3/15/2019 0:00\nGus Tan,Barista,03/15/2019 12:00:00 AM\n"Hal Ng",Cashier,"Sep 1, 2024"\nIda Fox,Server,2019-03-15 00:00:00\nJon Wu,Cook,15-Mar-2019',
      general,
      { today },
    );
    expect(result.people.map((p) => p.tenureYears)).toEqual([
      undefined,
      7.5,
      7.5,
      7.5,
      7.5,
      7.5,
      7.5,
      2.1,
      7.5,
      7.5,
    ]);
    expect(result.issues).toEqual([]);
  });

  it("strips list numbering and bullets", () => {
    const result = parseRoster(
      "1. Ana Ruiz, Owner\n2. Ben Ochoa, Bookkeeper\n3) Cal Diaz - Cashier\n- Dee Park, Server\n• Eve Lam — Cook\n* Fay Roe, Host\n(7) Gus Tan: Barista",
      general,
      { today },
    );
    expect(result.people.map((p) => [p.name, p.role])).toEqual([
      ["Ana Ruiz", "Owner"],
      ["Ben Ochoa", "Bookkeeper"],
      ["Cal Diaz", "Cashier"],
      ["Dee Park", "Server"],
      ["Eve Lam", "Cook"],
      ["Fay Roe", "Host"],
      ["Gus Tan", "Barista"],
    ]);
  });

  it("splits a Last, First list line on the dash, then on pipes, colons, parentheses and quoted commas", () => {
    const dash = parseRoster(
      "Smith, John - Bookkeeper\nRoe, Jane, DDS - Dentist\nOchoa, Ben - Office Manager\nDee Park - Front Desk - Admin\nMary-Jane Smith - Server",
      general,
      { today },
    );
    expect(dash.people.map((p) => [p.name, p.role, p.department ?? ""])).toEqual([
      ["John Smith", "Bookkeeper", ""],
      ["Jane Roe, DDS", "Dentist", ""],
      ["Ben Ochoa", "Office Manager", ""],
      ["Dee Park", "Front Desk", "Admin"],
      ["Mary-Jane Smith", "Server", ""],
    ]);
    expect(dash.issues).toEqual([]);

    const other = parseRoster(
      'Ana Ruiz (Owner)\nBen Ochoa: Bookkeeper\nCal Diaz | Cashier\n"Ruiz, Dee", Server\nEve Lam, Cook, Kitchen',
      general,
      { today },
    );
    expect(other.people.map((p) => [p.name, p.role, p.department ?? ""])).toEqual([
      ["Ana Ruiz", "Owner", ""],
      ["Ben Ochoa", "Bookkeeper", ""],
      ["Cal Diaz", "Cashier", ""],
      ["Dee Ruiz", "Server", ""],
      ["Eve Lam", "Cook", "Kitchen"],
    ]);
    expect(other.issues).toEqual([]);
  });

  it("reads a Markdown table pasted from a chat", () => {
    const result = parseRoster(
      "| Name | Title | Department |\n|---|---|---|\n| Ana Ruiz | Owner | Admin |\n| Ben Ochoa | Bookkeeper | Finance |\n| Cal Diaz | Cashier | Store |",
      general,
      { today },
    );
    expect(result.people.map((p) => [p.name, p.role, p.department])).toEqual([
      ["Ana Ruiz", "Owner", "Admin"],
      ["Ben Ochoa", "Bookkeeper", "Finance"],
      ["Cal Diaz", "Cashier", "Store"],
    ]);
    expect(result.issues).toEqual([]);
  });

  it("keeps a headerless list whose first title is a column word such as Team Member or Staff", () => {
    const teamMember = parseRoster(
      "Ana Ruiz, Team Member\nBen Ochoa, Cashier\nCal Diaz, Bookkeeper",
      general,
      { today },
    );
    expect(teamMember.people.map((p) => [p.name, p.role])).toEqual([
      ["Ana Ruiz", "Team Member"],
      ["Ben Ochoa", "Cashier"],
      ["Cal Diaz", "Bookkeeper"],
    ]);
    expect(teamMember.issues).toEqual([
      { row: 1, message: 'Title "Team Member" is not in the catalog; duties left for you to tick' },
    ]);
    const staff = parseRoster("Ana Ruiz, Staff\nBen Ochoa, Owner\nCal Diaz, Bookkeeper", general, {
      today,
    });
    expect(staff.people.map((p) => p.name)).toEqual(["Ana Ruiz", "Ben Ochoa", "Cal Diaz"]);
  });

  it("reads a first-name restaurant list whose titles are Team Member, Staff or Employee", () => {
    const restaurant = parseRoster(
      "Jose, Team Member\nMaria, Team Member\nAna, Shift Lead\nTom, Cook",
      general,
      { today },
    );
    expect(restaurant.people.map((p) => [p.name, p.role])).toEqual([
      ["Jose", "Team Member"],
      ["Maria", "Team Member"],
      ["Ana", "Shift Lead"],
      ["Tom", "Cook"],
    ]);
    expect(restaurant.people[2].entitlements).toEqual(
      expect.arrayContaining(["collect_cash", "prepare_deposit"]),
    );
    expect(restaurant.skipped).toBe(0);
    const mixed = parseRoster(
      "Jose, Server\nMaria, Team Member\nAna, Shift Lead\nTom, Line Cook\nmaria lopez, Staff\nLee, Employee",
      general,
      { today },
    );
    expect(mixed.people.map((p) => p.name)).toEqual([
      "Jose",
      "Maria",
      "Ana",
      "Tom",
      "maria lopez",
      "Lee",
    ]);
    expect(mixed.issues.some((issue) => issue.message.startsWith("Skipped"))).toBe(false);
  });

  it("keeps a title that contains a dash whole in a tab or comma list", () => {
    const tabs = parseRoster(
      "Ana Ruiz\tFront Desk - Evenings\nBen Cole\tBookkeeper\nCal Diaz\tServer - Weekends",
      general,
      { today },
    );
    expect(tabs.people.map((p) => [p.name, p.role])).toEqual([
      ["Ana Ruiz", "Front Desk - Evenings"],
      ["Ben Cole", "Bookkeeper"],
      ["Cal Diaz", "Server - Weekends"],
    ]);
    expect(tabs.people[0].entitlements).toEqual(
      expect.arrayContaining(["collect_cash", "post_payments"]),
    );
    const commas = parseRoster(
      "Ana Ruiz, Office Manager - Main St\nBen Cole, Front Desk - Evenings\nAna Ruiz, Server (Weekends)\nRuiz, Dee (Owner)\nRuiz Lopez, Eva - Cook",
      general,
      { today },
    );
    expect(commas.people.map((p) => [p.name, p.role])).toEqual([
      ["Ana Ruiz", "Office Manager - Main St"],
      ["Ben Cole", "Front Desk - Evenings"],
      ["Ana Ruiz", "Server (Weekends)"],
      ["Dee Ruiz", "Owner"],
      ["Eva Ruiz Lopez", "Cook"],
    ]);
  });

  it("skips a Staff List or Team Roster title line above a list and keeps a lone name", () => {
    for (const title of ["Staff List", "Team Roster", "Employee Directory", "As of 09/01/2026"]) {
      const result = parseRoster(
        `${title}\nAna Ruiz, Office Manager\nBen Cole, Bookkeeper`,
        general,
        {
          today,
        },
      );
      expect(
        result.people.map((p) => p.name),
        title,
      ).toEqual(["Ana Ruiz", "Ben Cole"]);
      expect(result.issues[0], title).toEqual({
        row: 0,
        message: `Skipped 1 line at the top: "${title}"`,
      });
    }
    const lone = parseRoster("Ana Ruiz\nBen Cole, Bookkeeper", general, { today });
    expect(lone.people.map((p) => p.name)).toEqual(["Ana Ruiz", "Ben Cole"]);
  });

  it("keeps company names as written and moves suffixes after the reordered name", () => {
    const result = parseRoster(
      'Employee Name,Job Title\n"Smith, Jones & Co",Outside Bookkeeper\n"Acme Payroll, Inc.",Payroll\n"Diaz, Cal III",Cashier\n"Cole, Ben, CPA",Accountant\n"Smith, John, Jr.",Server\n"de la Cruz, Maria",Host',
      general,
      { today },
    );
    expect(result.people.map((p) => p.name)).toEqual([
      "Smith, Jones & Co",
      "Acme Payroll, Inc.",
      "Cal Diaz III",
      "Ben Cole, CPA",
      "John Smith Jr.",
      "Maria de la Cruz",
    ]);
  });

  it("skips a one-word title line above a list", () => {
    const result = parseRoster("Employees\nAna Ruiz, Owner\nBen Ochoa - Bookkeeper", general, {
      today,
    });
    expect(result.people.map((p) => p.name)).toEqual(["Ana Ruiz", "Ben Ochoa"]);
    expect(result.issues).toEqual([{ row: 0, message: 'Skipped 1 line at the top: "Employees"' }]);
    expect(result.skipped).toBe(1);
    const names = parseRoster("Ana Ruiz\nBen Ochoa\nCal Diaz", general, { today });
    expect(names.people.map((p) => p.name)).toEqual(["Ana Ruiz", "Ben Ochoa", "Cal Diaz"]);
  });

  it("skips a row that repeats an earlier name and title, and flags a repeated name with another title", () => {
    const result = parseRoster(
      "name,role\nAna Ruiz,Owner\nAna Ruiz,Owner\nAna Ruiz,Bookkeeper\nBen Ochoa,Cashier",
      general,
      { today },
    );
    expect(result.people.map((p) => [p.id, p.role])).toEqual([
      ["p-ana-ruiz", "Owner"],
      ["p-ana-ruiz-2", "Bookkeeper"],
      ["p-ben-ochoa", "Cashier"],
    ]);
    expect(result.duplicates).toBe(1);
    expect(result.issues).toEqual([
      { row: 2, message: '"Ana Ruiz" appears twice; second copy skipped' },
      {
        row: 3,
        message: '"Ana Ruiz" appears twice with different titles; check whether this is one person',
      },
    ]);
  });

  it("counts the rows dropped past the row limit", () => {
    const rows = ["Employee Name,Job Title,Department,Status,Hire Date"];
    for (let i = 1; i <= 300; i++) {
      rows.push(`Person ${String(i).padStart(3, "0")},Cashier,Store,Active,01/15/2015`);
    }
    const result = parseRoster(rows.join("\n"), general, { today });
    expect(result.people).toHaveLength(250);
    expect(result.dropped).toBe(50);
    expect(result.issues).toEqual([{ row: 251, message: "Import truncated to 250 rows" }]);
    expect(parseRoster(rows.slice(0, 4).join("\n"), general, { today, maxRows: 2 })).toMatchObject({
      dropped: 1,
      issues: [{ row: 3, message: "Import truncated to 2 rows" }],
    });
  });

  it("returns nothing for empty text", () => {
    expect(parseRoster("   ", general).people).toEqual([]);
  });
});

describe("a pathological pasted line", () => {
  // These took 48 seconds each before the bracket and title scans were made
  // linear; the limit is wide so a loaded machine cannot make it flaky.
  it.each([
    ["an open bracket then 200,000 spaces", "Ana Ruiz, Clerk (" + " ".repeat(200_000) + "x"],
    ["a possessive then 200,000 spaces", "Ana Ruiz, Owner's" + " ".repeat(200_000) + "x"],
  ])("reads %s in well under five seconds", (_label, line) => {
    const started = performance.now();
    parseRoster(line, getBaseTemplate("general"));
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
