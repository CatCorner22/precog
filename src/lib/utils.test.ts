import { describe, expect, it } from "vitest";
import { formatPct, formatSigned, formatUsd, formatUsdDelta } from "./utils";

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
