import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import type { Person, StaffComposition } from "../types";
import { controlOptions, detectSodConflicts } from "./detect";
import { deriveStaffFromTeam, independentReconciliationFromTeam } from "./derive-staff";

const retail = getBaseTemplate("retail");

function staff(overrides: Partial<StaffComposition> = {}): StaffComposition {
  return { ...retail.staffComposition, ...overrides };
}

describe("deriveStaffFromTeam", () => {
  it("counts active people and averages known active tenure", () => {
    const people = retail.people.map((person, index) => ({
      ...person,
      active: index !== 1,
      tenureYears: index === 2 ? undefined : index + 1,
    }));

    const result = deriveStaffFromTeam({ ...retail, people }, staff());

    expect(result.teamSize).toBe(5);
    expect(result.avgTenureYears).toBe(4);
  });

  it("matches the SoD detector's segregation health without circular staff input", () => {
    const result = deriveStaffFromTeam(retail, staff({ segregationScore: 1 }));

    expect(result.segregationScore).toBe(
      detectSodConflicts(retail, undefined, controlOptions(retail)).summary.segregationHealth,
    );
    expect(result.segregationSource).toBe("derived");
  });

  it("preserves a manual segregation score while updating team metrics", () => {
    const people = retail.people.slice(0, 2).map((person, index) => ({
      ...person,
      active: index === 0,
      tenureYears: 12,
    }));
    const result = deriveStaffFromTeam(
      { ...retail, people },
      staff({ segregationScore: 37, segregationSource: "manual" }),
    );

    expect(result.teamSize).toBe(1);
    expect(result.avgTenureYears).toBe(12);
    expect(result.segregationScore).toBe(37);
    expect(result.segregationSource).toBe("manual");
  });

  it("scores a one-person end-to-end cash and payment role below segregated duties", () => {
    const solo: Person = {
      id: "solo",
      name: "Solo",
      role: "Custom",
      active: true,
      entitlements: ["collect_cash", "bank_reconcile", "release_payment"],
    };
    const segregatedPeople: Person[] = [
      { id: "cash", name: "Cash", role: "Custom", active: true, entitlements: ["collect_cash"] },
      {
        id: "bank",
        name: "Bank",
        role: "Custom",
        active: true,
        entitlements: ["bank_reconcile"],
      },
      {
        id: "pay",
        name: "Pay",
        role: "Custom",
        active: true,
        entitlements: ["release_payment"],
      },
    ];
    const soloTemplate = { ...retail, people: [solo], roleTemplates: {} };
    const segregatedTemplate = { ...retail, people: segregatedPeople, roleTemplates: {} };

    const soloScore = deriveStaffFromTeam(soloTemplate, staff()).segregationScore;
    const segregatedScore = deriveStaffFromTeam(segregatedTemplate, staff()).segregationScore;

    expect(soloScore).toBeLessThan(segregatedScore);
  });
});

describe("independent reconciliation read from the team", () => {
  const person = (id: string, role: string, duties: string[], active = true): Person => ({
    id,
    name: id,
    role,
    active,
    entitlements: [...duties, "view_reports_only"],
  });

  it("counts an owner who signs checks and reconciles as independent", () => {
    expect(
      independentReconciliationFromTeam([
        person("o", "Owner / Dentist", ["sign_checks", "approve_payroll", "bank_reconcile"]),
        person("m", "Office Manager", ["collect_cash", "post_payments", "enter_invoices"]),
      ]),
    ).toBe(true);
  });

  it("does not count an owner who also records the payments they reconcile", () => {
    expect(
      independentReconciliationFromTeam([
        person("o", "Owner", ["post_payments", "bank_reconcile"]),
        person("c", "Cashier", ["collect_cash"]),
      ]),
    ).toBe(false);
  });

  it("does not count an employee who signs checks and reconciles", () => {
    expect(
      independentReconciliationFromTeam([
        person("o", "Owner", ["approve_payroll"]),
        person("b", "Bookkeeper", ["sign_checks", "bank_reconcile"]),
      ]),
    ).toBe(false);
  });

  it("does not give the owner's exemption to one of two partners", () => {
    expect(
      independentReconciliationFromTeam([
        person("a", "Partner", ["sign_checks", "bank_reconcile"]),
        person("b", "Partner", ["release_payment"]),
      ]),
    ).toBe(false);
  });
});

describe("bank reconciliation flag after team edits", () => {
  const withTeam = (people: Person[]) => ({ ...retail, people });
  const reconciler: Person = {
    id: "r",
    name: "Outside Reviewer",
    role: "Accountant",
    active: true,
    entitlements: ["bank_reconcile", "view_reports_only"],
  };
  const bookkeeper: Person = {
    id: "b",
    name: "Bookkeeper",
    role: "Bookkeeper",
    active: true,
    entitlements: ["post_payments", "view_reports_only"],
  };

  it("follows the team when the independent reconciler leaves", () => {
    const before = deriveStaffFromTeam(withTeam([reconciler, bookkeeper]), staff());
    expect(before.independentBankRec).toBe(true);
    const after = deriveStaffFromTeam(
      withTeam([
        { ...reconciler, active: false },
        { ...bookkeeper, entitlements: ["post_payments", "bank_reconcile"] },
      ]),
      before,
    );
    expect(after.independentBankRec).toBe(false);
    expect(after.bankRecSource).toBe("derived");
  });

  it("keeps a flag the owner set by hand", () => {
    const after = deriveStaffFromTeam(
      withTeam([bookkeeper]),
      staff({ independentBankRec: true, bankRecSource: "manual" }),
    );
    expect(after.independentBankRec).toBe(true);
    expect(after.bankRecSource).toBe("manual");
  });
});
