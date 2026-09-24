import { describe, expect, it } from "vitest";
import { defaultProfile } from "./practice-profile";
import { compareAssessmentStates, createSnapshotComparisonReport } from "./snapshot-comparison";
import { DEFAULT_VALUE_CASE, observedValueStatus } from "./value-case";

const state = (valueCase = DEFAULT_VALUE_CASE) => ({
  profile: defaultProfile("retail"),
  powerMap: [],
  valueCase,
  evidence: [],
  asOf: new Date("2026-09-01T00:00:00Z"),
});

describe("compareAssessmentStates net observed value", () => {
  it("reports no change in value when neither assessment has an observed figure", () => {
    const result = compareAssessmentStates(state(), state());
    expect(result.netObservedValueDelta).toBeNull();
    expect(createSnapshotComparisonReport("Test", "2026-08-01", result)).toContain(
      "- Net observed value: not observed in both assessments",
    );
  });

  it("reports the change once both assessments carry the owner's own hours, rate and cost", () => {
    // Net value is observed only with the owner's hours, hourly cost and program cost.
    const own = { ...DEFAULT_VALUE_CASE, hourlyCost: 60, annualProgramCost: 2_000 };
    const before = { ...own, reviewHoursBefore: 40, reviewHoursAfter: 30 };
    const after = { ...own, reviewHoursBefore: 40, reviewHoursAfter: 10 };
    const result = compareAssessmentStates(state(after), state(before));
    const expected =
      (observedValueStatus(after).net.value ?? NaN) -
      (observedValueStatus(before).net.value ?? NaN);
    expect(result.netObservedValueDelta).toBe(expected);
    expect(result.netObservedValueDelta).toBeGreaterThan(0);
  });
});
