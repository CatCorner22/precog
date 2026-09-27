import { describe, expect, it } from "vitest";
import { priorityBand, scorePriority } from "./map-vision";

describe("priorityBand", () => {
  it("bands at 88, 72, 55 and 35", () => {
    expect(priorityBand(88)).toBe("white_hot");
    expect(priorityBand(87)).toBe("critical");
    expect(priorityBand(72)).toBe("critical");
    expect(priorityBand(71)).toBe("elevated");
    expect(priorityBand(55)).toBe("elevated");
    expect(priorityBand(54)).toBe("watch");
    expect(priorityBand(35)).toBe("watch");
    expect(priorityBand(34)).toBe("cold");
  });
});

describe("scorePriority", () => {
  it("stays on 0 to 100", () => {
    for (const heat of [0, 50, 100]) {
      for (const kind of ["process", "risk", "control", "knowledge", "idea"]) {
        const { priority } = scorePriority({ heat, kind, riskSeverity: 5, riskLikelihood: 5 });
        expect(priority).toBeGreaterThanOrEqual(0);
        expect(priority).toBeLessThanOrEqual(100);
      }
    }
  });

  it("never falls when heat rises", () => {
    let last = -1;
    for (let heat = 0; heat <= 100; heat += 5) {
      const { priority } = scorePriority({ heat, kind: "process", dependencyCount: 2 });
      expect(priority).toBeGreaterThanOrEqual(last);
      last = priority;
    }
  });

  it("never falls when a risk's severity rises", () => {
    let last = -1;
    for (let sev = 1; sev <= 5; sev++) {
      const { priority } = scorePriority({ heat: 60, kind: "risk", riskSeverity: sev });
      expect(priority).toBeGreaterThanOrEqual(last);
      last = priority;
    }
  });

  it("flags an open control gap as high impact", () => {
    const r = scorePriority({ heat: 80, kind: "control" });
    expect(r.reasons).toContain("Open control / SoD gap");
    expect(r.immediate).toBe(true);
  });
});
