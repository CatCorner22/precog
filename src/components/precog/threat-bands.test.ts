import { describe, expect, it } from "vitest";
import { PRIORITY_BAND_LABEL } from "@/lib/precog/map-vision";
import { BAND_VARIANT, overallBand } from "./threat-bands";

describe("overallBand", () => {
  it("gives one reading per index: 72-74 is critical and red, 50-54 is watch, not amber", () => {
    for (const index of [72, 73, 74]) {
      expect(PRIORITY_BAND_LABEL[overallBand(index)]).toBe("Fix soon");
      expect(BAND_VARIANT[overallBand(index)]).toBe("danger");
    }
    for (const index of [50, 54]) {
      expect(overallBand(index)).toBe("watch");
      expect(BAND_VARIANT[overallBand(index)]).toBe("ok");
    }
    expect(BAND_VARIANT[overallBand(88)]).toBe("danger");
    expect(BAND_VARIANT[overallBand(60)]).toBe("warn");
  });
});
