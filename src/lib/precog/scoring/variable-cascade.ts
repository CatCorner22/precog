/**
 * Cross-variable cascade engine.
 * One change → second-order effects on likelihood, severity, premium,
 * retained loss, annual cost of risk, residual portfolio, and timelines.
 *
 * Every money and multiplier figure comes from runPrecogScenario, the engine
 * the Scenario tab uses, so a lever's before and after match that tab for the
 * same scenario and settings.
 *
 * Educational decision model — not actuarial pricing.
 */
import { runPrecogScenario } from "../engine";
import type { IndustryTemplate } from "../templates";
import type { StaffComposition } from "../types";
import { formatUsd } from "@/lib/utils";
import { portfolioSummary, type ResidualScope } from "./residual-engine";
import {
  DEFAULT_RISK_VARIABLES,
  mergeStaffIntoVariables,
  policyDefaultsInForce,
  policyEntered,
  policyFieldIsDefault,
  type RiskVariableState,
} from "./dynamic-variables";
import { normalizeInsuranceRecord } from "./insurance-record";
import { scenariosInScope, starterScenarioNote } from "./scope";

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

interface CascadeLever {
  id: CascadeLeverId;
  label: string;
  description: string;
  /**
   * What else moves, in plain words. Each entry names an effect the model
   * computes; an entry that starts "can" depends on the figures, and one that
   * mentions real life is outside the model.
   */
  affects: string[];
}

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

interface MetricDelta {
  key: keyof MetricSnapshot;
  label: string;
  before: number;
  after: number;
  delta: number;
  pctChange: number | null;
  direction: "improves" | "worsens";
}

interface CascadeSimulation {
  lever: CascadeLever;
  /**
   * False when the lever cannot be modelled (an insurance lever on unconfirmed
   * policy figures or without a modelled recovery) or is already in place.
   */
  available: boolean;
  unavailableReason?: string;
  before: MetricSnapshot;
  after: MetricSnapshot;
  deltas: MetricDelta[];
  secondOrderNotes: string[];
  overallVerdict: string;
  variablesAfter: RiskVariableState;
  staffAfter: StaffComposition;
}

interface CascadeReport {
  scenarioId: string;
  scenarioTitle: string;
  /**
   * False for an owner's own business when the modelled scenario is a starter
   * scenario nobody has confirmed; `scopeNote` then says so.
   */
  scenarioInScope: boolean;
  scopeNote: string | null;
  baseline: MetricSnapshot;
  simulations: CascadeSimulation[];
  rankedByCor: CascadeSimulation[];
  dependencyMap: { from: string; to: string; effect: string }[];
}

export const CASCADE_LEVERS: CascadeLever[] = [
  {
    id: "enable_dual_control",
    label: "Turn on dual release (payments/deposits)",
    description: "A second signer for release or custody.",
    affects: [
      "lowers fraud likelihood",
      "shrinks scheme size",
      "can earn the premium credit your quote gives",
      "can lower net premium",
      "lowers annual cost of risk",
      "lowers residual risk on cash duties",
      "finding a problem still needs an independent bank reconciliation",
    ],
  },
  {
    id: "enable_independent_bank_rec",
    label: "Independent bank reconciliation",
    description: "Someone without posting access reconciles the bank.",
    affects: [
      "shortens detection lag",
      "shrinks the loss that builds up",
      "can earn the premium credit your quote gives",
      "fewer assumed days until found",
      "lowers monitoring residual risk",
    ],
  },
  {
    id: "enable_cameras",
    label: "Install security cameras (cash/safe/front)",
    description: "Deterrence + detection evidence.",
    affects: [
      "lowers opportunity likelihood",
      "shortens detection lag slightly",
      "can earn the premium credit your quote gives",
      "does not replace separating duties",
    ],
  },
  {
    id: "enable_bonded_handlers",
    label: "Bond / screen cash handlers",
    description: "Bonding or enhanced background checks.",
    affects: [
      "lowers dishonesty likelihood modestly",
      "can earn the premium credit your quote gives",
      "shrinks scheme size slightly",
    ],
  },
  {
    id: "enable_alarm",
    label: "Monitored alarm / access control",
    description: "After-hours perimeter control.",
    affects: ["lowers external theft likelihood", "can earn the premium credit your quote gives"],
  },
  {
    id: "raise_deductible_10k",
    label: "Raise deductible to $10,000",
    description: "More retained per claim; premium held constant unless carrier reprices.",
    affects: [
      "raises retained loss on mid and large claims",
      "shrinks the share the insurer pays",
      "can raise annual cost of risk when the assumed loss is large",
    ],
  },
  {
    id: "lower_deductible_1k",
    label: "Lower deductible to $1,000",
    description: "Less retained per claim; premium model holds base constant.",
    affects: [
      "lowers retained loss",
      "insurer pays more of mid-size claims",
      "can lower annual cost of risk when the assumed loss is large",
      "premium may rise in real life (not priced here)",
    ],
  },
  {
    id: "raise_limit_250k",
    label: "Raise policy limit to $250,000",
    description: "More transfer capacity on large schemes.",
    affects: [
      "can raise what the insurer pays on large losses",
      "can lower retained loss on the largest claims",
      "premium may rise in real life (not priced here)",
    ],
  },
  {
    id: "add_cameras_discount_stack",
    label: "Cameras + dual release + bank reconciliation (stack)",
    description: "Full control stack that maximizes earned credits under cap.",
    affects: [
      "lowers likelihood sharply",
      "shrinks scheme size",
      "shortens detection lag",
      "can reach the maximum premium discount",
      "can lower net premium",
      "lowers the portfolio's average residual risk",
    ],
  },
  {
    id: "cut_daily_cash_20pct",
    label: "Cut daily cash exposure 20%",
    description: "Less cash intensity (cards, fewer open drawers).",
    affects: [
      "shrinks cash scheme size",
      "lowers cash opportunity likelihood",
      "lowers assumed loss before insurance on cash scenarios",
      "does not fix duty separation alone",
    ],
  },
  {
    id: "clean_claims_history",
    label: "Claims load factor → 1.0 (clean)",
    description: "Remove the premium load from prior claims.",
    affects: ["lowers net premium", "lowers annual cost of risk"],
  },
  {
    id: "raise_segregation_75",
    label: "Raise segregation score to 75",
    description: "Team profile / duty redesign.",
    affects: [
      "can lower the staffing uplift on residual risk",
      "can lower the assumed loss on scenarios",
      "can lower the portfolio's average residual risk",
      "works best with dual release and an independent bank reconciliation",
    ],
  },
];

/** Simulate one lever against one scenario of the business. */
export function simulateCascadeLever(
  tpl: IndustryTemplate,
  leverId: CascadeLeverId,
  baseVars: RiskVariableState = DEFAULT_RISK_VARIABLES,
  baseStaff?: StaffComposition,
  scenarioId?: string,
  scope: ResidualScope = {},
): CascadeSimulation {
  const staffBase = baseStaff ?? tpl.staffComposition;
  const lever = CASCADE_LEVERS.find((l) => l.id === leverId) ?? CASCADE_LEVERS[0];
  const sid = cascadeScenario(tpl, scenarioId, scope).id;

  const before = snapshot(tpl, baseVars, staffBase, sid, scope);
  const unavailable =
    leverUnavailableReason(lever.id, baseVars, sid) ??
    leverAlreadyOnReason(lever.id, baseVars, staffBase);
  if (unavailable) {
    return {
      lever,
      available: false,
      unavailableReason: unavailable,
      before,
      after: before,
      deltas: [],
      secondOrderNotes: [unavailable],
      overallVerdict: unavailable,
      variablesAfter: { ...baseVars },
      staffAfter: { ...staffBase },
    };
  }
  const applied = applyLever(lever.id, baseVars, staffBase);
  const after = snapshot(tpl, applied.vars, applied.staff, sid, scope);
  const deltas = buildDeltas(before, after);

  return {
    lever,
    available: true,
    before,
    after,
    deltas,
    secondOrderNotes: secondOrderNotes(lever.id, deltas),
    overallVerdict: verdict(deltas),
    variablesAfter: applied.vars,
    staffAfter: applied.staff,
  };
}

/**
 * Simulate all levers on one scenario; rank by improvement in annual cost of
 * risk. Without a scenario id the cascade models a cash scenario the owner
 * has confirmed (any scenario of the sample business), else the first one in
 * scope; with nothing in scope it falls back to the template's cash scenario
 * and flags it as out of scope.
 */
export function simulateAllCascades(
  tpl: IndustryTemplate,
  baseVars: RiskVariableState = DEFAULT_RISK_VARIABLES,
  baseStaff?: StaffComposition,
  scenarioId?: string,
  scope: ResidualScope = {},
): CascadeReport {
  const staffBase = baseStaff ?? tpl.staffComposition;
  const scenario = cascadeScenario(tpl, scenarioId, scope);
  const baseline = snapshot(tpl, baseVars, staffBase, scenario.id, scope);
  const simulations = CASCADE_LEVERS.map((l) =>
    simulateCascadeLever(tpl, l.id, baseVars, staffBase, scenario.id, scope),
  );

  // Levers that cannot be modelled yet are listed, never ranked.
  const available = simulations.filter((sim) => sim.available);
  const rankedByCor = [...available].sort((a, b) => {
    const da = a.after.expectedAnnualCostOfRisk - a.before.expectedAnnualCostOfRisk;
    const db = b.after.expectedAnnualCostOfRisk - b.before.expectedAnnualCostOfRisk;
    return da - db; // most negative first
  });

  return {
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    scenarioInScope: scenario.inScope,
    scopeNote: scenario.inScope ? null : starterScenarioNote(tpl, scope.confirmedScenarioIds),
    baseline,
    simulations,
    rankedByCor,
    dependencyMap: CASCADE_DEPENDENCIES,
  };
}

/**
 * Why an insurance lever cannot be modelled yet, or null when it can. A
 * deductible, limit or claims-load change is only meaningful against the
 * owner's own policy: run against the app's default figures it would
 * recommend buying insurance on numbers nobody entered. Given a scenario, a
 * deductible or limit change also needs a recovery modelled for it, since
 * without one neither figure enters the arithmetic.
 */
export function leverUnavailableReason(
  leverId: CascadeLeverId,
  vars: RiskVariableState,
  scenarioId?: string,
): string | null {
  const field = INSURANCE_LEVER_FIELD[leverId];
  if (!field) return null;
  if (policyFieldIsDefault(vars, field)) {
    const word =
      field === "policyLimit" ? "limit" : field === "basePremiumAnnual" ? "premium" : "deductible";
    return `Not modeled until you confirm your policy: you have not confirmed the ${word}. Review Insurance information status on Dynamic variables.`;
  }
  if (field !== "basePremiumAnnual" && scenarioId && !recoveryModelled(vars, scenarioId)) {
    return "Not modeled until you confirm every core policy figure and mark this scenario as covered on Insurance information.";
  }
  return null;
}

/**
 * What a lever moves, as shown to the owner. With no policy entered there is
 * no premium to credit, so premium and credit effects are left out.
 */
export function leverAffects(lever: CascadeLever, vars: RiskVariableState): string[] {
  if (policyEntered(vars)) return lever.affects;
  return lever.affects.filter((a) => !/premium|credit|discount/i.test(a));
}

// The day figure is the scenario's assumed days until the problem is found:
// detection and fewer opportunities shorten it, and a shorter run is a
// smaller loss, so fewer days is better.
export const LOWER_IS_BETTER: ReadonlySet<keyof MetricSnapshot> = new Set([
  "likelihoodMultiplier",
  "grossSeverityMultiplier",
  "detectionLagMultiplier",
  "grossExpected",
  "retainedExpected",
  "premiumAnnualNet",
  "expectedAnnualCostOfRisk",
  "eventPlusPremiumExpected",
  "timelineP50",
  "residualAverage",
  "residualCriticalPath",
]);

// For transferred: higher can be better (more risk transferred) when gross is fixed
export const HIGHER_IS_BETTER: ReadonlySet<keyof MetricSnapshot> = new Set([
  "transferredExpected",
  "discountPctApplied",
]);

/** The scenario the cascade models, and whether it counts for this business. */
function cascadeScenario(
  tpl: IndustryTemplate,
  scenarioId: string | undefined,
  scope: ResidualScope,
): { id: string; title: string; inScope: boolean } {
  const inScope = scenariosInScope(tpl, scope.confirmedScenarioIds);
  const isCash = (s: { id: string }) => s.id.includes("cash");
  const chosen =
    tpl.scenarios.find((s) => s.id === scenarioId) ??
    inScope.find(isCash) ??
    inScope[0] ??
    tpl.scenarios.find(isCash) ??
    tpl.scenarios[0];
  return {
    id: chosen.id,
    title: chosen.title,
    inScope: inScope.some((s) => s.id === chosen.id),
  };
}

/** One scenario's figures, priced by the scenario engine. */
function snapshot(
  tpl: IndustryTemplate,
  vars: RiskVariableState,
  staff: StaffComposition,
  scenarioId: string,
  scope: ResidualScope,
): MetricSnapshot {
  const result = runPrecogScenario(tpl, scenarioId, { staff, riskVariables: vars });
  if (!result?.dynamic) throw new Error(`Unknown scenario ${scenarioId}`);
  const portfolio = portfolioSummary(tpl, staff, undefined, scope);
  const d = result.dynamic;
  return {
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
    timelineP50: result.timelineDays.p50,
    residualAverage: portfolio.averageResidual,
    residualCriticalPath: portfolio.criticalPath,
  };
}

/** True when the owner's confirmed policy models a recovery for this scenario. */
function recoveryModelled(vars: RiskVariableState, scenarioId: string): boolean {
  if (policyDefaultsInForce(vars)) return false;
  return Boolean(normalizeInsuranceRecord(vars.insurance)?.modeledScenarioIds.includes(scenarioId));
}

/** Why a control lever changes nothing because it is already in place, or null. */
function leverAlreadyOnReason(
  leverId: CascadeLeverId,
  vars: RiskVariableState,
  staff: StaffComposition,
): string | null {
  const on: Partial<Record<CascadeLeverId, boolean>> = {
    enable_dual_control: staff.dualControlPayments,
    enable_independent_bank_rec: staff.independentBankRec,
    enable_cameras: vars.hasSecurityCameras,
    enable_bonded_handlers: vars.hasBondedCashHandlers,
    enable_alarm: vars.hasAlarmAccess,
    add_cameras_discount_stack:
      vars.hasSecurityCameras && staff.dualControlPayments && staff.independentBankRec,
    raise_segregation_75: staff.segregationScore >= 75,
  };
  return on[leverId] ? "Already in place in your settings, so this lever changes nothing." : null;
}

/**
 * The settings after pulling a lever. The engine reads dual control and bank
 * reconciliation from the staff flags, so those levers set the staff flag and
 * the returned variables mirror the staff flags.
 */
function applyLever(
  leverId: CascadeLeverId,
  vars: RiskVariableState,
  staff: StaffComposition,
): { vars: RiskVariableState; staff: StaffComposition } {
  const v = { ...vars };
  const s = { ...staff };

  switch (leverId) {
    case "enable_dual_control":
      s.dualControlPayments = true;
      break;
    case "enable_independent_bank_rec":
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
      s.dualControlPayments = true;
      s.independentBankRec = true;
      break;
    case "cut_daily_cash_20pct":
      v.dailyCashExposure = Math.round(v.dailyCashExposure * 0.8);
      break;
    case "clean_claims_history":
      v.claimsLoadFactor = 1;
      break;
    case "raise_segregation_75":
      s.segregationScore = Math.max(s.segregationScore, 75);
      break;
  }

  return { vars: mergeStaffIntoVariables(v, s), staff: s };
}

function buildDeltas(before: MetricSnapshot, after: MetricSnapshot): MetricDelta[] {
  const keys = Object.keys(before) as (keyof MetricSnapshot)[];
  return keys
    .map((key) => {
      const b = before[key];
      const a = after[key];
      const delta = a - b;
      const pctChange = b === 0 ? null : (delta / Math.abs(b)) * 100;
      const better = HIGHER_IS_BETTER.has(key) ? delta > 0 : delta < 0;
      return {
        key,
        label: LABELS[key],
        before: b,
        after: a,
        delta,
        pctChange,
        direction: better ? ("improves" as const) : ("worsens" as const),
      };
    })
    .filter((d) => Math.abs(d.delta) > 1e-9);
}

function secondOrderNotes(leverId: CascadeLeverId, deltas: MetricDelta[]): string[] {
  const notes: string[] = [];
  const byKey = Object.fromEntries(deltas.map((d) => [d.key, d])) as Partial<
    Record<keyof MetricSnapshot, MetricDelta>
  >;

  const premium = byKey.premiumAnnualNet?.direction;
  const retained = byKey.retainedExpected?.direction;
  if (premium === "improves" && retained === "improves") {
    notes.push(
      "Premium and retained loss both fall: the control credit and the smaller loss add up (the best case).",
    );
  }
  if (premium === "improves" && retained === "worsens") {
    notes.push(
      "Premium falls but retained loss rises: check the deductible and limit, because a cheaper premium does not mean less risk for you.",
    );
  }
  if (premium === "worsens" && retained === "improves") {
    notes.push(
      "You may pay more premium while retained loss falls; annual cost of risk can still fall when the assumed loss is large.",
    );
  }

  if (byKey.timelineP50?.direction === "improves") {
    notes.push(
      "Faster detection shortens the assumed days until found, and a scheme found sooner builds up less loss.",
    );
  }

  if (
    byKey.residualAverage?.direction === "improves" &&
    byKey.expectedAnnualCostOfRisk?.direction === "improves"
  ) {
    notes.push(
      "Average residual risk and annual cost of risk fall together: the control design and the insurance terms both improved.",
    );
  }

  if (leverId === "raise_deductible_10k") {
    notes.push(
      "The model holds the base premium constant when the deductible rises. Real carriers often cut the premium, so ask for a new quote rather than assume the saving.",
    );
  }
  if (leverId === "lower_deductible_1k" || leverId === "raise_limit_250k") {
    notes.push(
      "The model holds the base premium constant when the limit or deductible improves. Real carriers often raise the premium, so treat the annual cost of risk as a direction, not a price.",
    );
  }
  if (leverId === "enable_dual_control" && !byKey.detectionLagMultiplier) {
    notes.push(
      "Dual release cuts the opportunity but does not replace an independent reconciliation, so finding a problem can still be slow.",
    );
  }
  if (leverId === "add_cameras_discount_stack") {
    notes.push(
      "Stacked controls act on the control, process and continuity layers at once and usually reach the maximum discount.",
    );
  }
  if (leverId === "raise_segregation_75") {
    notes.push(
      "The segregation score describes staffing and duty design; it changes the assumed loss and residual risk but earns no carrier credit on its own.",
    );
  }

  if (notes.length === 0) {
    notes.push("The direct effects dominate; knock-on effects were small under current inputs.");
  }
  return notes;
}

function verdict(deltas: MetricDelta[]): string {
  if (deltas.length === 0) return "No figure moves under current inputs.";
  const improves = deltas.filter((d) => d.direction === "improves").length;
  const worsens = deltas.length - improves;
  const ret = deltas.find((d) => d.key === "retainedExpected");
  const res = deltas.find((d) => d.key === "residualAverage");
  const moves = (d: MetricDelta) => (d.delta < 0 ? "falls" : "rises");

  const parts: string[] = [];
  if (ret) parts.push(`Retained loss ${moves(ret)} ${formatUsd(Math.abs(ret.delta))}`);
  if (res) {
    const points = Math.abs(Math.round(res.delta));
    parts.push(`average residual risk ${moves(res)} ${points} point${points === 1 ? "" : "s"}`);
  }
  const balance =
    worsens === 0
      ? "No tradeoffs in this model."
      : improves > worsens
        ? "Better overall, with some tradeoffs."
        : improves < worsens
          ? "More figures get worse than better; read the notes."
          : "Mixed: judge by retained loss and residual risk, not one figure.";
  return parts.length ? `${parts.join("; ")}. ${balance}` : balance;
}

/** The policy field an insurance lever changes. */
const INSURANCE_LEVER_FIELD: Partial<
  Record<CascadeLeverId, "deductible" | "policyLimit" | "basePremiumAnnual">
> = {
  raise_deductible_10k: "deductible",
  lower_deductible_1k: "deductible",
  raise_limit_250k: "policyLimit",
  clean_claims_history: "basePremiumAnnual",
};

const LABELS: Record<keyof MetricSnapshot, string> = {
  likelihoodMultiplier: "Likelihood multiplier",
  grossSeverityMultiplier: "Gross severity multiplier",
  detectionLagMultiplier: "Detection lag multiplier",
  grossExpected: "Gross expected loss",
  retainedExpected: "Retained expected loss",
  transferredExpected: "Transferred to insurer",
  premiumAnnualNet: "Net annual premium",
  discountPctApplied: "Premium discount applied (%)",
  expectedAnnualCostOfRisk: "Assumed frequency times retained loss (not a measured annual cost)",
  eventPlusPremiumExpected: "One event plus a year's premium",
  timelineP50: "Assumed days until found",
  residualAverage: "Portfolio average residual",
  residualCriticalPath: "Critical-path count",
};

/** How one lever moves another, for the cascade panel and the agent's tool output. */
const CASCADE_DEPENDENCIES = [
  { from: "dual_control", to: "likelihood", effect: "lowers fraud opportunity" },
  {
    from: "dual_control",
    to: "premium",
    effect: "may reduce modeled premium when a policy is entered",
  },
  { from: "dual_control", to: "severity", effect: "shrinks scheme size" },
  { from: "bank_rec", to: "detection_lag", effect: "shrinks the loss over several periods" },
  {
    from: "bank_rec",
    to: "premium",
    effect: "may reduce modeled premium when a policy is entered",
  },
  { from: "bank_rec", to: "days_until_found", effect: "fewer assumed days until found" },
  {
    from: "cameras",
    to: "likelihood",
    effect: "lowers opportunity, finds problems a little sooner",
  },
  { from: "cameras", to: "premium", effect: "earns a carrier credit" },
  { from: "discount_stack", to: "max_discount_cap", effect: "credits stop at the cap" },
  { from: "deductible", to: "retained", effect: "sets the least you keep per claim" },
  { from: "deductible", to: "transferred", effect: "shrinks the insurer's share" },
  { from: "policy_limit", to: "transferred", effect: "caps what the insurer pays" },
  { from: "daily_cash", to: "severity", effect: "scales the assumed loss on cash scenarios" },
  { from: "claims_load", to: "premium", effect: "multiplies the base premium" },
  { from: "segregation_score", to: "residual_portfolio", effect: "staffing uplift on residual" },
  { from: "segregation_score", to: "scenario_impact", effect: "staffing multiplier on the loss" },
  {
    from: "premium_net",
    to: "annual_cost_of_risk",
    effect: "annual cost of risk is the premium plus the retained loss per year",
  },
  {
    from: "retained_el",
    to: "annual_cost_of_risk",
    effect: "retained loss, weighted by how often it happens, feeds annual cost of risk",
  },
  {
    from: "controls",
    to: "residual_and_insurance",
    effect: "the same control lowers residual risk and earns premium credits",
  },
];
