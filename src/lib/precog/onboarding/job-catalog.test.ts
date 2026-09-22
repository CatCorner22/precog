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
    // "Associate" alone is an attorney; "Sales Associate" is a cashier.
    expect(matchJobTitle("Sales Associate")?.entry.id).toBe("cashier");
    expect(matchJobTitle("Associate")?.entry.id).toBe("attorney");
    expect(matchJobTitle("Dental Assistant")?.entry.id).toBe("dental-assistant");
    expect(matchJobTitle("Assistant Manager")?.entry.id).toBe("restaurant-manager");
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
