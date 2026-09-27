import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS } from "@/lib/precog/scoring/weights";
import { formatWeight, weightLabel } from "./scoring-basis-copy";

describe("scoring disclosure", () => {
  it("names every weight in plain words, never its code key", () => {
    for (const group of Object.values(DEFAULT_WEIGHTS)) {
      for (const key of Object.keys(group)) {
        expect(weightLabel(key)).not.toBe(key);
      }
    }
  });

  it("prints the saturation points with units and shares as percentages", () => {
    expect(formatWeight("lossSaturationUsd", 125_000)).toBe("$125,000");
    expect(formatWeight("daysSaturation", 240)).toBe("240 days");
    expect(formatWeight("assetExposure", 0.28)).toBe("28%");
  });
});
