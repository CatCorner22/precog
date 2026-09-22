import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import { findKnowledgeRisks } from "../engine";
import { INDUSTRIES } from "../industry";
import type { StaffComposition } from "../types";
import { portfolioSummary, scoreAllResidualRisks, tornadoSensitivity } from "./residual-engine";

const dental = getBaseTemplate("dental");

const weak: StaffComposition = {
  teamSize: 3,
  soleOwnerKnowledgeCount: 6,
  avgTenureYears: 0.5,
  segregationScore: 10,
  dualControlPayments: false,
  independentBankRec: false,
};
const strong: StaffComposition = {
  teamSize: 10,
  soleOwnerKnowledgeCount: 0,
  avgTenureYears: 8,
  segregationScore: 90,
  dualControlPayments: true,
  independentBankRec: true,
};

describe("scoreAllResidualRisks", () => {
  it("scores every control, knowledge risk and scenario once, on a 0-100 index, sorted high to low", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = getBaseTemplate(id);
      const scores = scoreAllResidualRisks(tpl);
      const byCat = (c: string) => scores.filter((s) => s.category === c);
      expect(byCat("control").length, id).toBe(tpl.controls.length);
      expect(byCat("scenario").length, id).toBe(tpl.scenarios.length);
      expect(byCat("knowledge").length, id).toBeGreaterThan(0);
      expect(new Set(scores.map((s) => s.id)).size).toBe(scores.length);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1].residual).toBeGreaterThanOrEqual(scores[i].residual);
      }
      for (const s of scores) {
        expect(s.residual).toBeGreaterThanOrEqual(0);
        expect(s.residual).toBeLessThanOrEqual(100);
        expect(s.drivers.length).toBeGreaterThan(0);
        expect(s.drivers.length).toBeLessThanOrEqual(6);
        expect(s.scoringVersion).toBeTruthy();
      }
    }
  });

  it("links each score back to the object it came from", () => {
    const scores = scoreAllResidualRisks(dental);
    const controls = new Set(dental.controls.map((c) => c.id));
    const knowledge = new Set(dental.knowledge.map((k) => k.id));
    const scenarios = new Set(dental.scenarios.map((s) => s.id));
    for (const s of scores) {
      if (s.category === "control") expect(controls.has(s.linkedControlId!)).toBe(true);
      if (s.category === "knowledge") expect(knowledge.has(s.linkedKnowledgeId!)).toBe(true);
      if (s.category === "scenario") {
        expect(scenarios.has(s.linkedScenarioId!)).toBe(true);
        expect(s.expectedLoss).toBeGreaterThan(0);
        expect(s.p50Days).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic and does not mutate the template", () => {
    const before = JSON.stringify(dental);
    const a = scoreAllResidualRisks(dental);
    const b = scoreAllResidualRisks(dental);
    expect(a).toEqual(b);
    expect(JSON.stringify(dental)).toBe(before);
  });

  it("credits written and findable knowledge procedures", () => {
    const knowledgeId = findKnowledgeRisks(dental).find(
      (risk) => risk.ownerCount >= 2,
    )!.knowledgeId;
    const item = dental.knowledge.find((knowledge) => knowledge.id === knowledgeId)!;
    const templateFor = (documented: boolean, procedureLocation?: string) =>
      resolveTemplate({
        industry: "dental",
        customKnowledge: dental.knowledge.map((knowledge) =>
          knowledge.id === item.id ? { ...knowledge, documented, procedureLocation } : knowledge,
        ),
      });
    const scoreFor = (template: typeof dental) =>
      scoreAllResidualRisks(template).find((score) => score.id === `know-${item.id}`)!;
    const unwritten = scoreFor(templateFor(false));
    const unlocated = scoreFor(templateFor(true));
    const located = scoreFor(templateFor(true, "Drive/SOPs"));

    expect(unwritten.residual).toBeGreaterThan(unlocated.residual);
    expect(unlocated.residual).toBeGreaterThan(located.residual);
    expect(unwritten.controlEffectiveness).toBeLessThan(unlocated.controlEffectiveness);
    expect(unlocated.controlEffectiveness).toBeLessThan(located.controlEffectiveness);
    expect(unwritten.drivers.find((driver) => driver.id === `k-${item.id}-doc`)?.label).toBe(
      "Nothing written down",
    );
    expect(unlocated.drivers.find((driver) => driver.id === `k-${item.id}-doc`)?.label).toBe(
      "Written procedure, location unknown",
    );
    expect(located.drivers.find((driver) => driver.id === `k-${item.id}-doc`)?.label).toBe(
      "Written procedure, findable",
    );
    expect(located.controlEffectiveness).toBe(85);
  });
});

describe("portfolioSummary", () => {
  it("rates a weak team worse than a strong one", () => {
    const w = portfolioSummary(dental, weak);
    const s = portfolioSummary(dental, strong);
    expect(w.averageResidual).toBeGreaterThan(s.averageResidual);
    expect(w.criticalPath + w.actNow).toBeGreaterThanOrEqual(s.criticalPath + s.actNow);
    expect(w.top.length).toBeLessThanOrEqual(8);
    expect(w.top).toEqual(w.all.slice(0, 8));
  });
});

describe("tornadoSensitivity", () => {
  it("shows every lever as non-worsening and sorted by how much it helps", () => {
    const t = tornadoSensitivity(dental, weak);
    expect(t.levers.map((l) => l.id).sort()).toEqual(["bank", "dual", "seg", "spof", "team"]);
    for (let i = 1; i < t.levers.length; i++) {
      expect(t.levers[i - 1].delta).toBeGreaterThanOrEqual(t.levers[i].delta);
    }
    for (const l of t.levers) {
      expect(l.delta).toBeGreaterThanOrEqual(0);
      expect(l.improvedAvg).toBe(t.baseAverage - l.delta);
    }
    expect(t.levers[0].delta).toBeGreaterThan(0);
  });

  it("has nothing left to gain when every lever is already pulled", () => {
    const t = tornadoSensitivity(dental, { ...strong, segregationScore: 75 });
    for (const l of t.levers) expect(l.delta, l.id).toBe(0);
  });
});
