/**
 * Cross-variable cascade engine.
 * One change → second-order effects on likelihood, severity, premium,
 * retained loss, annual cost-of-risk, residual portfolio, and timelines.
 *
 * Educational decision model — not actuarial pricing.
 */
import { scenarios, staffComposition as demoStaff } from "../demo-data";
import { runPrecogScenario } from "../engine";
import { portfolioSummary } from "./residual-engine";
import {
  DEFAULT_RISK_VARIABLES,
  evaluateDynamicRisk,
  scenarioFlags,
  type RiskVariableState,
} from "./dynamic-variables";
import type { StaffComposition } from "../types";

export type CascadeLeverId =
  | "enable_dual_control"
  | "enable_independent_bank_rec"
  | "enable_cameras"
  | "enable_bonded_handlers"
  | "enable_alarm"
  | "raise_deductible_10k"
  | "lower_deductible_1k"
  | "raise_limit_250k"
  | "add_cameras_discount_stack"
  | "cut_daily_cash_20pct"
  | "clean_claims_history"
  | "raise_segregation_75";

export interface CascadeLever {
  id: CascadeLeverId;
  label: string;
  description: string;
  /** Human-readable graph of what else moves */
  affects: string[];
}

export const CASCADE_LEVERS: CascadeLever[] = [
  {
    id: "enable_dual_control",
    label: "Turn on dual control (payments/deposits)",
    description: "Two-person rule for release/custody.",
    affects: [
      "fraud likelihood ↓",
      "scheme size ↓",
      "premium credit unlocks",
      "net premium ↓",
      "retained EL ↓",
      "annual cost-of-risk ↓",
      "cash SoD residual ↓",
      "detection still needs bank rec",
    ],
  },
  {
    id: "enable_independent_bank_rec",
    label: "Independent bank reconciliation",
    description: "Owner/other recon without posting access.",
    affects: [
      "detection lag ↓",
      "cumulative severity ↓",
      "premium credit unlocks",
      "timeline p50 stretches (slower material impact)",
      "monitoring residual ↓",
    ],
  },
  {
    id: "enable_cameras",
    label: "Install security cameras (cash/safe/front)",
    description: "Deterrence + detection evidence.",
    affects: [
      "opportunity likelihood ↓",
      "detection lag ↓ slightly",
      "premium credit unlocks",
      "physical security residual ↓",
      "does not replace SoD",
    ],
  },
  {
    id: "enable_bonded_handlers",
    label: "Bond / screen cash handlers",
    description: "Bonding or enhanced background checks.",
    affects: [
      "dishonesty likelihood ↓ modestly",
      "premium credit unlocks",
      "recovery optics improve (model: mild severity relief)",
    ],
  },
  {
    id: "enable_alarm",
    label: "Monitored alarm / access control",
    description: "After-hours perimeter control.",
    affects: ["external theft likelihood ↓", "premium credit", "overnight severity ↓"],
  },
  {
    id: "raise_deductible_10k",
    label: "Raise deductible to $10,000",
    description: "More retained per claim; premium held constant unless carrier reprices.",
    affects: [
      "retained loss ↑ on mid/large claims",
      "transferred layer shrinks",
      "annual CoR may rise if EL is material",
      "slight likelihood uplift if monitoring investment lags",
    ],
  },
  {
    id: "lower_deductible_1k",
    label: "Lower deductible to $1,000",
    description: "Less retained per claim; premium model holds base constant.",
    affects: [
      "retained loss ↓",
      "insurer takes more of mid claims",
      "annual CoR often falls for high-EL scenarios",
      "premium may rise in real life (not auto-priced here)",
    ],
  },
  {
    id: "raise_limit_250k",
    label: "Raise policy limit to $250,000",
    description: "More transfer capacity on large schemes.",
    affects: [
      "transferred expected ↑ on large losses",
      "retained high-tail ↓",
      "premium may rise in real life (not auto-priced here)",
    ],
  },
  {
    id: "add_cameras_discount_stack",
    label: "Cameras + dual control + bank rec (stack)",
    description: "Full control stack that maximizes earned credits under cap.",
    affects: [
      "likelihood ↓↓",
      "severity ↓",
      "detection lag ↓",
      "discount stack hits max cap",
      "net premium ↓",
      "residual portfolio avg ↓",
      "multi-layer cascade dampened",
    ],
  },
  {
    id: "cut_daily_cash_20pct",
    label: "Cut daily cash exposure 20%",
    description: "Less cash intensity (cards, fewer open drawers).",
    affects: [
      "cash-scheme severity ↓",
      "opportunity intensity ↓",
      "gross EL ↓ on cash scenarios",
      "does not fix SoD design alone",
    ],
  },
  {
    id: "clean_claims_history",
    label: "Claims load factor → 1.0 (clean)",
    description: "Remove underwriting load from prior claims.",
    affects: ["premium ↓", "likelihood prior ↓ slightly", "severity prior ↓ slightly"],
  },
  {
    id: "raise_segregation_75",
    label: "Raise segregation score to 75",
    description: "Staff composition / duty redesign.",
    affects: [
      "staff residual uplift ↓",
      "SoD-linked scenario impact ↓",
      "portfolio average residual ↓",
      "pairs with dual control / bank rec for full effect",
    ],
  },
];

export interface MetricSnapshot {
  likelihoodMultiplier: number;
  grossSeverityMultiplier: number;
  detectionLagMultiplier: number;
  grossExpected: number;
  retainedExpected: number;
  transferredExpected: number;
  premiumAnnualNet: number;
  discountPctApplied: number;
  expectedAnnualCostOfRisk: number;
  eventPlusPremiumExpected: number;
  timelineP50: number;
  residualAverage: number;
  residualCriticalPath: number;
}

export interface MetricDelta {
  key: keyof MetricSnapshot;
  label: string;
  before: number;
  after: number;
  delta: number;
  pctChange: number | null;
  direction: "improves" | "worsens" | "neutral";
}

export interface CascadeSimulation {
  lever: CascadeLever;
  before: MetricSnapshot;
  after: MetricSnapshot;
  deltas: MetricDelta[];
  secondOrderNotes: string[];
  overallVerdict: string;
  variablesAfter: RiskVariableState;
  staffAfter: StaffComposition;
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function applyLever(
  leverId: CascadeLeverId,
  vars: RiskVariableState,
  staff: StaffComposition,
): { vars: RiskVariableState; staff: StaffComposition } {
  const v = { ...vars };
  const s = { ...staff };

  switch (leverId) {
    case "enable_dual_control":
      v.hasDualControl = true;
      s.dualControlPayments = true;
      break;
    case "enable_independent_bank_rec":
      v.hasIndependentBankRec = true;
      s.independentBankRec = true;
      break;
    case "enable_cameras":
      v.hasSecurityCameras = true;
      break;
    case "enable_bonded_handlers":
      v.hasBondedCashHandlers = true;
      break;
    case "enable_alarm":
      v.hasAlarmAccess = true;
      break;
    case "raise_deductible_10k":
      v.deductible = Math.max(v.deductible, 10000);
      break;
    case "lower_deductible_1k":
      v.deductible = Math.min(v.deductible, 1000);
      break;
    case "raise_limit_250k":
      v.policyLimit = Math.max(v.policyLimit, 250000);
      break;
    case "add_cameras_discount_stack":
      v.hasSecurityCameras = true;
      v.hasDualControl = true;
      v.hasIndependentBankRec = true;
      s.dualControlPayments = true;
      s.independentBankRec = true;
      break;
    case "cut_daily_cash_20pct":
      v.dailyCashExposure = Math.round(v.dailyCashExposure * 0.8);
      break;
    case "clean_claims_history":
      v.claimsLoadFactor = 1;
      v.underwritingLoadAnnual = 0;
      break;
    case "raise_segregation_75":
      s.segregationScore = Math.max(s.segregationScore, 75);
      break;
  }

  // Keep staff ↔ variable booleans aligned
  v.hasDualControl = s.dualControlPayments || v.hasDualControl;
  v.hasIndependentBankRec = s.independentBankRec || v.hasIndependentBankRec;
  if (leverId === "enable_dual_control" || leverId === "add_cameras_discount_stack") {
    s.dualControlPayments = v.hasDualControl;
  }
  if (leverId === "enable_independent_bank_rec" || leverId === "add_cameras_discount_stack") {
    s.independentBankRec = v.hasIndependentBankRec;
  }

  return { vars: v, staff: s };
}

function snapshot(
  vars: RiskVariableState,
  staff: StaffComposition,
  scenarioId: string,
): MetricSnapshot {
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const flags = scenarioFlags(scenario.id);
  const dyn = evaluateDynamicRisk(vars, scenario.baseFinancialImpact, flags);
  const result = runPrecogScenario(scenario.id, {
    staff,
    riskVariables: vars,
  })!;
  const portfolio = portfolioSummary(staff);

  return {
    likelihoodMultiplier: dyn.likelihoodSeverity.likelihoodMultiplier,
    grossSeverityMultiplier: dyn.likelihoodSeverity.grossSeverityMultiplier,
    detectionLagMultiplier: dyn.likelihoodSeverity.detectionLagMultiplier,
    grossExpected: dyn.transfer.grossLossExpected,
    retainedExpected: dyn.transfer.retainedExpected,
    transferredExpected: dyn.transfer.transferredExpected,
    premiumAnnualNet: dyn.transfer.premiumAnnualNet,
    discountPctApplied: dyn.transfer.discountPctApplied,
    expectedAnnualCostOfRisk: dyn.transfer.expectedAnnualCostOfRisk,
    eventPlusPremiumExpected: dyn.transfer.eventPlusPremiumExpected,
    timelineP50: result.timelineDays.p50,
    residualAverage: portfolio.averageResidual,
    residualCriticalPath: portfolio.criticalPath,
  };
}

const LOWER_IS_BETTER: Set<keyof MetricSnapshot> = new Set([
  "likelihoodMultiplier",
  "grossSeverityMultiplier",
  "detectionLagMultiplier",
  "grossExpected",
  "retainedExpected",
  "premiumAnnualNet",
  "expectedAnnualCostOfRisk",
  "eventPlusPremiumExpected",
  "residualAverage",
  "residualCriticalPath",
]);

// For timeline p50: longer is better (delay material impact)
// For transferred: higher can be better (more risk transferred) when gross is fixed
const HIGHER_IS_BETTER: Set<keyof MetricSnapshot> = new Set([
  "timelineP50",
  "transferredExpected",
  "discountPctApplied",
]);

const LABELS: Record<keyof MetricSnapshot, string> = {
  likelihoodMultiplier: "Likelihood multiplier",
  grossSeverityMultiplier: "Gross severity multiplier",
  detectionLagMultiplier: "Detection lag multiplier",
  grossExpected: "Gross expected loss",
  retainedExpected: "Retained expected loss",
  transferredExpected: "Transferred to insurer",
  premiumAnnualNet: "Net annual premium",
  discountPctApplied: "Discount % applied",
  expectedAnnualCostOfRisk: "Annual cost of risk",
  eventPlusPremiumExpected: "Event + 1yr premium",
  timelineP50: "Timeline p50 (days)",
  residualAverage: "Portfolio avg residual",
  residualCriticalPath: "Critical-path count",
};

function buildDeltas(before: MetricSnapshot, after: MetricSnapshot): MetricDelta[] {
  const keys = Object.keys(before) as (keyof MetricSnapshot)[];
  return keys
    .map((key) => {
      const b = before[key];
      const a = after[key];
      const delta = a - b;
      const pctChange = b === 0 ? null : (delta / Math.abs(b)) * 100;
      let direction: MetricDelta["direction"] = "neutral";
      if (Math.abs(delta) < 1e-9) direction = "neutral";
      else if (LOWER_IS_BETTER.has(key)) direction = delta < 0 ? "improves" : "worsens";
      else if (HIGHER_IS_BETTER.has(key)) direction = delta > 0 ? "improves" : "worsens";
      return {
        key,
        label: LABELS[key],
        before: b,
        after: a,
        delta,
        pctChange,
        direction,
      };
    })
    .filter((d) => Math.abs(d.delta) > 1e-9);
}

function secondOrderNotes(
  leverId: CascadeLeverId,
  deltas: MetricDelta[],
  before: MetricSnapshot,
  after: MetricSnapshot,
): string[] {
  const notes: string[] = [];
  const byKey = Object.fromEntries(deltas.map((d) => [d.key, d])) as Partial<
    Record<keyof MetricSnapshot, MetricDelta>
  >;

  if (byKey.premiumAnnualNet && byKey.retainedExpected) {
    if (
      byKey.premiumAnnualNet.direction === "improves" &&
      byKey.retainedExpected.direction === "improves"
    ) {
      notes.push(
        "Premium and retained loss both fall — control credits and loss reduction stack (best case).",
      );
    }
    if (
      byKey.premiumAnnualNet.direction === "improves" &&
      byKey.retainedExpected.direction === "worsens"
    ) {
      notes.push(
        "Premium falls but retained rises — check deductible/limit; cheap premium does not mean lower owner risk.",
      );
    }
    if (
      byKey.premiumAnnualNet.direction === "worsens" &&
      byKey.retainedExpected.direction === "improves"
    ) {
      notes.push(
        "You may pay more premium (or lose little) while retained drops — still can improve annual CoR if EL is high.",
      );
    }
  }

  if (byKey.discountPctApplied && after.discountPctApplied >= before.discountPctApplied) {
    if (after.discountPctApplied > 0 && before.discountPctApplied === after.discountPctApplied) {
      notes.push(
        "Discount % did not rise — credit may already be earned, or stack hit the max discount cap.",
      );
    }
  }

  if (byKey.timelineP50 && byKey.likelihoodMultiplier) {
    notes.push(
      "Timeline and likelihood are linked: faster detection / lower opportunity stretches p50 and shrinks multi-period severity.",
    );
  }

  if (byKey.residualAverage && byKey.expectedAnnualCostOfRisk) {
    if (
      byKey.residualAverage.direction === "improves" &&
      byKey.expectedAnnualCostOfRisk.direction === "improves"
    ) {
      notes.push(
        "Portfolio residual and annual cost-of-risk move together — control design and transfer terms both improved.",
      );
    }
  }

  if (leverId === "raise_deductible_10k") {
    notes.push(
      "Model holds base premium constant when deductible rises. Real carriers often cut premium — re-quote; do not assume free lunch.",
    );
  }
  if (leverId === "lower_deductible_1k" || leverId === "raise_limit_250k") {
    notes.push(
      "Model holds base premium constant when limit/deductible improve. Real carriers often raise premium — treat CoR as directional.",
    );
  }
  if (leverId === "enable_dual_control" && !byKey.detectionLagMultiplier) {
    notes.push(
      "Dual control cuts opportunity but does not replace independent recon — detection lag may still be weak.",
    );
  }
  if (leverId === "add_cameras_discount_stack") {
    notes.push(
      "Stacked controls hit multiple Matrix layers (control, process, continuity) and usually max the discount cap.",
    );
  }
  if (leverId === "raise_segregation_75") {
    notes.push(
      "Segregation score is staff/design; it multiplies with insurance variables but does not unlock carrier credits alone.",
    );
  }

  if (notes.length === 0) {
    notes.push("Primary effects dominate; second-order interactions were small under current inputs.");
  }
  return notes;
}

function verdict(deltas: MetricDelta[]): string {
  const improves = deltas.filter((d) => d.direction === "improves").length;
  const worsens = deltas.filter((d) => d.direction === "worsens").length;
  const cor = deltas.find((d) => d.key === "expectedAnnualCostOfRisk");
  const ret = deltas.find((d) => d.key === "retainedExpected");
  const res = deltas.find((d) => d.key === "residualAverage");

  const parts: string[] = [];
  if (cor) {
    parts.push(
      `Annual CoR ${cor.direction === "improves" ? "improves" : cor.direction === "worsens" ? "worsens" : "flat"} by ${usd(Math.abs(cor.delta))}`,
    );
  }
  if (ret) {
    parts.push(
      `retained EL ${ret.direction === "improves" ? "↓" : ret.direction === "worsens" ? "↑" : "→"} ${usd(Math.abs(ret.delta))}`,
    );
  }
  if (res) {
    parts.push(
      `avg residual ${res.direction === "improves" ? "↓" : res.direction === "worsens" ? "↑" : "→"} ${Math.abs(Math.round(res.delta))}`,
    );
  }
  const balance =
    worsens === 0
      ? "No material tradeoffs in-model."
      : improves > worsens
        ? "Net positive with some tradeoffs."
        : improves < worsens
          ? "Net tradeoff-heavy — read second-order notes."
          : "Mixed effects — judge by CoR and residual, not one metric.";
  return `${parts.join("; ")}. ${balance}`;
}

export function simulateCascadeLever(
  leverId: CascadeLeverId,
  baseVars: RiskVariableState = DEFAULT_RISK_VARIABLES,
  baseStaff: StaffComposition = demoStaff,
  scenarioId?: string,
): CascadeSimulation {
  const lever =
    CASCADE_LEVERS.find((l) => l.id === leverId) ?? CASCADE_LEVERS[0];
  const rankedScenario =
    scenarioId ||
    scenarios.find((s) => s.id.includes("cash"))?.id ||
    scenarios[0].id;

  const before = snapshot(baseVars, baseStaff, rankedScenario);
  const applied = applyLever(lever.id, baseVars, baseStaff);
  const after = snapshot(applied.vars, applied.staff, rankedScenario);
  const deltas = buildDeltas(before, after);

  return {
    lever,
    before,
    after,
    deltas,
    secondOrderNotes: secondOrderNotes(lever.id, deltas, before, after),
    overallVerdict: verdict(deltas),
    variablesAfter: applied.vars,
    staffAfter: applied.staff,
  };
}

/** Simulate all levers; rank by improvement in annual cost of risk then residual. */
export function simulateAllCascades(
  baseVars: RiskVariableState = DEFAULT_RISK_VARIABLES,
  baseStaff: StaffComposition = demoStaff,
  scenarioId?: string,
): {
  scenarioId: string;
  baseline: MetricSnapshot;
  simulations: CascadeSimulation[];
  rankedByCor: CascadeSimulation[];
  rankedByResidual: CascadeSimulation[];
  dependencyMap: { from: string; to: string; effect: string }[];
} {
  const sid =
    scenarioId ||
    scenarios.find((s) => s.id.includes("cash"))?.id ||
    scenarios[0].id;
  const baseline = snapshot(baseVars, baseStaff, sid);
  const simulations = CASCADE_LEVERS.map((l) =>
    simulateCascadeLever(l.id, baseVars, baseStaff, sid),
  );

  const rankedByCor = [...simulations].sort((a, b) => {
    const da =
      a.after.expectedAnnualCostOfRisk - a.before.expectedAnnualCostOfRisk;
    const db =
      b.after.expectedAnnualCostOfRisk - b.before.expectedAnnualCostOfRisk;
    return da - db; // most negative first
  });

  const rankedByResidual = [...simulations].sort((a, b) => {
    const da = a.after.residualAverage - a.before.residualAverage;
    const db = b.after.residualAverage - b.before.residualAverage;
    return da - db;
  });

  const dependencyMap = [
    { from: "dual_control", to: "likelihood", effect: "↓ fraud opportunity" },
    { from: "dual_control", to: "premium", effect: "unlocks carrier credit" },
    { from: "dual_control", to: "severity", effect: "↓ scheme size" },
    { from: "bank_rec", to: "detection_lag", effect: "↓ multi-period loss" },
    { from: "bank_rec", to: "premium", effect: "unlocks carrier credit" },
    { from: "bank_rec", to: "timeline_p50", effect: "stretches time-to-impact" },
    { from: "cameras", to: "likelihood", effect: "↓ opportunity + mild detection" },
    { from: "cameras", to: "premium", effect: "unlocks carrier credit" },
    { from: "discount_stack", to: "max_discount_cap", effect: "credits capped" },
    { from: "deductible", to: "retained", effect: "↑ floor retained per claim" },
    { from: "deductible", to: "transferred", effect: "↓ insurer layer" },
    { from: "policy_limit", to: "transferred", effect: "caps recovery" },
    { from: "daily_cash", to: "severity", effect: "scales cash EL" },
    { from: "claims_load", to: "premium", effect: "multiplies base premium" },
    { from: "claims_load", to: "likelihood", effect: "mild prior uplift" },
    { from: "segregation_score", to: "residual_portfolio", effect: "staff uplift on residual" },
    { from: "segregation_score", to: "scenario_impact", effect: "staff risk multiplier" },
    {
      from: "premium_net",
      to: "annual_cost_of_risk",
      effect: "CoR ≈ premium + annualized retained",
    },
    {
      from: "retained_el",
      to: "annual_cost_of_risk",
      effect: "frequency-weighted retained feeds CoR",
    },
    {
      from: "controls",
      to: "residual_and_insurance",
      effect: "same control moves residual band AND premium credits",
    },
  ];

  return {
    scenarioId: sid,
    baseline,
    simulations,
    rankedByCor,
    rankedByResidual,
    dependencyMap,
  };
}
