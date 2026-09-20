import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, SCORING_VERSION } from "./weights";

describe("scoring weights", () => {
  it("bumps the version because knowledge documentation credit was added", () => {
    expect(SCORING_VERSION).toBe("precog-residual-v1.1.0");
  });

  it("keeps the inherent and control groups normalized", () => {
    expect(
      Object.values(DEFAULT_WEIGHTS.inherent).reduce((sum, weight) => sum + weight, 0),
    ).toBeCloseTo(1, 9);
    expect(
      Object.values(DEFAULT_WEIGHTS.control).reduce((sum, weight) => sum + weight, 0),
    ).toBeCloseTo(1, 9);
  });
});
