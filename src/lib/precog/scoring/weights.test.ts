import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, SCORING_VERSION, bandForScore } from "./weights";

describe("scoring weights", () => {
  it("versions the insurance-confirmation and financing-separation changes", () => {
    expect(SCORING_VERSION).toBe("precog-residual-v1.2.0");
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
