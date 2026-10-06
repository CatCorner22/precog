import { describe, expect, it } from "vitest";
import { REGISTRY } from "@/lib/precog/templates/registry";
import {
  CONTROL_FAILURE_MODES,
  controlFailureModes,
  GENERIC_CONTROL_FAILURE_MODES,
} from "./control-failure-modes";

const controls = Object.values(REGISTRY).flatMap((template) => template.controls);
const controlIds = new Set(controls.map((control) => control.id));
const people = Object.values(REGISTRY).flatMap((template) => template.people);
const prohibitedTacticalWords =
  /\b(?:SoD|Segregation|COSO|Bus factor|Lean waste|Johari|Forensic screen|Residual risk register)\b/;

describe("controlFailureModes", () => {
  it("has one entry for every registry control and no orphan entries", () => {
    expect(Object.keys(CONTROL_FAILURE_MODES).sort()).toEqual([...controlIds].sort());
    for (const id of controlIds) expect(controlFailureModes(id)).toBe(CONTROL_FAILURE_MODES[id]);
  });

  it("uses unique, short, plain, name-free sentences for every failure mode", () => {
    const firstNames = new Set(
      people.map((person) => person.name.trim().split(/\s+/)[0].toLocaleLowerCase()),
    );
    const fullNames = people.map((person) => person.name.toLocaleLowerCase());
    const specificModes = Object.values(CONTROL_FAILURE_MODES).flat();
    expect(new Set(specificModes).size).toBe(specificModes.length);

    for (const sentence of [...specificModes, ...GENERIC_CONTROL_FAILURE_MODES]) {
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
  });

  it("provides two or three modes per control and a generic fallback for unknown ids", () => {
    for (const modes of Object.values(CONTROL_FAILURE_MODES)) {
      expect(modes.length).toBeGreaterThanOrEqual(2);
      expect(modes.length).toBeLessThanOrEqual(3);
    }
    expect(controlFailureModes("not-a-control")).toBe(GENERIC_CONTROL_FAILURE_MODES);
  });
});
