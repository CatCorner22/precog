import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "./industry";
import { blueprintsForIndustry } from "./operating-blueprint";

describe("blueprintsForIndustry", () => {
  for (const { id } of INDUSTRIES) {
    it(`gives ${id} a set of processes with unique ids and every field filled`, () => {
      const list = blueprintsForIndustry(id);
      expect(list.length).toBeGreaterThanOrEqual(10);
      expect(new Set(list.map((b) => b.id)).size).toBe(list.length);
      for (const b of list) {
        expect(b.name, b.id).not.toBe("");
        expect(b.objective, b.id).not.toBe("");
        expect(b.primaryOwner, b.id).not.toBe("");
        expect(b.independentReviewer, b.id).not.toBe("");
        expect(b.standard.length, b.id).toBeGreaterThan(0);
        expect(b.evidence.length, b.id).toBeGreaterThan(0);
      }
    });
  }

  it("says patient only for the dental and medical office", () => {
    for (const { id } of INDUSTRIES) {
      if (id === "dental") continue;
      const text = JSON.stringify(blueprintsForIndustry(id));
      expect(text, id).not.toMatch(/patient/i);
    }
  });

  it("uses US spelling and explains the tip-allocation rule", () => {
    for (const { id } of INDUSTRIES) {
      const text = JSON.stringify(blueprintsForIndustry(id));
      expect(text, id).not.toMatch(/authoris|analys(ed|e\b)|initialled|\bLeavers\b/);
    }
    const restaurant = JSON.stringify(blueprintsForIndustry("restaurant"));
    expect(restaurant).toContain("IRS 8% tip-allocation rule");
  });
});
