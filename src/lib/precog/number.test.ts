import { describe, expect, it } from "vitest";
import { boundedNumber, clamp, wholePercent } from "./number";

describe("clamp", () => {
  it("holds a value to the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("boundedNumber", () => {
  const range = { min: 1, max: 500, fallback: 7 };

  it("pulls an out-of-range number into the range", () => {
    expect(boundedNumber(0, range)).toBe(1);
    expect(boundedNumber(900, range)).toBe(500);
    expect(boundedNumber(42, range)).toBe(42);
  });

  it("uses the fallback for anything that is not a finite number", () => {
    expect(boundedNumber("12", range)).toBe(7);
    expect(boundedNumber(Number.NaN, range)).toBe(7);
    expect(boundedNumber(undefined, range)).toBe(7);
  });
});

describe("wholePercent", () => {
  it("rounds and holds a score to 0..100", () => {
    expect(wholePercent(42.6)).toBe(43);
    expect(wholePercent(-3)).toBe(0);
    expect(wholePercent(140)).toBe(100);
  });
});
