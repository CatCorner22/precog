import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, WEIGHT_DESCRIPTIONS } from "@/lib/precog/scoring/weights";
import { formatWeight, weightLabel } from "./scoring-basis-copy";

describe("scoring disclosure", () => {
  it("names every weight in plain words, never its code key", () => {
    for (const group of Object.values(DEFAULT_WEIGHTS)) {
      for (const key of Object.keys(group)) {
        expect(weightLabel(key)).not.toBe(key);
      }
    }
  });

  it("prints dollars, multipliers and index values with units and shares as percentages", () => {
    expect(formatWeight("cashReferenceUsd", 2500)).toBe("$2,500");
    expect(formatWeight("weakSegregationFactor", 1.25)).toBe("×1.25");
    expect(formatWeight("soleCriticalIndex", 85)).toBe("85 of 100");
    expect(formatWeight("assetExposure", 0.28)).toBe("28%");
  });

  it("describes every published weight, and none that is not published", () => {
    const published = Object.entries(DEFAULT_WEIGHTS).flatMap(([group, values]) =>
      Object.keys(values).map((key) => `${group}.${key}`),
    );
    expect(Object.keys(WEIGHT_DESCRIPTIONS).sort()).toEqual([...published].sort());
  });

  it("claims no effect for a weight of zero", () => {
    for (const values of Object.values(DEFAULT_WEIGHTS)) {
      for (const [key, value] of Object.entries(values)) expect(value, key).not.toBe(0);
    }
  });
});
