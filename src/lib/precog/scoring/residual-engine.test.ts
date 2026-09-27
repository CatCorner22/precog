import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { getIndustryTemplate, type IndustryTemplate } from "../templates";
import { findKnowledgeRisks, runPrecogScenario } from "../engine";
import { INDUSTRIES, type IndustryId } from "../industry";
import type { StaffComposition } from "../types";
import { DEFAULT_RISK_VARIABLES } from "./dynamic-variables";
import { scenarioFlags } from "./scenario-kind";
import { portfolioSummary, scoreAllResidualRisks, tornadoSensitivity } from "./residual-engine";

const dental = getIndustryTemplate("dental");

/** The template with a second expert holder on every item one person holds. */
function crossTrained(tpl: IndustryTemplate): IndustryTemplate {
  const active = tpl.people.filter((p) => p.active);
  const extra = findKnowledgeRisks(tpl)
    .filter((r) => r.soleOwner)
    .map((r) => ({
      personId: active.find((p) => p.id !== r.owners[0].id)!.id,
      knowledgeId: r.knowledgeId,
      level: "expert" as const,
    }));
  const replaced = (rel: { personId: string; knowledgeId: string }) =>
    extra.some((e) => e.personId === rel.personId && e.knowledgeId === rel.knowledgeId);
  return { ...tpl, relations: [...tpl.relations.filter((rel) => !replaced(rel)), ...extra] };
}

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
      const tpl = getIndustryTemplate(id);
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
    expect(t.levers.map((l) => l.id).sort()).toEqual(["bank", "dual", "seg", "spof"]);
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
    const t = tornadoSensitivity(crossTrained(dental), { ...strong, segregationScore: 75 });
    expect(t.levers).toEqual([]);
  });

  it("prices cross-training as a real second holder on every item one person knows", () => {
    const staff = dental.staffComposition;
    const t = tornadoSensitivity(dental, staff);
    const spof = t.levers.find((l) => l.id === "spof")!;
    const real = portfolioSummary(crossTrained(dental), {
      ...staff,
      soleOwnerKnowledgeCount: 0,
    }).averageResidual;
    expect(spof.improvedAvg).toBe(real);
    // Zeroing the uplift alone leaves the register rows where they were.
    const upliftOnly = portfolioSummary(dental, { ...staff, soleOwnerKnowledgeCount: 0 });
    expect(spof.delta).toBeGreaterThan(t.baseAverage - upliftOnly.averageResidual);
  });

  it("never tells the owner to hire", () => {
    const t = tornadoSensitivity(dental, weak);
    expect(t.levers.some((l) => /grow team|hire/i.test(l.label))).toBe(false);
  });

  it("never offers a lever that would lower a score the team already beats", () => {
    // A fully separated team scores 100: "raise to 75" must not pull it down.
    const t = tornadoSensitivity(dental, {
      ...weak,
      segregationScore: 100,
      teamSize: 12,
    });
    const ids = t.levers.map((l) => l.id);
    expect(ids).not.toContain("seg");
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

  it("leaves knowledge redundancy out of control scores until the register is assessed", () => {
    const effectiveness = (tpl: IndustryTemplate) =>
      portfolioSummary(tpl, own.staffComposition).all.find((r) => r.id === "ctrl-c-sod-cash")!
        .controlEffectiveness;
    const holders = (ids: string[]) =>
      own.knowledge.flatMap((k) =>
        ids.map((personId) => ({ personId, knowledgeId: k.id, level: "expert" as const })),
      );
    const unassessed = effectiveness(own);
    const allSole = effectiveness(
      resolveTemplate({
        industry: "dental",
        customPeople: people,
        customRelations: holders(["own-1"]),
      }),
    );
    const allShared = effectiveness(
      resolveTemplate({
        industry: "dental",
        customPeople: people,
        customRelations: holders(["own-1", "own-2"]),
      }),
    );
    // An unanswered register is neither the worst answer nor the best one.
    expect(unassessed).toBeGreaterThan(allSole);
    expect(unassessed).toBeLessThan(allShared);
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
      // The staffing uplift drivers sum to the factor the row is multiplied by.
      const uplift =
        1 +
        row.drivers.filter((d) => d.id.startsWith("staff-")).reduce((sum, d) => sum + d.weight, 0);
      const recomputed =
        (row.inherent / 100) * (1 - row.creditedEffectiveness! / 100) * 100 * uplift;
      // Within rounding of the displayed integers, I × (1 − credited E) × uplift gives the residual.
      expect(Math.abs(recomputed - row.residual), row.id).toBeLessThanOrEqual(2);
    }
  });

  it("names the day figure as assumed days until found", () => {
    const row = scoreAllResidualRisks(dental).find((s) => s.category === "scenario")!;
    const days = row.drivers.find((d) => d.id.endsWith("-time"))!;
    expect(days.label).toBe("Assumed days until found");
    expect(days.detail).not.toMatch(/p50/);
  });
});

describe("scenario rows and the owner's risk variables", () => {
  it("price the loss and days the Scenario tab shows for the same settings", () => {
    const riskVariables = {
      ...DEFAULT_RISK_VARIABLES,
      hasSecurityCameras: true,
      dailyCashExposure: 1000,
    };
    const staff = dental.staffComposition;
    const row = scoreAllResidualRisks(dental, staff, undefined, { riskVariables }).find(
      (r) => r.id === "scen-sc-cash-sod-failure",
    )!;
    const tab = runPrecogScenario(dental, "sc-cash-sod-failure", { staff, riskVariables })!;
    expect(row.expectedLoss).toBe(tab.financialImpact.expected);
    expect(row.p50Days).toBe(tab.timelineDays.p50);
    const defaults = scoreAllResidualRisks(dental, staff).find(
      (r) => r.id === "scen-sc-cash-sod-failure",
    )!;
    expect(row.expectedLoss).not.toBe(defaults.expectedLoss);
  });
});

describe("starter controls on an owner's own business", () => {
  const base = getIndustryTemplate("retail");
  const people = base.people.slice(0, 2);

  it("leaves out controls nobody has confirmed run here, and says which", () => {
    const tpl = resolveTemplate({ industry: "retail", customPeople: people });
    const summary = portfolioSummary(tpl, tpl.staffComposition);
    const scored = new Set(summary.all.map((r) => r.id));
    const starters = ["c-ap", "c-inventory", "c-sod-ar"];
    for (const id of starters) expect(scored.has(`ctrl-${id}`)).toBe(false);
    expect(summary.starterControlsLeftOut.sort()).toEqual(starters);
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

describe("what a control guards", () => {
  const rows = (id: IndustryId) =>
    new Map(scoreAllResidualRisks(getIndustryTemplate(id)).map((r) => [r.id, r]));
  const fraudWeight = (row: { drivers: { id: string; weight: number }[] }) =>
    row.drivers.find((d) => d.id.endsWith("-inher-fraud"))?.weight;

  it("reads the high fraud opportunity from the scenario a control guards, not from letters in its id", () => {
    const nonprofit = rows("nonprofit");
    expect(fraudWeight(nonprofit.get("ctrl-c-cards")!)).toBe(0.85);
    expect(fraudWeight(nonprofit.get("ctrl-c-gift-log")!)).toBe(0.85);
    // "board" contains "ar"; board review guards no fraud scenario.
    expect(fraudWeight(nonprofit.get("ctrl-c-board-review")!)).toBe(0.45);
    const firm = rows("professional_services");
    expect(fraudWeight(firm.get("ctrl-c-trust-rec")!)).toBe(0.85);
    expect(fraudWeight(firm.get("ctrl-c-trust-disb")!)).toBe(0.85);
  });

  it("gives every control a fraud scenario names as its guard the high fraud class", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = getIndustryTemplate(id);
      const byId = rows(id);
      for (const s of tpl.scenarios) {
        if (!s.controlId || !scenarioFlags(s.id).fraudRelated) continue;
        const row = byId.get(`ctrl-${s.controlId}`);
        if (row) expect(fraudWeight(row), `${id}/${s.controlId}`).toBe(0.85);
      }
    }
  });

  it("links each control row to the scenario that names it", () => {
    const nonprofit = rows("nonprofit");
    expect(nonprofit.get("ctrl-c-cards")!.linkedScenarioId).toBe("sc-card-abuse");
    expect(rows("dental").get("ctrl-c-controlled")!.linkedScenarioId).toBe("sc-drug-diversion");
  });
});

describe("dual payment control in scenario rows", () => {
  it("credits fraud scenarios and leaves a departure where it was", () => {
    const off = { ...dental.staffComposition, dualControlPayments: false };
    const on = { ...off, dualControlPayments: true };
    const row = (staff: StaffComposition, id: string) =>
      scoreAllResidualRisks(dental, staff).find((r) => r.id === id)!;
    expect(row(on, "scen-sc-vendor-fraud").controlEffectiveness).toBeGreaterThan(
      row(off, "scen-sc-vendor-fraud").controlEffectiveness,
    );
    expect(row(on, "scen-sc-front-desk-leaves").controlEffectiveness).toBe(
      row(off, "scen-sc-front-desk-leaves").controlEffectiveness,
    );
  });
});
