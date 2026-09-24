import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALUE_CASE,
  createValueCaseMemo,
  formatMoney,
  hasOwnObservations,
  normalizeEnteredInputs,
  observedValueStatus,
} from "./value-case";

const at = new Date("2026-09-23T00:00:00.000Z");

describe("observed value", () => {
  it("is not yet observed while every input is the app default", () => {
    const s = observedValueStatus(DEFAULT_VALUE_CASE);
    expect(s.anyObservation).toBe(false);
    for (const f of [s.hours, s.value, s.net, s.roi, s.payback]) {
      expect(f.observed).toBe(false);
      expect(f.value).toBeNull();
    }
    expect(hasOwnObservations(DEFAULT_VALUE_CASE)).toBe(false);
  });

  it("never builds a return from defaults: one edited cost unlocks nothing", () => {
    const s = observedValueStatus({ ...DEFAULT_VALUE_CASE, hourlyCost: 100 });
    expect(s.anyObservation).toBe(true);
    expect(s.hours.observed).toBe(false);
    expect(s.net.observed).toBe(false);
    expect(s.roi.observed).toBe(false);
    expect(s.roi.missing).toContain("annualProgramCost");
  });

  it("shows hours once entered and names the defaults they still use", () => {
    const s = observedValueStatus({ ...DEFAULT_VALUE_CASE, reviewHoursBefore: 30 });
    expect(s.hours.observed).toBe(true);
    expect(s.hours.value).toBe((30 - 14) * 4);
    expect(s.hours.defaultsUsed).toEqual(["reviewHoursAfter", "annualReviews"]);
  });

  it("counts a figure the owner typed even when it equals the default", () => {
    const typed = [
      "reviewHoursBefore",
      "reviewHoursAfter",
      "annualReviews",
      "hourlyCost",
      "annualProgramCost",
    ] as const;
    const s = observedValueStatus(DEFAULT_VALUE_CASE, typed);
    expect(s.net.observed).toBe(true);
    expect(s.net.value).toBe(88 * 95 - 12_000);
    expect(s.roi.observed).toBe(true);
    expect(s.roi.value).toBeCloseTo((88 * 95 - 12_000) / 12_000);
    expect(normalizeEnteredInputs(["hourlyCost", "nope", 3])).toEqual(["hourlyCost"]);
  });
});

describe("createValueCaseMemo", () => {
  it("prints no observed section and no return from the app defaults", () => {
    const memo = createValueCaseMemo(DEFAULT_VALUE_CASE, at);
    expect(memo).not.toContain("## Directly observed value");
    expect(memo).not.toMatch(/Observed ROI/);
    expect(memo).not.toMatch(/Net observed value/);
    expect(memo).toContain("## Observed value\n\nNot yet observed.");
    expect(memo).toContain("- Annual exposure (app default): $250,000");
    expect(memo).not.toContain("your assumption)");
  });

  it("never exports a negative return built on defaults", () => {
    const memo = createValueCaseMemo({ ...DEFAULT_VALUE_CASE, hourlyCost: 100 }, at);
    expect(memo).toContain("## Directly observed value");
    expect(memo).toMatch(/- Observed ROI: not yet observed; enter /);
    expect(memo).toMatch(/- Net observed value: not yet observed; enter /);
    expect(memo).not.toMatch(/-\d+(\.\d)?%/);
  });

  it("labels the owner's own assumptions as theirs", () => {
    const memo = createValueCaseMemo({ ...DEFAULT_VALUE_CASE, annualExposure: 400_000 }, at);
    expect(memo).toContain("- Annual exposure (your assumption): $400,000");
    expect(memo).toContain("- Baseline event probability (app default): 4.0%");
  });

  it("writes negative money with the sign first", () => {
    expect(formatMoney(-3640)).toBe("-$3,640");
    expect(formatMoney(5000)).toBe("$5,000");
  });
});
