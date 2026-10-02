import { describe, expect, it } from "vitest";
import { PRIORITY_BAND_LABEL } from "@/lib/precog/map-vision";
import { BAND_VARIANT, overallBand } from "./threat-bands";

describe("overallBand", () => {
  it("gives one reading per index: 70-74 is high priority and red, 35-44 is low, not amber", () => {
    for (const index of [70, 72, 74]) {
      expect(PRIORITY_BAND_LABEL[overallBand(index)]).toBe("High priority");
      expect(BAND_VARIANT[overallBand(index)]).toBe("danger");
    }
    for (const index of [35, 44]) {
      expect(overallBand(index)).toBe("watch");
      expect(BAND_VARIANT[overallBand(index)]).toBe("ok");
    }
    expect(BAND_VARIANT[overallBand(88)]).toBe("danger");
    expect(BAND_VARIANT[overallBand(60)]).toBe("warn");
  });

  it("never borrows a residual band's name", () => {
    for (const label of Object.values(PRIORITY_BAND_LABEL)) {
      expect(["Fix first", "Fix soon", "Worth doing", "Watch"]).not.toContain(label);
    }
  });
});
