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

  it("has nothing left to offer when every lever is already pulled", () => {
    const t = tornadoSensitivity(dental, { ...strong, segregationScore: 75 });
    expect(t.levers).toEqual([]);
  });

  it("never offers a lever that would lower a score the team already beats", () => {
    // A fully separated team scores 100: "raise to 75" must not pull it down,
    // and a team of 12 is not asked to "grow to 10".
    const t = tornadoSensitivity(dental, {
      ...weak,
      segregationScore: 100,
      teamSize: 12,
    });
    const ids = t.levers.map((l) => l.id);
    expect(ids).not.toContain("seg");
    expect(ids).not.toContain("team");
    for (const l of t.levers) {
      expect(l.delta, l.id).toBeGreaterThan(0);
      expect(l.improvedAvg).toBe(t.baseAverage - l.delta);
    }
  });
});

describe("own business scope", () => {
  const people = [
    {
      id: "own-1",
      name: "Ana Ruiz",
      role: "Owner",
      active: true,
      entitlements: ["bank_reconcile" as const, "view_reports_only" as const],
    },
    {
      id: "own-2",
      name: "Ben Ochoa",
      role: "Office Manager",
      active: true,
      entitlements: [
        "create_vendor" as const,
        "release_payment" as const,
        "view_reports_only" as const,
      ],
    },
  ];
  const own = resolveTemplate({ industry: "dental", customPeople: people, customRelations: [] });

  it("scores no register rows while the register is not assessed, and says so", () => {
    const summary = portfolioSummary(own, own.staffComposition);
    expect(summary.all.filter((s) => s.category === "knowledge")).toEqual([]);
    expect(summary.knowledgeAssessed).toBe(false);
  });

  it("scores starter scenarios only once the owner confirms one", () => {
    const none = portfolioSummary(own, own.staffComposition);
    expect(none.all.filter((s) => s.category === "scenario")).toEqual([]);
    expect(none.starterScenariosLeftOut).toEqual(own.scenarios.map((s) => s.id));
    const one = portfolioSummary(own, own.staffComposition, undefined, {
      confirmedScenarioIds: new Set(["sc-vendor-fraud"]),
    });
    expect(one.all.filter((s) => s.category === "scenario").map((s) => s.id)).toEqual([
      "scen-sc-vendor-fraud",
    ]);
    expect(one.starterScenariosLeftOut).not.toContain("sc-vendor-fraud");
  });

  it("scores the register once someone is marked on it", () => {
    const marked = resolveTemplate({
      industry: "dental",
      customPeople: people,
      customRelations: [{ personId: "own-2", knowledgeId: "k1", level: "expert" }],
    });
    const rows = portfolioSummary(marked, marked.staffComposition).all;
    expect(rows.some((s) => s.id === "know-k1")).toBe(true);
  });
});

describe("scenario row formula", () => {
  it("shows the credited effectiveness that reproduces the residual", () => {
    for (const row of scoreAllResidualRisks(dental).filter((s) => s.category === "scenario")) {
      expect(row.effectivenessCredit).toBe(0.5);
      // Both figures are rounded from the same unrounded effectiveness.
      expect(
        Math.abs(row.creditedEffectiveness! - row.controlEffectiveness * 0.5),
      ).toBeLessThanOrEqual(1);
      const uplift = row.residual / Math.max(1, row.residualRaw);
      const recomputed = (row.inherent / 100) * (1 - row.creditedEffectiveness! / 100) * 100;
      // Within rounding of the displayed integers, I × (1 − credited E) gives the raw residual.
      expect(Math.abs(recomputed - row.residualRaw), row.id).toBeLessThanOrEqual(1.5);
      expect(uplift).toBeGreaterThanOrEqual(1);
    }
  });

  it("names the day figure as assumed days until found", () => {
    const row = scoreAllResidualRisks(dental).find((s) => s.category === "scenario")!;
    const days = row.drivers.find((d) => d.id.endsWith("-time"))!;
    expect(days.label).toBe("Assumed days until found");
    expect(days.detail).not.toMatch(/p50/);
  });
});

describe("starter controls on an owner's own business", () => {
  const base = getBaseTemplate("retail");
  const people = base.people.slice(0, 2);

  it("leaves out controls nobody has confirmed run here, and says which", () => {
    const tpl = resolveTemplate({ industry: "retail", customPeople: people });
    const summary = portfolioSummary(tpl, tpl.staffComposition);
    const scored = new Set(summary.all.map((r) => r.id));
    for (const id of ["c-ap", "c-ar", "c-sod-ar"]) expect(scored.has(`ctrl-${id}`)).toBe(false);
    expect(summary.starterControlsLeftOut.sort()).toEqual(["c-ap", "c-ar", "c-sod-ar"]);
  });

  it("scores a starter control once the owner confirms it", () => {
    const tpl = resolveTemplate({
      industry: "retail",
      customPeople: people,
      confirmedControlIds: ["c-ap"],
    });
    const summary = portfolioSummary(tpl, tpl.staffComposition);
    expect(summary.all.some((r) => r.id === "ctrl-c-ap")).toBe(true);
    expect(summary.starterControlsLeftOut).not.toContain("c-ap");
  });

  it("scores every sample control", () => {
    const summary = portfolioSummary(base, base.staffComposition);
    expect(summary.starterControlsLeftOut).toEqual([]);
    expect(summary.all.filter((r) => r.category === "control")).toHaveLength(base.controls.length);
  });
});
