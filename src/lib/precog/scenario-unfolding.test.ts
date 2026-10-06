import { describe, expect, it } from "vitest";
import { REGISTRY } from "@/lib/precog/templates/registry";
import { SCENARIO_UNFOLDING, scenarioUnfolding } from "./scenario-unfolding";

const scenarios = Object.values(REGISTRY).flatMap((template) => template.scenarios);
const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
const people = Object.values(REGISTRY).flatMap((template) => template.people);
const prohibitedTacticalWords =
  /\b(?:SoD|Segregation|COSO|Bus factor|Lean waste|Johari|Forensic screen|Residual risk register)\b/;

describe("scenarioUnfolding", () => {
  it("has one entry for every registry scenario and no orphan entries", () => {
    expect(Object.keys(SCENARIO_UNFOLDING).sort()).toEqual([...scenarioIds].sort());
    for (const id of scenarioIds) expect(scenarioUnfolding(id)).toBe(SCENARIO_UNFOLDING[id]);
    expect(scenarioUnfolding("not-a-scenario")).toBeNull();
  });

  it("uses short, plain, name-free sentences for every step and warning sign", () => {
    const firstNames = new Set(
      people.map((person) => person.name.trim().split(/\s+/)[0].toLocaleLowerCase()),
    );
    const fullNames = people.map((person) => person.name.toLocaleLowerCase());
    for (const { steps, warningSigns } of Object.values(SCENARIO_UNFOLDING)) {
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps.length).toBeLessThanOrEqual(4);
      expect(warningSigns.length).toBeGreaterThanOrEqual(3);
      expect(warningSigns.length).toBeLessThanOrEqual(4);
      for (const sentence of [...steps, ...warningSigns]) {
        expect(sentence.trim()).not.toBe("");
        expect(sentence.length).toBeLessThanOrEqual(200);
        expect(sentence.endsWith(".")).toBe(true);
        expect(sentence).not.toMatch(/\bshould\b/i);
        expect(sentence).not.toMatch(/\be\.g\./i);
        expect(sentence).not.toMatch(/\bthe app\b/i);
        expect(sentence).not.toMatch(/\bbackup\b/i);
        expect(sentence).not.toMatch(/\d/);
        expect(sentence).not.toMatch(prohibitedTacticalWords);
        const words = new Set(sentence.toLocaleLowerCase().split(/[^a-z]+/));
        for (const firstName of firstNames) expect(words.has(firstName)).toBe(false);
        for (const fullName of fullNames)
          expect(sentence.toLocaleLowerCase()).not.toContain(fullName);
      }
    }
  });
});
