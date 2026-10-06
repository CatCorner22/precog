import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALUE_CASE,
  calculateValueCase,
  createValueCaseMemo,
  normalizeEnteredInputs,
  MODELED_RANGE_NOTE,
  modeledRangeRows,
  modeledTileValues,
  observedValueStatus,
} from "./value-case";
import type { ValueEvidence } from "./value-evidence";
import { formatUsd } from "../utils";

const at = new Date("2026-09-23T00:00:00.000Z");

describe("observed value", () => {
  it("is not yet observed while every input is the app default", () => {
    const s = observedValueStatus(DEFAULT_VALUE_CASE);
    expect(s.anyObservation).toBe(false);
    for (const f of [s.hours, s.value, s.net, s.roi, s.payback]) {
      expect(f.observed).toBe(false);
      expect(f.value).toBeNull();
    }
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

describe("modeled tiles and cash apart from time", () => {
  it("reads Not entered on both modeled tiles while exposure and probability are defaults", () => {
    expect(modeledTileValues(DEFAULT_VALUE_CASE)).toEqual({
      riskReduction: "Not entered",
      lossBaseline: "Not entered",
      entered: false,
    });
    // The control reduction alone does not make the loss the owner's own.
    expect(
      modeledTileValues({ ...DEFAULT_VALUE_CASE, controlEffectiveness: 0.5 }).riskReduction,
    ).toBe("Not entered");
  });

  it("reads Not entered on every Modeled range row while exposure and probability are defaults", () => {
    expect(modeledRangeRows(DEFAULT_VALUE_CASE)).toEqual([
      { label: "Low", amount: null, display: "Not entered" },
      { label: "Base", amount: null, display: "Not entered" },
      { label: "High", amount: null, display: "Not entered" },
    ]);
    expect(
      modeledRangeRows({ ...DEFAULT_VALUE_CASE, controlEffectiveness: 0.5 }).map((r) => r.display),
    ).toEqual(["Not entered", "Not entered", "Not entered"]);
  });

  it("shows the Modeled range once the owner enters exposure or probability", () => {
    const inputs = { ...DEFAULT_VALUE_CASE, annualExposure: 400_000 };
    const { modeled } = calculateValueCase(inputs);
    const rows = modeledRangeRows(inputs);
    expect(rows.map((r) => r.amount)).toEqual([modeled.low, modeled.base, modeled.high]);
    expect(rows.map((r) => r.display)).toEqual([
      formatUsd(modeled.low),
      formatUsd(modeled.base),
      formatUsd(modeled.high),
    ]);
    // Base matches the "Modeled risk reduction" tile.
    expect(rows[1].display).toBe(modeledTileValues(inputs).riskReduction);
    expect(modeledRangeRows(DEFAULT_VALUE_CASE, ["eventProbability"])[1].amount).toBe(
      calculateValueCase(DEFAULT_VALUE_CASE).modeled.base,
    );
  });

  it("shows the modeled figures once the owner enters exposure or probability", () => {
    expect(modeledTileValues({ ...DEFAULT_VALUE_CASE, annualExposure: 400_000 })).toEqual({
      riskReduction: formatUsd(400_000 * 0.04 * 0.35),
      lossBaseline: "about $16,000",
      entered: true,
    });
    expect(modeledTileValues(DEFAULT_VALUE_CASE, ["eventProbability"]).lossBaseline).toBe(
      "about $10,000",
    );
    // An assumed loss, rounded as every scenario figure is: never to the dollar.
    expect(modeledTileValues({ ...DEFAULT_VALUE_CASE, annualExposure: 312_345 }).lossBaseline).toBe(
      "about $12,000",
    );
  });

  it("splits observed value into cash recovered and time returned", () => {
    const s = observedValueStatus({ ...DEFAULT_VALUE_CASE, directRecoveries: 3_000 }, [
      "reviewHoursBefore",
      "reviewHoursAfter",
      "annualReviews",
      "hourlyCost",
    ]);
    expect(s.cash).toMatchObject({ observed: true, value: 3_000 });
    expect(s.time).toMatchObject({ observed: true, value: 88 * 95 });
    expect(s.value.value).toBe(3_000 + 88 * 95);
    expect(observedValueStatus(DEFAULT_VALUE_CASE).cash.observed).toBe(false);
    expect(observedValueStatus(DEFAULT_VALUE_CASE).time.observed).toBe(false);
  });

  it("computes cash ROI without labour, beside the ROI that includes time", () => {
    const inputs = {
      ...DEFAULT_VALUE_CASE,
      directRecoveries: 6_000,
      annualProgramCost: 4_000,
    };
    const calc = calculateValueCase(inputs);
    expect(calc.observed.cashRoi).toBeCloseTo((6_000 - 4_000) / 4_000);
    expect(calc.observed.roi).toBeCloseTo((88 * 95 + 6_000 - 4_000) / 4_000);
    expect(calculateValueCase({ ...inputs, annualProgramCost: 0 }).observed.cashRoi).toBeNull();

    const typed = [
      "reviewHoursBefore",
      "reviewHoursAfter",
      "annualReviews",
      "hourlyCost",
      "directRecoveries",
      "annualProgramCost",
    ] as const;
    const s = observedValueStatus(inputs, typed);
    expect(s.cashRoi.value).toBeCloseTo(0.5);
    expect(s.roi.value).toBeGreaterThan(s.cashRoi.value ?? Infinity);
    const memo = createValueCaseMemo(inputs, at, [], typed);
    expect(memo).toContain("- Cash recovered: $6,000");
    expect(memo).toContain("- Time returned (valued at your hourly cost): $8,360");
    expect(memo).toContain("- Cash-only ROI: 50.0%");
    expect(memo).toMatch(/- ROI including time: \d/);
  });

  it("leaves cash ROI unobserved until recoveries and program cost are both entered", () => {
    const s = observedValueStatus({ ...DEFAULT_VALUE_CASE, directRecoveries: 500 });
    expect(s.cashRoi.observed).toBe(false);
    expect(s.cashRoi.missing).toEqual(["annualProgramCost"]);
  });
});

describe("createValueCaseMemo", () => {
  it("prints no observed section and no return from the app defaults", () => {
    const memo = createValueCaseMemo(DEFAULT_VALUE_CASE, at);
    expect(memo).not.toContain("## Directly observed value");
    expect(memo).not.toMatch(/ROI including time/);
    expect(memo).not.toMatch(/Cash-only ROI/);
    expect(memo).not.toMatch(/Net observed value/);
    expect(memo).toContain("## Observed value\n\nNot yet observed.");
    expect(memo).toContain("- Annual exposure (Precog default): $250,000");
    expect(memo).not.toContain("your assumption)");
  });

  it("never exports a negative return built on defaults", () => {
    const memo = createValueCaseMemo({ ...DEFAULT_VALUE_CASE, hourlyCost: 100 }, at);
    expect(memo).toContain("## Directly observed value");
    expect(memo).toMatch(/- ROI including time: not yet observed; enter /);
    expect(memo).toMatch(/- Cash-only ROI: not yet observed; enter /);
    expect(memo).toMatch(/- Net observed value: not yet observed; enter /);
    expect(memo).not.toMatch(/-\d+(\.\d)?%/);
  });

  it("labels the owner's own assumptions as theirs", () => {
    const memo = createValueCaseMemo({ ...DEFAULT_VALUE_CASE, annualExposure: 400_000 }, at);
    expect(memo).toContain("- Annual exposure (your assumption): $400,000");
    expect(memo).toContain("- Baseline event probability (Precog default): 4.0%");
  });

  it("says where the modeled range comes from", () => {
    const memo = createValueCaseMemo(DEFAULT_VALUE_CASE, at);
    expect(memo).toContain("(base ×0.5 and ×1.5, Precog's assumption)");
    expect(MODELED_RANGE_NOTE).toMatch(/half, or one and a half times/);
  });

  it("never models more avoided loss than the expected loss", () => {
    const inputs = {
      ...DEFAULT_VALUE_CASE,
      annualExposure: 250_000,
      eventProbability: 0.04,
      controlEffectiveness: 0.8,
    };
    const { modeled } = calculateValueCase(inputs);
    expect(modeled.expectedLossBefore).toBeCloseTo(10_000);
    expect(modeled.base).toBeCloseTo(8_000);
    expect(modeled.high).toBeCloseTo(10_000);
    expect(createValueCaseMemo(inputs, at)).toContain("High is capped at the expected loss");
    expect(createValueCaseMemo(DEFAULT_VALUE_CASE, at)).not.toContain("capped");
  });

  it("lists each evidence item's amount and date, and the verified register totals", () => {
    const evidence: ValueEvidence[] = [
      {
        id: "r1",
        kind: "recovery",
        description: "Duplicate supplier payment recovered",
        source: "AP credit memo 118",
        amount: 2_400,
        observedAt: "2026-08-01",
        verified: true,
      },
    ];
    const memo = createValueCaseMemo(
      { ...DEFAULT_VALUE_CASE, directRecoveries: 500 },
      at,
      evidence,
    );
    expect(memo).toContain("| Status | Type | Observation | Amount | Observed | Source |");
    expect(memo).toContain(
      "| Verified | Money recovered | Duplicate supplier payment recovered | $2,400 | Aug 1, 2026 | AP credit memo 118 |",
    );
    expect(memo).toContain("- Cash recovered: $500");
    expect(memo).toContain(
      "- Verified recoveries in the evidence register: $2,400 (1 verified of 1 item); this differs from the cash recovered above",
    );
  });

  it("writes negative money with the sign first", () => {
    expect(formatUsd(-3640)).toBe("-$3,640");
    expect(formatUsd(5000)).toBe("$5,000");
  });
});
