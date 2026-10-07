import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, RESIDUAL_BAND_LABEL, SCORING_VERSION, bandForScore } from "./weights";

describe("scoring weights", () => {
  it("versions the scenario-kind, control-guard and cross-training changes", () => {
    expect(SCORING_VERSION).toBe("precog-residual-v1.6.0");
  });

  it("keeps the inherent and control groups normalized", () => {
    expect(
      Object.values(DEFAULT_WEIGHTS.inherent).reduce((sum, weight) => sum + weight, 0),
    ).toBeCloseTo(1, 9);
    expect(
      Object.values(DEFAULT_WEIGHTS.control).reduce((sum, weight) => sum + weight, 0),
    ).toBeCloseTo(1, 9);
  });

  it("keeps a score between two bands in the lower band", () => {
    expect(bandForScore(39).band).toBe("accept_monitor");
    expect(bandForScore(39.5).band).toBe("accept_monitor");
    expect(bandForScore(40).band).toBe("mitigate");
    expect(bandForScore(59.5).band).toBe("mitigate");
    expect(bandForScore(79.5).band).toBe("act_now");
    expect(bandForScore(80).band).toBe("critical_path");
    expect(bandForScore(-3).band).toBe("accept_monitor");
    expect(bandForScore(140).band).toBe("critical_path");
  });
});

describe("residual bands", () => {
  it("name the residual bands Severe, High, Moderate and Low, never the priority list's words", () => {
    expect([80, 60, 40, 0].map((s) => bandForScore(s).label)).toEqual([
      "Severe",
      "High",
      "Moderate",
      "Low",
    ]);
    expect(RESIDUAL_BAND_LABEL).toEqual({
      critical_path: "Severe",
      act_now: "High",
      mitigate: "Moderate",
      accept_monitor: "Low",
    });
  });

  it("gives each band plain guidance with no priority-list words", () => {
    for (const s of [0, 40, 60, 80]) {
      expect(bandForScore(s).guidance).not.toMatch(/fix first|fix soon|worth doing|should/i);
    }
  });
});
