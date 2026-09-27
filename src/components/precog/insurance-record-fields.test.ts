import { describe, expect, it } from "vitest";
import type { InsuranceRecord } from "@/lib/precog/scoring/insurance-record";
import { policyFieldValue, withFieldToggled } from "./insurance-record-fields";

const record: InsuranceRecord = {
  status: "reported",
  confirmedFields: ["basePremiumAnnual", "deductible", "policyLimit", "coinsurancePct"],
  modeledScenarioIds: ["vendor-fraud"],
};

describe("withFieldToggled", () => {
  it("keeps the scenario assumptions when an optional credit is confirmed", () => {
    const next = withFieldToggled(record, "discountAlarmPct", "2026-09-25");
    expect(next.confirmedFields).toContain("discountAlarmPct");
    expect(next.modeledScenarioIds).toEqual(["vendor-fraud"]);
  });

  it("clears them when a core figure is unconfirmed", () => {
    const next = withFieldToggled(record, "deductible", "2026-09-25");
    expect(next.confirmedFields).not.toContain("deductible");
    expect(next.modeledScenarioIds).toEqual([]);
    expect(next.reviewedOn).toBe("2026-09-25");
  });
});

describe("policyFieldValue", () => {
  it("prints each figure with its unit", () => {
    expect(policyFieldValue("basePremiumAnnual", 4200)).toBe("$4,200");
    expect(policyFieldValue("coinsurancePct", 0)).toBe("0%");
    expect(policyFieldValue("discountDualControlPct", 5)).toBe("5%");
  });
});
