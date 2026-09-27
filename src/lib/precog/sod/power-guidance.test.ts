import { describe, expect, it } from "vitest";
import type { IndustryId } from "../industry";
import { ENTITLEMENTS } from "./conflict-rules";
import { powerGuidance } from "./power-guidance";

const OTHERS: IndustryId[] = [
  "retail",
  "restaurant",
  "professional_services",
  "construction",
  "nonprofit",
  "general",
];

const allText = (industry: IndustryId) =>
  Object.values(powerGuidance(industry))
    .flatMap((g) => [g.purpose, g.evidence, g.boundary])
    .join("\n");

describe("powerGuidance", () => {
  it("keeps the dental and medical office wording: patients, insurers and the PMS", () => {
    const dental = powerGuidance("dental");
    expect(dental.collect_cash.purpose).toBe(
      "Accept patient funds and operate the physical or virtual cash drawer.",
    );
    expect(dental.post_payments.purpose).toBe(
      "Apply patient and insurer receipts to the correct ledger and encounter.",
    );
    expect(dental.pms_admin_roles.purpose).toBe(
      "Configure PMS roles, permissions, and privileged settings.",
    );
    expect(dental.post_adjustments.purpose).toBe(
      "Record approved credits, write-offs, and corrections in the patient ledger.",
    );
  });

  for (const industry of OTHERS) {
    it(`speaks of no patients, PMS, guarantors, clinics or claim batches on a ${industry} Power map`, () => {
      expect(allText(industry)).not.toMatch(/patient|\bPMS\b|guarantor|clinical|practice\b/i);
      expect(powerGuidance(industry).submit_claims.purpose).not.toMatch(/\bclaims?\b/i);
      expect(powerGuidance(industry).submit_claims.evidence).not.toMatch(/\bclaim batch/i);
    });
  }

  it("tells a restaurant about guests and its POS", () => {
    const restaurant = powerGuidance("restaurant");
    expect(restaurant.collect_cash.purpose).toBe(
      "Accept guest funds and operate the physical or virtual cash drawer.",
    );
    expect(restaurant.pms_admin_roles.purpose).toBe(
      "Configure POS roles, permissions, and privileged settings.",
    );
  });

  it("covers every duty for every line of business", () => {
    for (const industry of ["dental", ...OTHERS] as IndustryId[]) {
      for (const e of ENTITLEMENTS) expect(powerGuidance(industry)[e.id]?.purpose).toBeTruthy();
    }
  });

  it("states each boundary as what the role does and does not do, never 'should'", () => {
    for (const industry of ["dental", ...OTHERS] as IndustryId[]) {
      for (const g of Object.values(powerGuidance(industry))) {
        expect(g.boundary).not.toMatch(/\bshould\b/i);
      }
    }
  });

  it("names the board treasurer, not an owner, as a nonprofit's reader", () => {
    expect(powerGuidance("nonprofit").receive_goods.boundary).toMatch(/board treasurer/);
    expect(allText("nonprofit")).not.toMatch(/\bowner\b/i);
  });
});
