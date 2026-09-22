import { describe, expect, it } from "vitest";
import {
  assessEvidenceQuality,
  isVerifiedObservation,
  normalizeValueEvidence,
  summarizeValueEvidence,
  type ValueEvidence,
} from "./value-evidence";

const asOf = new Date("2026-09-20T00:00:00.000Z");
const base: ValueEvidence = {
  id: "r1",
  kind: "recovery",
  description: "Duplicate supplier payment recovered",
  source: "AP credit memo 118",
  amount: 1_200,
  observedAt: "2026-08-01",
  verified: true,
};

describe("verified observations", () => {
  it("counts a verified, sourced, dated item inside the window", () => {
    expect(isVerifiedObservation(base, asOf)).toBe(true);
    expect(summarizeValueEvidence([base], asOf)).toMatchObject({ verified: 1, recoveries: 1_200 });
  });

  it("does not count an item whose date is missing, invalid, in the future, or older than a year", () => {
    const undated = normalizeValueEvidence([{ ...base, observedAt: "2026-99-99" }])[0];
    expect(undated.verified).toBe(true);
    expect(undated.observedAt).toBe("");
    for (const item of [
      undated,
      { ...base, observedAt: "" },
      { ...base, observedAt: "2026-09-21" },
      { ...base, observedAt: "2025-09-01" },
    ]) {
      expect(isVerifiedObservation(item, asOf)).toBe(false);
      expect(summarizeValueEvidence([item], asOf).recoveries).toBe(0);
      expect(assessEvidenceQuality([item], asOf).verified).toBe(0);
    }
  });

  it("keeps the summary and the quality score on the same rule", () => {
    const items: ValueEvidence[] = [
      base,
      { ...base, id: "r2", observedAt: "2026-09-21" },
      { ...base, id: "t1", kind: "time", amount: 40, observedAt: "" },
      { ...base, id: "t2", kind: "time", amount: 12 },
    ];
    const summary = summarizeValueEvidence(items, asOf);
    const quality = assessEvidenceQuality(items, asOf);
    expect(summary.verified).toBe(quality.verified);
    expect(summary).toMatchObject({
      total: 4,
      verified: 2,
      recoveries: 1_200,
      hours: 12,
      completion: 50,
    });
  });
});
