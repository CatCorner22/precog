import { CORE_POLICY_FIELDS, POLICY_FIELDS } from "./insurance-record";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { getIndustryTemplate } from "../templates";
import type { Person } from "../types";
import { runPrecogScenario } from "../engine";
import { DEFAULT_RISK_VARIABLES, type RiskVariableState } from "./dynamic-variables";
import {
  CASCADE_LEVERS,
  HIGHER_IS_BETTER,
  LOWER_IS_BETTER,
  leverAffects,
  leverUnavailableReason,
  simulateAllCascades,
  simulateCascadeLever,
  type MetricSnapshot,
} from "./variable-cascade";

const dental = getIndustryTemplate("dental");

describe("assumed days until found", () => {
  it("counts fewer days as better, so detection improves them", () => {
    expect(LOWER_IS_BETTER.has("timelineP50")).toBe(true);
    expect(HIGHER_IS_BETTER.has("timelineP50")).toBe(false);
    const sim = simulateCascadeLever(
      dental,
      "enable_independent_bank_rec",
      DEFAULT_RISK_VARIABLES,
      dental.staffComposition,
      "sc-cash-sod-failure",
    );
    const days = sim.deltas.find((d) => d.key === "timelineP50")!;
    expect(days.label).toBe("Assumed days until found");
    expect(days.after).toBeLessThan(days.before);
    expect(days.direction).toBe("improves");
    expect(sim.secondOrderNotes.join(" ")).toContain(
      "Faster detection shortens the assumed days until found",
    );
  });

  it("uses the same words in the lever list and the dependency chips, with no percentile label", () => {
    const bank = CASCADE_LEVERS.find((l) => l.id === "enable_independent_bank_rec")!;
    expect(bank.affects).toContain("fewer assumed days until found");
    const all = simulateAllCascades(dental);
    expect(all.dependencyMap).toContainEqual({
      from: "bank_rec",
      to: "days_until_found",
      effect: "fewer assumed days until found",
    });
    // Every word an owner reads: lever copy, chips, delta labels, notes and verdicts.
    const text = JSON.stringify([
      CASCADE_LEVERS,
      all.dependencyMap,
      all.simulations.map((sim) => [
        sim.deltas.map((d) => d.label),
        sim.secondOrderNotes,
        sim.overallVerdict,
      ]),
    ]);
    expect(text).not.toMatch(/p50/i);
  });
});

describe("insurance levers on default policy figures", () => {
  it("are not modelled or ranked until the owner enters the figure they change", () => {
    const sim = simulateCascadeLever(dental, "lower_deductible_1k", DEFAULT_RISK_VARIABLES);
    expect(sim.available).toBe(false);
    expect(sim.deltas).toEqual([]);
    expect(sim.overallVerdict).toBe(
      "Not modelled until you confirm your policy: the deductible has not been confirmed. Review Insurance information status on Dynamic variables.",
    );
    const all = simulateAllCascades(dental, DEFAULT_RISK_VARIABLES);
    const ranked = all.rankedByCor.map((s) => s.lever.id);
    for (const id of ["raise_deductible_10k", "lower_deductible_1k", "raise_limit_250k"]) {
      expect(ranked).not.toContain(id);
    }
    const entered = simulateCascadeLever(dental, "lower_deductible_1k", {
      ...DEFAULT_RISK_VARIABLES,
      deductible: 7500,
      insurance: {
        status: "reported",
        confirmedFields: [...CORE_POLICY_FIELDS],
        modeledScenarioIds: dental.scenarios.map((scenario) => scenario.id),
      },
    });
    expect(entered.available).toBe(true);
    expect(entered.after.retainedExpected).toBeLessThan(entered.before.retainedExpected);
  });

  it("drops premium and credit effects from a lever's list while no policy is entered", () => {
    const dual = CASCADE_LEVERS.find((l) => l.id === "enable_dual_control")!;
    expect(leverAffects(dual, DEFAULT_RISK_VARIABLES).join(" ")).not.toMatch(/premium|credit/);
    expect(
      leverAffects(dual, {
        ...DEFAULT_RISK_VARIABLES,
        basePremiumAnnual: 1800,
        insurance: {
          status: "reported",
          confirmedFields: [...CORE_POLICY_FIELDS],
          modeledScenarioIds: [],
        },
      }),
    ).toEqual(dual.affects);
  });

  it("prices an own business with no policy as having none", () => {
    const own = resolveTemplate({
      industry: "dental",
      customPeople: [
        { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] } as Person,
      ],
    });
    const all = simulateAllCascades(own, DEFAULT_RISK_VARIABLES, own.staffComposition);
    expect(all.baseline.premiumAnnualNet).toBe(0);
    expect(all.baseline.retainedExpected).toBe(all.baseline.grossExpected);
  });
});

const own = resolveTemplate({
  industry: "dental",
  customPeople: [
    { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] } as Person,
    { id: "own-2", name: "Ben Cho", role: "Front desk", active: true, entitlements: [] } as Person,
  ],
});

/** A confirmed policy that models a recovery for every scenario. */
const enteredPolicy: RiskVariableState = {
  ...DEFAULT_RISK_VARIABLES,
  basePremiumAnnual: 4200,
  deductible: 2500,
  policyLimit: 150000,
  claimsLoadFactor: 1.3,
  underwritingLoadAnnual: 500,
  hasAlarmAccess: false,
  insurance: {
    status: "reported",
    confirmedFields: [...POLICY_FIELDS],
    modeledScenarioIds: dental.scenarios.map((scenario) => scenario.id),
  },
};

describe("cascade figures match the scenario engine", () => {
  const cases = [
    { name: "sample, default settings", tpl: dental, vars: DEFAULT_RISK_VARIABLES },
    { name: "sample, entered policy", tpl: dental, vars: enteredPolicy },
    { name: "own business, entered policy", tpl: own, vars: enteredPolicy },
  ];
  for (const { name, tpl, vars } of cases) {
    it(`prices the baseline as runPrecogScenario does (${name})`, () => {
      const scenarioId = "sc-cash-sod-failure";
      const confirmed = new Set([scenarioId]);
      const sim = simulateCascadeLever(
        tpl,
        "enable_cameras",
        vars,
        tpl.staffComposition,
        scenarioId,
        { confirmedScenarioIds: confirmed },
      );
      const engine = runPrecogScenario(tpl, scenarioId, {
        staff: tpl.staffComposition,
        riskVariables: vars,
      })!;
      const d = engine.dynamic!;
      expect(sim.before).toMatchObject({
        likelihoodMultiplier: d.likelihoodMultiplier,
        grossSeverityMultiplier: d.grossSeverityMultiplier,
        detectionLagMultiplier: d.detectionLagMultiplier,
        grossExpected: d.grossExpected,
        retainedExpected: d.retainedExpected,
        transferredExpected: d.transferredExpected,
        premiumAnnualNet: d.premiumAnnualNet,
        discountPctApplied: d.discountPctApplied,
        expectedAnnualCostOfRisk: d.expectedAnnualCostOfRisk,
        eventPlusPremiumExpected: d.eventPlusPremiumExpected,
        timelineP50: engine.timelineDays.p50,
      });
      expect(sim.before.grossExpected).toBe(engine.financialImpact.expected);
    });
  }

  it("reads dual control from the staff flag on both sides of a lever", () => {
    const staff = { ...dental.staffComposition, dualControlPayments: true };
    const stale = { ...DEFAULT_RISK_VARIABLES, hasDualControl: false };
    const consistent = { ...DEFAULT_RISK_VARIABLES, hasDualControl: true };
    const a = simulateCascadeLever(dental, "enable_cameras", stale, staff, "sc-cash-sod-failure");
    const b = simulateCascadeLever(
      dental,
      "enable_cameras",
      consistent,
      staff,
      "sc-cash-sod-failure",
    );
    expect(a.before.likelihoodMultiplier).toBe(b.before.likelihoodMultiplier);
    expect(a.after.likelihoodMultiplier).toBe(b.after.likelihoodMultiplier);
    expect(a.variablesAfter.hasDualControl).toBe(true);
  });
});

describe("which scenario the cascade models", () => {
  it("flags a starter scenario nobody confirmed as out of scope for an own business", () => {
    const all = simulateAllCascades(own, DEFAULT_RISK_VARIABLES, own.staffComposition);
    expect(all.scenarioInScope).toBe(false);
    expect(all.scopeNote).toMatch(/left out/);
    expect(all.scenarioTitle).toBe(own.scenarios.find((s) => s.id === all.scenarioId)!.title);
  });

  it("models a confirmed scenario, preferring a cash one", () => {
    const vendor = own.scenarios.find((s) => s.id === "sc-vendor-fraud")!;
    const onlyVendor = simulateAllCascades(
      own,
      DEFAULT_RISK_VARIABLES,
      own.staffComposition,
      undefined,
      {
        confirmedScenarioIds: new Set([vendor.id]),
      },
    );
    expect(onlyVendor.scenarioId).toBe(vendor.id);
    expect(onlyVendor.scenarioInScope).toBe(true);
    expect(onlyVendor.scopeNote).toBeNull();
    const withCash = simulateAllCascades(
      own,
      DEFAULT_RISK_VARIABLES,
      own.staffComposition,
      undefined,
      {
        confirmedScenarioIds: new Set([vendor.id, "sc-cash-sod-failure"]),
      },
    );
    expect(withCash.scenarioId).toBe("sc-cash-sod-failure");
  });

  it("models every sample scenario as in scope", () => {
    const all = simulateAllCascades(dental);
    expect(all.scenarioInScope).toBe(true);
    expect(all.scopeNote).toBeNull();
  });
});

describe("what a lever says it moves", () => {
  // Each unconditional affects entry names a figure the model moves. Entries
  // that start "can", or that speak about real life, are conditional.
  const CLAIMS: [RegExp, (keyof MetricSnapshot)[]][] = [
    [/likelihood/, ["likelihoodMultiplier"]],
    [/scheme size|loss that builds up/, ["grossSeverityMultiplier"]],
    [/detection lag/, ["detectionLagMultiplier"]],
    [/days until found/, ["timelineP50"]],
    [/premium/, ["premiumAnnualNet"]],
    [/annual cost of risk/, ["expectedAnnualCostOfRisk"]],
    [/retained loss/, ["retainedExpected"]],
    [/insurer/, ["transferredExpected"]],
    [/residual/, ["residualAverage"]],
    [/loss before insurance/, ["grossExpected"]],
  ];
  const staff = {
    ...dental.staffComposition,
    segregationScore: 40,
    dualControlPayments: false,
    independentBankRec: false,
  };

  for (const lever of CASCADE_LEVERS) {
    it(`${lever.id} moves every figure it names`, () => {
      const sim = simulateCascadeLever(
        dental,
        lever.id,
        enteredPolicy,
        staff,
        "sc-cash-sod-failure",
      );
      expect(sim.available).toBe(true);
      const moved = new Set(sim.deltas.map((d) => d.key));
      for (const claim of lever.affects) {
        if (/^can |real life|does not|still needs|works best/.test(claim)) continue;
        const keys = CLAIMS.filter(([re]) => re.test(claim)).flatMap(([, k]) => k);
        expect(keys.length, `unmapped claim "${claim}"`).toBeGreaterThan(0);
        for (const key of keys) expect(moved.has(key), `${lever.id}: "${claim}"`).toBe(true);
      }
    });
  }

  it("the claims-load lever changes only the load factor", () => {
    const sim = simulateCascadeLever(dental, "clean_claims_history", enteredPolicy);
    expect(sim.variablesAfter.claimsLoadFactor).toBe(1);
    expect(sim.variablesAfter.underwritingLoadAnnual).toBe(500);
    expect(sim.deltas.map((d) => d.key)).not.toContain("likelihoodMultiplier");
  });
});

describe("levers that change nothing", () => {
  it("are unavailable when no recovery is modelled for the scenario", () => {
    const vars = {
      ...enteredPolicy,
      insurance: { ...enteredPolicy.insurance!, modeledScenarioIds: [] },
    };
    expect(leverUnavailableReason("lower_deductible_1k", vars)).toBeNull();
    const reason = leverUnavailableReason("lower_deductible_1k", vars, "sc-cash-sod-failure");
    expect(reason).toMatch(/mark this scenario as covered/);
    const sim = simulateCascadeLever(
      dental,
      "lower_deductible_1k",
      vars,
      undefined,
      "sc-cash-sod-failure",
    );
    expect(sim.available).toBe(false);
    expect(sim.overallVerdict).toBe(reason);
  });

  it("are unavailable when the control is already on, and never print an empty verdict", () => {
    // No business is assumed to have an alarm (G05b), so this one says it has.
    const alarmOn = { ...DEFAULT_RISK_VARIABLES, hasAlarmAccess: true };
    const sim = simulateCascadeLever(dental, "enable_alarm", alarmOn);
    expect(sim.available).toBe(false);
    expect(sim.overallVerdict).toMatch(/^Already in place/);
    const all = simulateAllCascades(dental, alarmOn);
    for (const s of all.simulations) expect(s.overallVerdict).not.toMatch(/^\./);
    expect(all.rankedByCor.map((s) => s.lever.id)).not.toContain("enable_alarm");
  });
});

describe("cascade copy", () => {
  it("spells out cost of risk and expected loss and uses no arrows as verbs", () => {
    const all = simulateAllCascades(dental, enteredPolicy);
    const text = JSON.stringify([
      CASCADE_LEVERS.map((l) => l.affects),
      all.dependencyMap.map((d) => d.effect),
      all.simulations.map((sim) => [sim.secondOrderNotes, sim.overallVerdict]),
    ]);
    expect(text).not.toMatch(/\bCoR\b|\bEL\b|[↓↑→]|free lunch|Matrix layers/);
    const dual = all.simulations.find((s) => s.lever.id === "enable_dual_control")!;
    expect(dual.overallVerdict).toMatch(/^Annual cost of risk falls \$[\d,]+;/);
  });
});
