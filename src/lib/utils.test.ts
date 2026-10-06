import { describe, expect, it } from "vitest";
import {
  estimateUsdChange,
  formatEstimateUsd,
  formatEstimateUsdDelta,
  formatEstimateUsdRange,
  formatPct,
  formatSigned,
  formatUsd,
  formatUsdDelta,
  formatUsdTyped,
  roundToTwoFigures,
} from "./utils";

describe("formatUsd", () => {
  it("prints whole dollars with the sign in front", () => {
    expect(formatUsd(10_000)).toBe("$10,000");
    expect(formatUsd(-3640)).toBe("-$3,640");
    expect(formatUsd(3640.4)).toBe("$3,640");
  });

  it("never prints a negative zero", () => {
    expect(formatUsd(-0.4)).toBe("$0");
  });
});

describe("formatUsdDelta", () => {
  it("puts the sign before the dollar sign and rounds", () => {
    expect(formatUsdDelta(-3640)).toBe("-$3,640");
    expect(formatUsdDelta(3640.4)).toBe("+$3,640");
    expect(formatUsdDelta(0)).toBe("$0");
    expect(formatUsdDelta(0.2)).toBe("$0");
  });
});

describe("formatSigned", () => {
  it("marks gains with a plus", () => {
    expect(formatSigned(3)).toBe("+3");
    expect(formatSigned(-2)).toBe("-2");
    expect(formatSigned(0)).toBe("0");
  });
});

describe("formatPct", () => {
  it("prints a fraction as a percentage", () => {
    expect(formatPct(0.354)).toBe("35%");
    expect(formatPct(0.354, 1)).toBe("35.4%");
  });
});

describe("formatEstimateUsd (VALUE-7)", () => {
  it("rounds scenario dollars to two significant figures and says so", () => {
    expect(formatEstimateUsd(31_533)).toBe("about $32,000");
    expect(formatEstimateUsd(32_584)).toBe("about $33,000");
    expect(formatEstimateUsd(13_823)).toBe("about $14,000");
    expect(formatEstimateUsd(75_042)).toBe("about $75,000");
    expect(formatEstimateUsd(1_249)).toBe("about $1,200");
    expect(formatEstimateUsd(996)).toBe("about $1,000");
    expect(formatEstimateUsd(7.4)).toBe("about $7");
  });

  it("prints nothing as $0, not as an estimate", () => {
    expect(formatEstimateUsd(0)).toBe("$0");
    expect(formatEstimateUsd(0.3)).toBe("$0");
    expect(formatEstimateUsd(-0.3)).toBe("$0");
  });

  it("prints any amount that rounds to no whole dollar as $0, with no about and no sign", () => {
    for (const n of [-0.4, 0.4, -0, 0, 0.499, -0.499]) {
      expect(formatEstimateUsd(n), String(n)).toBe("$0");
      expect(formatEstimateUsdDelta(n), String(n)).toBe("$0");
    }
    // Half a dollar is a whole dollar, as formatUsd rounds it.
    expect(formatEstimateUsd(0.5)).toBe("about $1");
    expect(formatEstimateUsdDelta(-0.5)).toBe("about -$1");
  });

  it("rounds changes and ranges the same way", () => {
    expect(formatEstimateUsdDelta(-533)).toBe("about -$530");
    expect(formatEstimateUsdDelta(3_640)).toBe("about +$3,600");
    expect(formatEstimateUsdDelta(0.2)).toBe("$0");
    expect(formatEstimateUsdRange(13_823, 75_042)).toBe("about $14,000 – $75,000");
  });

  it("keeps the rounding rule in one place", () => {
    expect(roundToTwoFigures(31_533)).toBe(32_000);
    expect(roundToTwoFigures(-533)).toBe(-530);
    expect(roundToTwoFigures(0)).toBe(0);
    expect(roundToTwoFigures(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it("gives a change as the difference of the two printed estimates", () => {
    // "about $29,000" to "about $37,000": a reader subtracts 8,000, not the exact 7,780.
    expect(estimateUsdChange(28_753, 36_533)).toBe(8_000);
    expect(estimateUsdChange(36_533, 28_753)).toBe(-8_000);
    // Two figures that print the same estimate do not differ.
    expect(estimateUsdChange(36_533, 36_933)).toBe(0);
    // Not rounded again: two rounded figures can differ by any amount.
    expect(estimateUsdChange(29_000, 1_249_000)).toBe(1_171_000);
    expect(estimateUsdChange(0.3, 0.4)).toBe(0);
  });
});

describe("formatUsdTyped", () => {
  it("shows cents only when the typed amount has them", () => {
    expect(formatUsdTyped(500)).toBe("$500");
    expect(formatUsdTyped(12.5)).toBe("$12.50");
    expect(formatUsdTyped(1_000_000_000)).toBe("$1,000,000,000");
  });
});
