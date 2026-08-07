/**
 * Dynamic risk variables: insurance transfer + control-linked discounts.
 * Changing any variable recomputes likelihood multipliers and severity/cost.
 *
 * Educational model for small dental practices — not an insurance quote.
 */

export type VariableCategory =
  | "insurance"
  | "transfer"
  | "physical_security"
  | "financial_control"
  | "monitoring"
  | "continuity";

export type VariableKind = "currency" | "percent" | "boolean" | "number";

export interface DynamicVariableDef {
  id: string;
  label: string;
  category: VariableCategory;
  kind: VariableKind;
  description: string;
  /** How this variable moves outcome likelihood (relative, -1..+1 typical) */
  likelihoodEffect: string;
  /** How this variable moves cost severity / retained loss */
  severityEffect: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number | boolean;
  /** If true, variable is a control that may unlock premium discounts */
  unlocksDiscount?: boolean;
}

export interface RiskVariableState {
  /** Annual crime / employee dishonesty premium before discounts */
  basePremiumAnnual: number;
  /** Policy deductible (retained per claim) */
  deductible: number;
  /** Policy limit (max recovery) */
  policyLimit: number;
  /** Coinsurance / unreimbursed % above deductible (0–1) — simplified */
  coinsurancePct: number;
  /** Carrier discount % for security cameras (0–100) */
  discountCamerasPct: number;
  /** Carrier discount % for dual control / dual signature (0–100) */
  discountDualControlPct: number;
  /** Carrier discount % for independent bank rec / CPA review (0–100) */
  discountBankRecPct: number;
  /** Carrier discount % for alarm / access control (0–100) */
  discountAlarmPct: number;
  /** Carrier discount % for background checks / bonded staff (0–100) */
  discountBondedStaffPct: number;
  /** Max stackable discount cap (0–100) */
  maxDiscountPct: number;
  /** Whether practice has cameras covering cash/safe */
  hasSecurityCameras: boolean;
  /** Dual control on payments / deposits */
  hasDualControl: boolean;
  /** Independent bank reconciliation */
  hasIndependentBankRec: boolean;
  /** Alarm / access control on office */
  hasAlarmAccess: boolean;
  /** Staff bonded / background checks for cash handlers */
  hasBondedCashHandlers: boolean;
  /** Claims history load factor (1 = clean; >1 worse) */
  claimsLoadFactor: number;
  /** Revenue / cash intensity proxy (scales severity) */
  dailyCashExposure: number;
  /** Optional extra annual premium load from underwriting */
  underwritingLoadAnnual: number;
}

export const DEFAULT_RISK_VARIABLES: RiskVariableState = {
  basePremiumAnnual: 4200,
  deductible: 5000,
  policyLimit: 100000,
  coinsurancePct: 0,
  discountCamerasPct: 5,
  discountDualControlPct: 8,
  discountBankRecPct: 5,
  discountAlarmPct: 3,
  discountBondedStaffPct: 4,
  maxDiscountPct: 25,
  hasSecurityCameras: false,
  hasDualControl: false,
  hasIndependentBankRec: false,
  hasAlarmAccess: true,
  hasBondedCashHandlers: false,
  claimsLoadFactor: 1,
  dailyCashExposure: 3500,
  underwritingLoadAnnual: 0,
};

export const VARIABLE_CATALOG: DynamicVariableDef[] = [
  {
    id: "basePremiumAnnual",
    label: "Base annual premium",
    category: "insurance",
    kind: "currency",
    description: "Crime / employee dishonesty (or package) premium before control discounts.",
    likelihoodEffect: "Premium does not change event likelihood; it prices transfer.",
    severityEffect: "Raises annual cost-of-risk even if no loss occurs.",
    min: 0,
    max: 50000,
    step: 100,
    defaultValue: 4200,
  },
  {
    id: "deductible",
    label: "Deductible",
    category: "insurance",
    kind: "currency",
    description: "Amount retained per covered loss before insurance responds.",
    likelihoodEffect: "No direct likelihood change; may change behavior if very high.",
    severityEffect: "Retained severity floors at least the deductible on covered claims.",
    min: 0,
    max: 100000,
    step: 500,
    defaultValue: 5000,
  },
  {
    id: "policyLimit",
    label: "Policy limit",
    category: "insurance",
    kind: "currency",
    description: "Maximum recovery per claim / aggregate (simplified single limit).",
    likelihoodEffect: "None.",
    severityEffect: "Caps transferred severity; excess loss stays with the practice.",
    min: 10000,
    max: 1000000,
    step: 5000,
    defaultValue: 100000,
  },
  {
    id: "coinsurancePct",
    label: "Unreimbursed share above deductible",
    category: "transfer",
    kind: "percent",
    description: "Simplified coinsurance / gap % after deductible (0 if first-dollar after deductible).",
    likelihoodEffect: "None.",
    severityEffect: "Increases retained severity on large losses.",
    min: 0,
    max: 50,
    step: 1,
    defaultValue: 0,
  },
  {
    id: "hasSecurityCameras",
    label: "Security cameras (cash / safe / front)",
    category: "physical_security",
    kind: "boolean",
    description: "Cameras covering cash drawer, safe, and public entry.",
    likelihoodEffect: "Lowers theft/opportunity likelihood (deterrence + detection).",
    severityEffect: "May shorten duration of schemes (faster detection).",
    defaultValue: false,
    unlocksDiscount: true,
  },
  {
    id: "discountCamerasPct",
    label: "Insurer discount: cameras",
    category: "insurance",
    kind: "percent",
    description: "Typical carrier credit if cameras are in place (illustrative).",
    likelihoodEffect: "Indirect — only if cameras are actually installed.",
    severityEffect: "Reduces premium cost-of-risk.",
    min: 0,
    max: 20,
    step: 1,
    defaultValue: 5,
  },
  {
    id: "hasDualControl",
    label: "Dual control on payments / deposits",
    category: "financial_control",
    kind: "boolean",
    description: "Two-person rule for ACH release or deposit custody vs posting.",
    likelihoodEffect: "Strongly reduces fraud opportunity likelihood.",
    severityEffect: "Limits size of unauthorized transfers.",
    defaultValue: false,
    unlocksDiscount: true,
  },
  {
    id: "discountDualControlPct",
    label: "Insurer discount: dual control",
    category: "insurance",
    kind: "percent",
    description: "Illustrative premium credit for dual signature / dual release.",
    likelihoodEffect: "Indirect via control presence.",
    severityEffect: "Reduces premium.",
    min: 0,
    max: 20,
    step: 1,
    defaultValue: 8,
  },
  {
    id: "hasIndependentBankRec",
    label: "Independent bank reconciliation",
    category: "monitoring",
    kind: "boolean",
    description: "Someone who does not post payments reconciles the bank.",
    likelihoodEffect: "Shortens detection lag → lower multi-period scheme likelihood.",
    severityEffect: "Cuts cumulative loss severity via earlier detection.",
    defaultValue: false,
    unlocksDiscount: true,
  },
  {
    id: "discountBankRecPct",
    label: "Insurer discount: bank rec / CPA",
    category: "insurance",
    kind: "percent",
    description: "Credit for independent recon or external bookkeeping review.",
    likelihoodEffect: "Indirect.",
    severityEffect: "Reduces premium.",
    min: 0,
    max: 15,
    step: 1,
    defaultValue: 5,
  },
  {
    id: "hasAlarmAccess",
    label: "Alarm / access control",
    category: "physical_security",
    kind: "boolean",
    description: "Monitored alarm and controlled after-hours access.",
    likelihoodEffect: "Lowers external theft / break-in likelihood.",
    severityEffect: "Limits overnight cash/equipment loss.",
    defaultValue: true,
    unlocksDiscount: true,
  },
  {
    id: "discountAlarmPct",
    label: "Insurer discount: alarm",
    category: "insurance",
    kind: "percent",
    description: "Illustrative alarm credit.",
    likelihoodEffect: "Indirect.",
    severityEffect: "Reduces premium.",
    min: 0,
    max: 10,
    step: 1,
    defaultValue: 3,
  },
  {
    id: "hasBondedCashHandlers",
    label: "Bonded / background-checked cash handlers",
    category: "continuity",
    kind: "boolean",
    description: "Bonding or enhanced screening for staff with cash/ACH access.",
    likelihoodEffect: "Modest reduction in employee dishonesty likelihood.",
    severityEffect: "May improve recovery odds; model applies small severity relief.",
    defaultValue: false,
    unlocksDiscount: true,
  },
  {
    id: "discountBondedStaffPct",
    label: "Insurer discount: bonded staff",
    category: "insurance",
    kind: "percent",
    description: "Illustrative credit for bonding / screening program.",
    likelihoodEffect: "Indirect.",
    severityEffect: "Reduces premium.",
    min: 0,
    max: 15,
    step: 1,
    defaultValue: 4,
  },
  {
    id: "maxDiscountPct",
    label: "Max stackable discount",
    category: "insurance",
    kind: "percent",
    description: "Carriers often cap combined credits.",
    likelihoodEffect: "None.",
    severityEffect: "Caps premium reduction.",
    min: 0,
    max: 40,
    step: 1,
    defaultValue: 25,
  },
  {
    id: "claimsLoadFactor",
    label: "Claims / underwriting load factor",
    category: "transfer",
    kind: "number",
    description: "1.0 = clean history; >1 increases premium (and slightly severity priors).",
    likelihoodEffect: "Proxy for elevated environment risk if >1.",
    severityEffect: "Scales premium; mild severity uplift if history is poor.",
    min: 0.8,
    max: 2.5,
    step: 0.05,
    defaultValue: 1,
  },
  {
    id: "dailyCashExposure",
    label: "Typical daily cash / card deposit",
    category: "transfer",
    kind: "currency",
    description: "Exposure proxy used to scale cash-scheme severity.",
    likelihoodEffect: "Higher cash intensity can raise opportunity.",
    severityEffect: "Scales cash-related loss severity.",
    min: 0,
    max: 50000,
    step: 100,
    defaultValue: 3500,
  },
  {
    id: "underwritingLoadAnnual",
    label: "Extra underwriting load ($/yr)",
    category: "insurance",
    kind: "currency",
    description: "Flat load (location, class, prior claims) added after discounts.",
    likelihoodEffect: "None.",
    severityEffect: "Adds to annual cost-of-risk.",
    min: 0,
    max: 20000,
    step: 50,
    defaultValue: 0,
  },
];

export interface AppliedDiscount {
  id: string;
  label: string;
  pct: number;
  active: boolean;
  reason: string;
}

export interface LikelihoodSeverityBreakdown {
  /** Relative likelihood multiplier vs base scenario (1 = unchanged) */
  likelihoodMultiplier: number;
  /** Relative severity multiplier on gross loss before insurance (1 = unchanged) */
  grossSeverityMultiplier: number;
  /** Detection lag multiplier (<1 = faster detection) */
  detectionLagMultiplier: number;
  drivers: { id: string; label: string; effect: string; on: "likelihood" | "severity" | "detection" }[];
}

export interface InsuranceTransferResult {
  grossLossExpected: number;
  grossLossLow: number;
  grossLossHigh: number;
  retainedExpected: number;
  retainedLow: number;
  retainedHigh: number;
  transferredExpected: number;
  premiumAnnualNet: number;
  discountPctApplied: number;
  discounts: AppliedDiscount[];
  /** Expected annual cost of risk ≈ premium + (retained EL × annualization factor) */
  expectedAnnualCostOfRisk: number;
  /** Single-event retained + one year premium (decision metric) */
  eventPlusPremiumExpected: number;
  notes: string[];
}

export interface DynamicRiskOutcome {
  variables: RiskVariableState;
  likelihoodSeverity: LikelihoodSeverityBreakdown;
  transfer: InsuranceTransferResult;
  /** Timeline multipliers already incorporating detection lag */
  timelineMultiplier: number;
  /** Applied to gross financial impact before retention math */
  impactMultiplier: number;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function computeAppliedDiscounts(v: RiskVariableState): AppliedDiscount[] {
  const items: AppliedDiscount[] = [
    {
      id: "cameras",
      label: "Security cameras",
      pct: v.discountCamerasPct,
      active: v.hasSecurityCameras,
      reason: v.hasSecurityCameras
        ? "Cameras present — carrier credit applied."
        : "No cameras — credit not earned.",
    },
    {
      id: "dual",
      label: "Dual control",
      pct: v.discountDualControlPct,
      active: v.hasDualControl,
      reason: v.hasDualControl
        ? "Dual control present — carrier credit applied."
        : "No dual control — credit not earned.",
    },
    {
      id: "bank",
      label: "Independent bank rec",
      pct: v.discountBankRecPct,
      active: v.hasIndependentBankRec,
      reason: v.hasIndependentBankRec
        ? "Independent recon present — carrier credit applied."
        : "No independent recon — credit not earned.",
    },
    {
      id: "alarm",
      label: "Alarm / access",
      pct: v.discountAlarmPct,
      active: v.hasAlarmAccess,
      reason: v.hasAlarmAccess
        ? "Alarm/access present — carrier credit applied."
        : "No alarm credit.",
    },
    {
      id: "bonded",
      label: "Bonded cash handlers",
      pct: v.discountBondedStaffPct,
      active: v.hasBondedCashHandlers,
      reason: v.hasBondedCashHandlers
        ? "Bonding/screening present — carrier credit applied."
        : "No bonding credit.",
    },
  ];
  return items;
}

export function computeNetPremium(v: RiskVariableState): {
  premiumAnnualNet: number;
  discountPctApplied: number;
  discounts: AppliedDiscount[];
} {
  const discounts = computeAppliedDiscounts(v);
  const raw = discounts.filter((d) => d.active).reduce((s, d) => s + d.pct, 0);
  const discountPctApplied = clamp(raw, 0, v.maxDiscountPct);
  const premiumAnnualNet = Math.round(
    v.basePremiumAnnual * (1 - discountPctApplied / 100) * v.claimsLoadFactor +
      v.underwritingLoadAnnual,
  );
  return { premiumAnnualNet, discountPctApplied, discounts };
}

export function computeLikelihoodSeverity(
  v: RiskVariableState,
  opts?: { fraudRelated?: boolean; cashRelated?: boolean },
): LikelihoodSeverityBreakdown {
  const fraud = opts?.fraudRelated ?? true;
  const cash = opts?.cashRelated ?? fraud;
  const drivers: LikelihoodSeverityBreakdown["drivers"] = [];

  let likelihood = 1;
  let grossSeverity = 1;
  let detectionLag = 1;

  if (v.hasSecurityCameras) {
    likelihood *= fraud ? 0.88 : 0.95;
    detectionLag *= 0.92;
    drivers.push({
      id: "cam-l",
      label: "Security cameras",
      effect: "−12% opportunity likelihood; faster detection",
      on: "likelihood",
    });
  }
  if (v.hasDualControl) {
    likelihood *= fraud ? 0.72 : 0.9;
    grossSeverity *= 0.85;
    drivers.push({
      id: "dual-l",
      label: "Dual control",
      effect: "−28% fraud likelihood; −15% scheme size",
      on: "likelihood",
    });
  }
  if (v.hasIndependentBankRec) {
    likelihood *= 0.9;
    detectionLag *= 0.75;
    grossSeverity *= 0.88;
    drivers.push({
      id: "rec-d",
      label: "Independent bank rec",
      effect: "−25% detection lag; −12% cumulative severity",
      on: "detection",
    });
  }
  if (v.hasAlarmAccess) {
    likelihood *= cash ? 0.94 : 0.97;
    drivers.push({
      id: "alarm-l",
      label: "Alarm / access",
      effect: "−6% external theft likelihood",
      on: "likelihood",
    });
  }
  if (v.hasBondedCashHandlers) {
    likelihood *= 0.93;
    grossSeverity *= 0.97;
    drivers.push({
      id: "bond-l",
      label: "Bonded handlers",
      effect: "−7% dishonesty likelihood",
      on: "likelihood",
    });
  }

  // Cash intensity: relative to $2,500 baseline daily
  if (cash && v.dailyCashExposure > 0) {
    const intensity = clamp(v.dailyCashExposure / 2500, 0.5, 3);
    if (intensity !== 1) {
      likelihood *= Math.sqrt(intensity);
      grossSeverity *= intensity;
      drivers.push({
        id: "cash-int",
        label: "Daily cash exposure",
        effect: `×${intensity.toFixed(2)} severity; √ intensity on likelihood`,
        on: "severity",
      });
    }
  }

  if (v.claimsLoadFactor > 1) {
    likelihood *= 1 + (v.claimsLoadFactor - 1) * 0.35;
    grossSeverity *= 1 + (v.claimsLoadFactor - 1) * 0.15;
    drivers.push({
      id: "claims-load",
      label: "Claims load factor",
      effect: `Underwriting history factor ${v.claimsLoadFactor.toFixed(2)}`,
      on: "likelihood",
    });
  }

  // High deductible slight behavioral risk (moral hazard reverse is complex; mild)
  if (v.deductible >= 25000) {
    likelihood *= 1.03;
    drivers.push({
      id: "ded-hi",
      label: "High deductible",
      effect: "Slight risk that monitoring investment lags (+3% likelihood)",
      on: "likelihood",
    });
  }

  return {
    likelihoodMultiplier: clamp(likelihood, 0.25, 2.5),
    grossSeverityMultiplier: clamp(grossSeverity, 0.35, 3),
    detectionLagMultiplier: clamp(detectionLag, 0.4, 1.4),
    drivers,
  };
}

/** Retained loss after deductible, coinsurance, and limit */
export function retainLoss(gross: number, v: RiskVariableState): {
  retained: number;
  transferred: number;
} {
  if (gross <= 0) return { retained: 0, transferred: 0 };
  const afterDed = Math.max(0, gross - v.deductible);
  const practiceCoins = afterDed * clamp(v.coinsurancePct / 100, 0, 1);
  const insurerLayer = afterDed - practiceCoins;
  const transferred = Math.min(insurerLayer, v.policyLimit);
  const retained = gross - transferred;
  return {
    retained: Math.round(retained),
    transferred: Math.round(transferred),
  };
}

export function applyInsuranceTransfer(
  grossExpected: number,
  grossLow: number,
  grossHigh: number,
  v: RiskVariableState,
  likelihoodMultiplier: number,
): InsuranceTransferResult {
  const { premiumAnnualNet, discountPctApplied, discounts } = computeNetPremium(v);

  // Frequency weight for annualizing single-event EL (illustrative)
  const annualFreqWeight = clamp(0.12 * likelihoodMultiplier, 0.03, 0.45);

  const rE = retainLoss(grossExpected, v);
  const rL = retainLoss(grossLow, v);
  const rH = retainLoss(grossHigh, v);

  const expectedAnnualCostOfRisk = Math.round(
    premiumAnnualNet + rE.retained * annualFreqWeight,
  );
  const eventPlusPremiumExpected = Math.round(rE.retained + premiumAnnualNet);

  const notes: string[] = [
    `Net premium ${premiumAnnualNet.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} after ${discountPctApplied}% control credits (cap ${v.maxDiscountPct}%).`,
    `Retained loss ≈ deductible + unreimbursed share + excess over limit.`,
    `Annualized cost-of-risk uses illustrative frequency weight ${(annualFreqWeight * 100).toFixed(1)}% × retained EL + premium.`,
  ];

  if (grossExpected > v.deductible + v.policyLimit) {
    notes.push("Gross loss may exceed deductible + limit — severity towers above transfer.");
  }

  return {
    grossLossExpected: Math.round(grossExpected),
    grossLossLow: Math.round(grossLow),
    grossLossHigh: Math.round(grossHigh),
    retainedExpected: rE.retained,
    retainedLow: rL.retained,
    retainedHigh: rH.retained,
    transferredExpected: rE.transferred,
    premiumAnnualNet,
    discountPctApplied,
    discounts,
    expectedAnnualCostOfRisk,
    eventPlusPremiumExpected,
    notes,
  };
}

export function evaluateDynamicRisk(
  v: RiskVariableState,
  baseImpact: { expected: number; low: number; high: number },
  opts?: { fraudRelated?: boolean; cashRelated?: boolean; staffImpactMult?: number },
): DynamicRiskOutcome {
  const ls = computeLikelihoodSeverity(v, opts);
  const staffMult = opts?.staffImpactMult ?? 1;

  const impactMultiplier = ls.grossSeverityMultiplier * staffMult;
  const timelineMultiplier = ls.detectionLagMultiplier / Math.sqrt(ls.likelihoodMultiplier);

  const grossExpected = baseImpact.expected * impactMultiplier;
  const grossLow = baseImpact.low * impactMultiplier;
  const grossHigh = baseImpact.high * impactMultiplier;

  const transfer = applyInsuranceTransfer(
    grossExpected,
    grossLow,
    grossHigh,
    v,
    ls.likelihoodMultiplier,
  );

  return {
    variables: v,
    likelihoodSeverity: ls,
    transfer,
    timelineMultiplier,
    impactMultiplier,
  };
}

/** Sync boolean controls from staff composition (scenario runner staff). */
export function mergeStaffIntoVariables(
  v: RiskVariableState,
  staff: { dualControlPayments: boolean; independentBankRec: boolean },
): RiskVariableState {
  return {
    ...v,
    hasDualControl: staff.dualControlPayments,
    hasIndependentBankRec: staff.independentBankRec,
  };
}

export function scenarioFlags(scenarioId: string): {
  fraudRelated: boolean;
  cashRelated: boolean;
} {
  const fraudRelated =
    scenarioId.includes("cash") ||
    scenarioId.includes("writeoff") ||
    scenarioId.includes("vendor") ||
    scenarioId.includes("sod");
  const cashRelated = scenarioId.includes("cash") || scenarioId.includes("vendor");
  return { fraudRelated, cashRelated };
}
