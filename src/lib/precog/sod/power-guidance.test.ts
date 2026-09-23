import { describe, expect, it } from "vitest";
import type { IndustryId } from "../industry";
import { ENTITLEMENTS } from "./conflict-rules";
import { POWER_GUIDANCE, powerGuidance } from "./power-guidance";

const OTHERS: IndustryId[] = ["retail", "restaurant", "professional_services", "general"];

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
    it(`speaks of no patients, PMS, guarantors or clinics on a ${industry} Power map`, () => {
      expect(allText(industry)).not.toMatch(/patient|\bPMS\b|guarantor|clinical|practice\b/i);
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

  it("covers every duty for every line of business, and the default fits any business", () => {
    for (const industry of ["dental", ...OTHERS] as IndustryId[]) {
      for (const e of ENTITLEMENTS) expect(powerGuidance(industry)[e.id]?.purpose).toBeTruthy();
    }
    expect(POWER_GUIDANCE).toBe(powerGuidance("general"));
  });
});
