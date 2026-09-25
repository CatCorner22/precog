import { CORE_POLICY_FIELDS } from "./scoring/insurance-record";
import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "./active-template";
import { findKnowledgeRisks, rankDangerousScenarios, runPrecogScenario } from "./engine";
import { INDUSTRIES } from "./industry";
import { DEFAULT_RISK_VARIABLES } from "./scoring/dynamic-variables";
import type { Person, StaffComposition } from "./types";

const dental = getBaseTemplate("dental");

/** An owner's own team: two people, no register marks. */
const ownPeople: Person[] = [
  {
    id: "own-1",
    name: "Ana Ruiz",
    role: "Owner",
    active: true,
    entitlements: ["bank_reconcile", "view_reports_only"],
  },
  {
    id: "own-2",
    name: "Ben Ochoa",
    role: "Bookkeeper",
    active: true,
    entitlements: ["create_vendor", "release_payment", "view_reports_only"],
  },
];
const ownDental = resolveTemplate({ industry: "dental", customPeople: ownPeople });

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
    // A register the owner wrote themselves, with nobody marked yet. A plain
    // copy of the starter list is still the starter list, so each item is
    // renamed as the owner's own wording.
    const tpl = {
      ...dental,
      knowledge: dental.knowledge.map((k) => ({ ...k, name: `${k.name} (ours)` })),
      relations: [],
    };
    const risks = findKnowledgeRisks(tpl);
    expect(risks.length).toBeGreaterThan(0);
    expect(risks.every((r) => r.ownerCount === 0)).toBe(true);
    expect(new Set(risks.map((r) => r.riskScore)).size).toBe(1);
  });

  it("reports nothing for a starter register nobody has marked", () => {
    // The industry's starter list with no relations is not a fact about the business.
    expect(findKnowledgeRisks({ ...dental, relations: [] })).toEqual([]);
    const own = resolveTemplate({
      industry: "dental",
      customPeople: ownPeople,
      customRelations: [],
    });
    expect(findKnowledgeRisks(own)).toEqual([]);
  });

  it("does not count former (inactive) staff as holders", () => {
    const item = dental.knowledge.find((k) => k.criticality === "critical")!;
    const [active, former] = dental.people;
    const tpl = {
      ...dental,
      people: [active, { ...former, active: false }],
      relations: [
        { personId: active.id, knowledgeId: item.id, level: "proficient" as const },
        { personId: former.id, knowledgeId: item.id, level: "expert" as const },
      ],
    };
    const risk = findKnowledgeRisks(tpl).find((r) => r.knowledgeId === item.id)!;
    expect(risk.ownerCount).toBe(1);
    expect(risk.soleOwner).toBe(true);
    expect(risk.owners.map((p) => p.id)).toEqual([active.id]);
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

describe("insurance on an own business", () => {
  const fraud = "sc-vendor-fraud";

  it("keeps the whole loss with no premium until the owner enters a policy", () => {
    const r = runPrecogScenario(ownDental, fraud, { riskVariables: DEFAULT_RISK_VARIABLES })!;
    expect(r.retainedImpact.expected).toBe(r.financialImpact.expected);
    expect(r.dynamic?.premiumAnnualNet).toBe(0);
    expect(r.dynamic?.transferredExpected).toBe(0);
    expect(r.dynamic?.discountPctApplied).toBe(0);
    const line = r.crimeModifiers.find((m) => m.startsWith("Insurance"))!;
    expect(line).toContain("Insurance not assessed");
    expect(line).toContain("does not mean you are uninsured");
    expect(r.crimeModifiers.join(" ")).not.toMatch(/your premium/);
  });

  it("prices the policy the owner entered", () => {
    const r = runPrecogScenario(ownDental, fraud, {
      riskVariables: {
        ...DEFAULT_RISK_VARIABLES,
        basePremiumAnnual: 1800,
        deductible: 2500,
        insurance: {
          status: "reported",
          confirmedFields: [...CORE_POLICY_FIELDS],
          modeledScenarioIds: [fraud],
        },
      },
    })!;
    expect(r.dynamic?.premiumAnnualNet).toBe(1800);
    expect(r.retainedImpact.expected).toBeLessThan(r.financialImpact.expected);
    expect(r.crimeModifiers.join(" ")).toContain(
      "Conditional recovery using your scenario assumption",
    );
  });

  it("keeps the sample business on the app's default policy, labelled as such", () => {
    const r = runPrecogScenario(dental, "sc-front-desk-leaves")!;
    expect(r.dynamic?.premiumAnnualNet).toBe(4200);
    expect(r.retainedImpact.expected).toBe(5000);
    expect(r.crimeModifiers.join(" ")).toContain("Insurance: app default, enter your policy");
  });
});

describe("scenarios in scope", () => {
  it("ranks none of the starter scenarios for an own business until one is confirmed", () => {
    expect(rankDangerousScenarios(ownDental)).toEqual([]);
    const ranked = rankDangerousScenarios(ownDental, {
      confirmedScenarioIds: new Set(["sc-cash-sod-failure"]),
    });
    expect(ranked.map((r) => r.scenario.id)).toEqual(["sc-cash-sod-failure"]);
  });
});
