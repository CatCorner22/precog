import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { scoreAllResidualRisks } from "./residual-engine";
import { weightSensitivity } from "./sensitivity";
import { bandForScore, DEFAULT_WEIGHTS } from "./weights";

const dental = getBaseTemplate("dental");
const staff = dental.staffComposition;

describe("weightSensitivity", () => {
  it("leaves default scoring unchanged", () => {
    expect(scoreAllResidualRisks(dental, staff)).toEqual(
      scoreAllResidualRisks(dental, staff, DEFAULT_WEIGHTS),
    );
  });

  it("contains the base scores within every sensitivity range", () => {
    const report = weightSensitivity(dental, staff);
    expect(report.averageLow).toBeLessThanOrEqual(report.baseAverage);
    expect(report.averageHigh).toBeGreaterThanOrEqual(report.baseAverage);
    for (const item of report.items) {
      expect(item.low).toBeLessThanOrEqual(item.residual);
      expect(item.high).toBeGreaterThanOrEqual(item.residual);
      if (item.bandStable) {
        expect(bandForScore(item.low).band).toBe(item.band);
        expect(bandForScore(item.high).band).toBe(item.band);
      }
    }
  });

  it("collapses every range when perturbation is zero", () => {
    const report = weightSensitivity(dental, staff, 0);
    expect(report.topOrderStable).toBe(true);
    for (const item of report.items) {
      expect(item.low).toBe(item.residual);
      expect(item.high).toBe(item.residual);
    }
  });
});
