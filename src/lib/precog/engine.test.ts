import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "./active-template";
import { findKnowledgeRisks, rankDangerousScenarios, runPrecogScenario } from "./engine";
import { INDUSTRIES } from "./industry";
import type { StaffComposition } from "./types";

const dental = getBaseTemplate("dental");

describe("findKnowledgeRisks", () => {
  it("only reports critical or important knowledge, sorted by risk", () => {
    const risks = findKnowledgeRisks(dental);
    expect(risks.length).toBeGreaterThan(0);
    for (const r of risks) {
      const item = dental.knowledge.find((k) => k.id === r.knowledgeId)!;
      expect(["critical", "important"]).toContain(item.criticality);
      expect(r.soleOwner).toBe(r.ownerCount === 1);
    }
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i - 1].riskScore).toBeGreaterThanOrEqual(risks[i].riskScore);
    }
  });

  it("marks knowledge with no strong holder as unowned and highest risk", () => {
    const tpl = { ...dental, relations: [] };
    const risks = findKnowledgeRisks(tpl);
    expect(risks.every((r) => r.ownerCount === 0)).toBe(true);
    expect(new Set(risks.map((r) => r.riskScore)).size).toBe(1);
  });
});

describe("runPrecogScenario", () => {
  it("returns null for an unknown scenario", () => {
    expect(runPrecogScenario(dental, "sc-does-not-exist")).toBeNull();
  });

  it("produces an ordered timeline and impact range for every scenario in every industry", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = getBaseTemplate(id);
      for (const scenario of tpl.scenarios) {
        const r = runPrecogScenario(tpl, scenario.id);
        expect(r, `${id}/${scenario.id}`).not.toBeNull();
        const { timelineDays: t, financialImpact: f, retainedImpact: ret } = r!;
        expect(t.p95Low).toBeLessThanOrEqual(t.p50);
        expect(t.p50).toBeLessThanOrEqual(t.p95High);
        expect(f.low).toBeLessThanOrEqual(f.expected);
        expect(f.expected).toBeLessThanOrEqual(f.high);
        expect(ret.expected).toBeLessThanOrEqual(f.expected);
        expect(r!.cascade.map((c) => c.layer)).toEqual(scenario.cascadeLayers);
      }
    }
  });

  it("names the people the business serves, not patients, outside dental", () => {
    const retail = getBaseTemplate("retail");
    const withSurface = retail.scenarios.find((s) => s.cascadeLayers.includes("surface"))!;
    const r = runPrecogScenario(retail, withSurface.id)!;
    const surface = r.cascade.find((c) => c.layer === "surface")!;
    expect(surface.effect).toMatch(/^Customers /);
    expect(surface.effect).not.toMatch(/patient/i);
  });

  it("reduces expected loss when mitigations are switched on", () => {
    const scenario = dental.scenarios[0];
    const none = runPrecogScenario(dental, scenario.id)!;
    const all = runPrecogScenario(dental, scenario.id, {
      mitigationIds: scenario.mitigations.map((m) => m.id),
    })!;
    expect(all.financialImpact.expected).toBeLessThan(none.financialImpact.expected);
    expect(all.timelineDays.p50).toBeLessThanOrEqual(none.timelineDays.p50);
  });

  it("scores a weakly controlled team worse than a strongly controlled one", () => {
    const weak: StaffComposition = {
      teamSize: 3,
      soleOwnerKnowledgeCount: 5,
      avgTenureYears: 1,
      segregationScore: 20,
      dualControlPayments: false,
      independentBankRec: false,
    };
    const strong: StaffComposition = {
      teamSize: 12,
      soleOwnerKnowledgeCount: 0,
      avgTenureYears: 8,
      segregationScore: 90,
      dualControlPayments: true,
      independentBankRec: true,
    };
    const fraud = dental.scenarios.find((s) => s.id === "sc-vendor-fraud")!;
    const w = runPrecogScenario(dental, fraud.id, { staff: weak })!;
    const s = runPrecogScenario(dental, fraud.id, { staff: strong })!;
    expect(w.financialImpact.expected).toBeGreaterThan(s.financialImpact.expected);
  });
});

describe("rankDangerousScenarios", () => {
  it("ranks every scenario once, highest score first", () => {
    const ranked = rankDangerousScenarios(dental);
    expect(ranked.map((r) => r.scenario.id).sort()).toEqual(
      dental.scenarios.map((s) => s.id).sort(),
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});
