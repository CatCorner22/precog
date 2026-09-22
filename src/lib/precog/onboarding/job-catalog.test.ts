import { describe, expect, it } from "vitest";
import {
  JOB_CATALOG,
  entitlementsForTitle,
  jobCatalogUnknownEntitlements,
  matchJobTitle,
} from "./job-catalog";

describe("job catalog", () => {
  it("cites only duties the rulebook defines, and every entry carries at least one", () => {
    expect(jobCatalogUnknownEntitlements()).toEqual([]);
    for (const e of JOB_CATALOG) expect(e.entitlements.length, e.id).toBeGreaterThan(0);
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
