import { describe, expect, it } from "vitest";
import { PRIORITY_BAND_LABEL, priorityBand } from "@/lib/precog/map-vision";
import { BAND_VARIANT, isUrgent } from "./threat-bands";

describe("BAND_VARIANT", () => {
  it("gives one reading per priority on the 88/70/45/35 scale, edge to edge", () => {
    const cases: [number, string, "danger" | "warn" | "ok"][] = [
      [100, "Top priority", "danger"],
      [88, "Top priority", "danger"],
      [87, "High priority", "danger"],
      [70, "High priority", "danger"],
      [69, "Medium priority", "warn"],
      [45, "Medium priority", "warn"],
      [44, "Low priority", "ok"],
      [35, "Low priority", "ok"],
      [34, "Not urgent", "ok"],
      [0, "Not urgent", "ok"],
    ];
    for (const [priority, label, variant] of cases) {
      expect(PRIORITY_BAND_LABEL[priorityBand(priority)], String(priority)).toBe(label);
      expect(BAND_VARIANT[priorityBand(priority)], String(priority)).toBe(variant);
    }
  });

  it("counts the two red bands as urgent", () => {
    expect(isUrgent("white_hot")).toBe(true);
    expect(isUrgent("critical")).toBe(true);
    expect(isUrgent("elevated")).toBe(false);
  });

  it("never borrows a residual band's name", () => {
    for (const label of Object.values(PRIORITY_BAND_LABEL)) {
      expect(["Fix first", "Fix soon", "Worth doing", "Watch"]).not.toContain(label);
    }
  });
});
