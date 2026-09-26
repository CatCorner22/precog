import { describe, expect, it } from "vitest";
import type { IndustryId } from "../industry";
import { ENTITLEMENTS } from "./conflict-rules";
import { controlMeasures } from "./control-measures";

const OTHERS: IndustryId[] = [
  "retail",
  "restaurant",
  "professional_services",
  "construction",
  "nonprofit",
  "general",
];

const allText = (industry: IndustryId) =>
  Object.values(controlMeasures(industry))
    .flatMap((m) => [...m.directive, ...m.preventive, ...m.detective, ...m.corrective])
    .join("\n");

describe("controlMeasures", () => {
  for (const industry of OTHERS) {
    it(`speaks of no patients, PMS, payers or clinics on a ${industry} catalog`, () => {
      expect(allText(industry)).not.toMatch(
        /patient|\bPMS\b|guarantor|clinical|\bpayer\b|\bERA\b|practice\b/i,
      );
    });
  }

  it("keeps the dental office's own words", () => {
    expect(controlMeasures("dental").collect_cash.detective[0]).toBe(
      "Compare each day's takings with the PMS and card-processor totals",
    );
    expect(controlMeasures("dental").issue_refunds.detective[0]).toMatch(/patient/);
  });

  it("uses no unexplained trade terms or vague qualifiers", () => {
    for (const industry of ["dental", ...OTHERS] as IndustryId[]) {
      expect(allText(industry)).not.toMatch(
        /\bMFA\b|least-privilege|joiner-mover-leaver|provisioning|deprovisioning|certif|Rollback|stakeholders|where appropriate|when feasible|timely|Periodically/,
      );
    }
  });

  it("names the board treasurer, not an owner, for a nonprofit", () => {
    expect(allText("nonprofit")).not.toMatch(/\bowner\b/i);
    expect(controlMeasures("nonprofit").hold_company_card.detective[0]).toMatch(
      /^The board treasurer reads/,
    );
  });

  it("covers every duty with at least two actions per category", () => {
    for (const e of ENTITLEMENTS) {
      const m = controlMeasures("general")[e.id];
      for (const list of [m.directive, m.preventive, m.detective, m.corrective]) {
        expect(list.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
