import { describe, expect, it } from "vitest";
import {
  BENFORD_FIRST,
  BENFORD_SECOND,
  benfordFirstDigit,
  benfordSecondDigit,
  firstDigit,
  secondDigit,
} from "./benford";

describe("Benford digit helpers", () => {
  it("defines normalized first- and second-digit distributions", () => {
    expect(BENFORD_FIRST.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 9);
    expect(BENFORD_SECOND.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 9);
  });

  it("extracts significant digits from ordinary and edge-case amounts", () => {
    expect(firstDigit(0.42)).toBe(4);
    expect(firstDigit(1234.5)).toBe(1);
    expect(firstDigit(0)).toBeNull();
    expect(firstDigit(Number.NaN)).toBeNull();
    expect(firstDigit(Number.POSITIVE_INFINITY)).toBeNull();
    expect(secondDigit(7)).toBeNull();
    expect(secondDigit(75)).toBe(5);
    expect(secondDigit(0.42)).toBe(2);
    expect(secondDigit(700)).toBe(0);
    expect(secondDigit(10)).toBe(0);
    expect(secondDigit(1000)).toBe(0);
  });

  it("recognizes a logarithmic sample as close or acceptable", () => {
    const amounts = Array.from({ length: 1000 }, (_, index) => 10 ** (((index + 0.5) / 1000) * 3));
    expect(["close", "acceptable"]).toContain(benfordFirstDigit(amounts).conformity);
  });

  it("counts round amounts' second-digit zeros, as the second-digit law expects", () => {
    // Whole-dollar amounts spread evenly on a log scale from $10 to $10,000.
    const amounts = Array.from({ length: 5000 }, (_, index) =>
      Math.round(10 ** (1 + ((index + 0.5) / 5000) * 3)),
    );
    const result = benfordSecondDigit(amounts);
    expect(result.n).toBe(5000);
    // Dropping amounts such as 700 or 1,000 used to pull this below 9%.
    expect(Math.abs(result.observed[0] - BENFORD_SECOND[0])).toBeLessThan(0.01);
  });

  it("recognizes a uniform first-digit sample as nonconforming", () => {
    const amounts = Array.from({ length: 1000 }, (_, index) => (index % 9) + 1);
    const result = benfordFirstDigit(amounts);
    expect(result.conformity).toBe("nonconformity");
    expect(result.pValueBand).toBe("<0.01");
  });
});
