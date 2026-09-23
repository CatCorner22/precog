import { describe, expect, it } from "vitest";
import {
  JOB_CATALOG,
  entitlementsForTitle,
  jobCatalogMissingDescriptions,
  jobCatalogUnknownEntitlements,
  matchJobTitle,
} from "./job-catalog";

describe("job catalog", () => {
  it("cites only duties the rulebook defines, and every entry carries at least one", () => {
    expect(jobCatalogUnknownEntitlements()).toEqual([]);
    for (const e of JOB_CATALOG) expect(e.entitlements.length, e.id).toBeGreaterThan(0);
  });

  it("describes every job in one bounded sentence and records only well-formed SOC codes", () => {
    expect(jobCatalogMissingDescriptions()).toEqual([]);
    for (const e of JOB_CATALOG) {
      expect(e.description.length, e.id).toBeLessThanOrEqual(220);
      expect(e.description.endsWith("."), e.id).toBe(true);
      if (e.soc) expect(e.soc, e.id).toMatch(/^\d{2}-\d{4}$/);
    }
    expect(JOB_CATALOG.length).toBeGreaterThanOrEqual(80);
  });

  it("reads the hospitality, dealership, property, and nonprofit titles HR systems carry", () => {
    expect(matchJobTitle("Night Auditor")?.entry.id).toBe("night-auditor");
    expect(matchJobTitle("Guest Services Agent")?.entry.id).toBe("hotel-front-desk");
    expect(matchJobTitle("Service Advisor")?.entry.id).toBe("service-advisor");
    expect(matchJobTitle("F&I Manager")?.entry.id).toBe("fi-manager");
    expect(matchJobTitle("Delivery Driver")?.entry.id).toBe("driver");
    expect(matchJobTitle("Community Association Manager")?.entry.id).toBe("property-manager");
    expect(matchJobTitle("Director of Development")?.entry.id).toBe("development-director");
    expect(matchJobTitle("Assistant Controller")?.entry.id).toBe("controller");
    expect(matchJobTitle("Revenue Cycle Manager")?.entry.id).toBe("billing-manager");
  });

  it("keeps ids and aliases unique across entries", () => {
    const ids = JOB_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const seen = new Map<string, string>();
    for (const e of JOB_CATALOG) {
      for (const alias of new Set([e.title.toLowerCase(), ...e.aliases])) {
        expect(
          seen.get(alias),
          `alias "${alias}" in ${e.id} and ${seen.get(alias)}`,
        ).toBeUndefined();
        seen.set(alias, e.id);
      }
    }
  });

  it("matches exact titles, aliases, and seniority variants", () => {
    expect(matchJobTitle("Bookkeeper")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Full-Charge Bookkeeper")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Senior AP Clerk (part-time)")?.entry.id).toBe("accounts-payable");
    expect(matchJobTitle("Accounts Payable Specialist II")?.entry.id).toBe("accounts-payable");
    expect(matchJobTitle("Sr. Payroll & Benefits Administrator")?.entry.id).toBe("payroll");
    expect(matchJobTitle("RDH")?.entry.id).toBe("dental-hygienist");
  });

  it("reads the first known part of a combined title and reports partial confidence", () => {
    const combo = matchJobTitle("Office Manager / Bookkeeper");
    expect(combo?.entry.id).toBe("office-manager");
    expect(combo?.confidence).toBe("partial");
    expect(matchJobTitle("Front Desk - Evenings")?.entry.id).toBe("receptionist");
  });

  it("does not let a single-word alias swallow a longer title it does not describe", () => {
    expect(matchJobTitle("Sales Associate")?.entry.id).toBe("cashier");
    expect(matchJobTitle("Associate Attorney")?.entry.id).toBe("attorney");
    expect(matchJobTitle("Dental Assistant")?.entry.id).toBe("dental-assistant");
    expect(matchJobTitle("Assistant Manager")?.entry.id).toBe("restaurant-manager");
  });

  it("gives no money duties to a level word the catalog does not know as a whole title", () => {
    for (const title of [
      "Associate",
      "Manager",
      "Director",
      "Supervisor",
      "Nursing Supervisor",
      "Product Manager",
      "Case Manager",
      "Lab Manager",
      "Tax Manager",
      "Assistant",
    ]) {
      expect(matchJobTitle(title), title).toBeUndefined();
    }
    // A single word that names a seat still counts wherever it sits.
    expect(matchJobTitle("Billing Supervisor")?.entry.id).toBe("billing");
    expect(matchJobTitle("Senior Buyer")?.entry.id).toBe("purchasing");
    expect(matchJobTitle("Payroll and Benefits Supervisor")?.entry.id).toBe("payroll");
    // A level word on a seat with no money duties is harmless and keeps the label.
    expect(matchJobTitle("Security Supervisor")?.entry.id).toBe("security");
    expect(matchJobTitle("Sales Engineer")?.entry.id).toBe("consultant");
  });

  it("keeps contract titles whole instead of reading 'contract' as a decoration", () => {
    expect(matchJobTitle("Contract Manager")?.entry.id).toBe("contracts-administrator");
    expect(matchJobTitle("Contracts Administrator (part-time)")?.entry.id).toBe(
      "contracts-administrator",
    );
    expect(matchJobTitle("Bookkeeper (contract)")?.entry.id).toBe("bookkeeper");
    expect(matchJobTitle("Contract Bookkeeper")?.entry.id).toBe("bookkeeper");
  });

  it("reads a combined title as every seat it names, with all their duties", () => {
    const combo = matchJobTitle("Office Manager / Bookkeeper");
    expect(combo?.entry.id).toBe("office-manager");
    expect(combo?.entitlements).toEqual(
      expect.arrayContaining(["post_payments", "release_payment", "bank_reconcile"]),
    );
    expect(matchJobTitle("Chef/Owner")?.entry.id).toBe("owner");
    expect(matchJobTitle("Chef/Owner")?.entitlements).toEqual(
      expect.arrayContaining(["sign_checks", "order_supplies"]),
    );
    expect(matchJobTitle("HR/Payroll Admin")?.entitlements).toEqual(
      expect.arrayContaining(["edit_payroll_master", "enter_payroll"]),
    );
    expect(matchJobTitle("Owner-Operator")?.entry.id).toBe("owner");
    expect(matchJobTitle("Owner/Operator")?.entry.id).toBe("owner");
    expect(entitlementsForTitle("Server/Bartender")).toEqual(["collect_cash", "view_reports_only"]);
  });

  it("seats cleaners, board members, cash office staff and service managers on their own duties", () => {
    expect(entitlementsForTitle("Janitor")).toEqual(["view_reports_only"]);
    expect(matchJobTitle("Maintenance Tech")?.entry.id).toBe("custodial");
    expect(matchJobTitle("HVAC Technician")?.entry.id).toBe("field-technician");
    expect(entitlementsForTitle("Board Member")).toEqual(["view_reports_only"]);
    expect(matchJobTitle("Board Treasurer")?.entry.id).toBe("board-treasurer");
    expect(matchJobTitle("Cash Office Associate")?.entry.id).toBe("cash-office");
    expect(matchJobTitle("Deposit Clerk")?.entry.id).toBe("cash-office");
    expect(matchJobTitle("AP Manager")?.entry.id).toBe("accounts-payable");
    expect(matchJobTitle("Collections Manager")?.entry.id).toBe("accounts-receivable");
    expect(matchJobTitle("Service Manager")?.entry.id).toBe("service-manager");
    expect(matchJobTitle("Night Manager")?.entry.id).toBe("shift-lead");
    expect(matchJobTitle("Reconciliation Specialist")?.entry.id).toBe("accountant");
    expect(matchJobTitle("Lot Attendant")?.entry.id).toBe("automotive-support");
  });

  it("returns nothing for an unknown title so the owner ticks duties by hand", () => {
    expect(matchJobTitle("Chief Happiness Wrangler")).toBeUndefined();
    expect(entitlementsForTitle("Chief Happiness Wrangler")).toEqual([]);
    expect(matchJobTitle("")).toBeUndefined();
  });

  it("gives the office manager the wide seat the case library describes", () => {
    const duties = entitlementsForTitle("Practice Manager");
    expect(duties).toEqual(
      expect.arrayContaining(["post_payments", "release_payment", "enter_payroll"]),
    );
  });
});
