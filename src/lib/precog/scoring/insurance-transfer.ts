/**
 * Insurance transfer arithmetic: net premium after control credits, retained
 * and transferred loss, and the annual cost of risk. Educational model for
 * small businesses, not an insurance quote.
 */
import { normalizeInsuranceRecord } from "./insurance-record";
import { computeLikelihoodSeverity, type LikelihoodSeverityBreakdown } from "./likelihood-model";
import type { RiskVariableState } from "./risk-variables";
import { formatUsd, formatPct } from "../../utils";
import { clamp } from "../number";

/** What a scenario that is not theft or fraud says in place of an insurance recovery. */
export const NOT_INSURED_LOSS = "Not an insured loss under a crime policy";
const NOT_INSURED_NOTE = `${NOT_INSURED_LOSS}: the business keeps the whole assumed loss.`;

interface AppliedDiscount {
  id: string;
  label: string;
  pct: number;
  active: boolean;
  reason: string;
}

interface InsuranceTransferResult {
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

interface DynamicRiskOutcome {
  variables: RiskVariableState;
  likelihoodSeverity: LikelihoodSeverityBreakdown;
  transfer: InsuranceTransferResult;
  /**
   * Multiplier on the assumed days until found: the detection lag alone. How
   * often a scheme starts (likelihood) says nothing about how long one runs
   * before it is found, so likelihood does not touch the timeline.
   */
  timelineMultiplier: number;
  /** Applied to gross financial impact before retention math */
  impactMultiplier: number;
}

export function evaluateDynamicRisk(
  v: RiskVariableState,
  baseImpact: { expected: number; low: number; high: number },
  opts?: { fraudRelated?: boolean; cashRelated?: boolean; staffImpactMult?: number },
): DynamicRiskOutcome {
  const ls = computeLikelihoodSeverity(v, opts);
  const staffMult = opts?.staffImpactMult ?? 1;

  const impactMultiplier = ls.grossSeverityMultiplier * staffMult;
  const timelineMultiplier = ls.detectionLagMultiplier;

  const grossExpected = baseImpact.expected * impactMultiplier;
  const grossLow = baseImpact.low * impactMultiplier;
  const grossHigh = baseImpact.high * impactMultiplier;

  // A crime policy pays for theft and fraud, not for a resignation, an outage
  // or a missed filing, so only a fraud scenario gets a modeled recovery.
  const transfer = applyInsuranceTransfer(
    grossExpected,
    grossLow,
    grossHigh,
    v,
    ls.likelihoodMultiplier,
    opts?.fraudRelated === true,
  );

  return {
    variables: v,
    likelihoodSeverity: ls,
    transfer,
    timelineMultiplier,
    impactMultiplier,
  };
}

export function applyInsuranceTransfer(
  grossExpected: number,
  grossLow: number,
  grossHigh: number,
  v: RiskVariableState,
  likelihoodMultiplier: number,
  /** False for a loss a crime policy does not pay (a resignation, an outage): the business keeps all of it. */
  insuredLoss = true,
): InsuranceTransferResult {
  const { premiumAnnualNet, discountPctApplied, discounts } = computeNetPremium(v);

  // Share of years the event is assumed to happen, to annualize one event's loss.
  const annualFreqWeight = assumedAnnualFrequency(likelihoodMultiplier);

  // With no policy limit in play the retention arithmetic transfers nothing.
  const terms = insuredLoss ? v : { ...v, policyLimit: 0 };
  const rE = retainLoss(grossExpected, terms);
  const rL = retainLoss(grossLow, terms);
  const rH = retainLoss(grossHigh, terms);

  const expectedAnnualCostOfRisk = Math.round(premiumAnnualNet + rE.retained * annualFreqWeight);
  const eventPlusPremiumExpected = Math.round(rE.retained + premiumAnnualNet);

  const noRecovery = v.policyLimit === 0;
  const noPolicy = v.basePremiumAnnual === 0 && noRecovery;
  const recorded = normalizeInsuranceRecord(v.insurance);
  const annualNote = `Annual cost of risk assumes the event happens in ${formatPct(annualFreqWeight, 1)} of years (Precog's assumption) × the retained loss`;
  const premiumNote = `Net premium ${formatUsd(premiumAnnualNet)} after ${discountPctApplied}% control credits (cap ${v.maxDiscountPct}%).`;
  let notes: string[];
  if (!insuredLoss) {
    // The premium is still paid, so the notes keep it whenever there is one.
    notes =
      premiumAnnualNet > 0
        ? [premiumNote, NOT_INSURED_NOTE, `${annualNote}, plus the premium.`]
        : [NOT_INSURED_NOTE, `${annualNote}.`];
  } else if (noPolicy) {
    notes = [
      recorded && recorded.status !== "none"
        ? "Precog models no recovery or premium from unconfirmed policy terms; this is not a finding that the business is uninsured."
        : "No crime policy in these figures: the business keeps the whole assumed loss and pays no premium.",
      `${annualNote}.`,
    ];
  } else if (noRecovery) {
    notes = [
      premiumNote,
      "Precog counts the premium but models no recovery for this scenario, so the business keeps the whole assumed loss until you enter coverage assumptions.",
      `${annualNote}, plus the premium.`,
    ];
  } else {
    notes = [
      premiumNote,
      "Retained loss ≈ deductible + unreimbursed share + excess over limit.",
      `${annualNote}, plus the premium.`,
    ];
  }

  if (insuredLoss && !noRecovery && grossExpected > v.deductible + v.policyLimit) {
    notes.push(
      "The assumed loss can exceed the deductible plus the limit; the excess stays with the business.",
    );
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

/** Retained loss after deductible, coinsurance, and limit */
export function retainLoss(
  gross: number,
  v: RiskVariableState,
): {
  retained: number;
  transferred: number;
} {
  if (gross <= 0) return { retained: 0, transferred: 0 };
  if (
    !Number.isFinite(gross) ||
    ![v.deductible, v.policyLimit, v.coinsurancePct].every(Number.isFinite)
  ) {
    throw new Error("Insurance calculations require finite amounts");
  }
  const afterDed = Math.max(0, gross - Math.max(0, v.deductible));
  const practiceCoins = afterDed * clamp(v.coinsurancePct / 100, 0, 1);
  const insurerLayer = afterDed - practiceCoins;
  const transferred = clamp(v.policyLimit, 0, insurerLayer);
  // Round once and derive the remainder: rounding two half-dollar layers
  // independently can otherwise invent a dollar of loss.
  const roundedTransfer = Math.round(transferred);
  return { retained: Math.round(gross) - roundedTransfer, transferred: roundedTransfer };
}

export function computeAppliedDiscounts(v: RiskVariableState): AppliedDiscount[] {
  const reason = (present: boolean, pct: number, what: string, none: string) =>
    !present
      ? none
      : pct > 0
        ? `${what} present; Precog applies the ${pct}% credit you entered from your quote.`
        : `${what} present; you entered no credit from your quote, so Precog applies none.`;
  const items: AppliedDiscount[] = [
    {
      id: "cameras",
      label: "Security cameras",
      pct: v.discountCamerasPct,
      active: v.hasSecurityCameras,
      reason: reason(
        v.hasSecurityCameras,
        v.discountCamerasPct,
        "Cameras",
        "No cameras, so no credit.",
      ),
    },
    {
      id: "dual",
      label: "Dual release",
      pct: v.discountDualControlPct,
      active: v.hasDualControl,
      reason: reason(
        v.hasDualControl,
        v.discountDualControlPct,
        "Dual release",
        "No dual release, so no credit.",
      ),
    },
    {
      id: "bank",
      label: "Independent bank reconciliation",
      pct: v.discountBankRecPct,
      active: v.hasIndependentBankRec,
      reason: reason(
        v.hasIndependentBankRec,
        v.discountBankRecPct,
        "Independent reconciliation",
        "No independent reconciliation, so no credit.",
      ),
    },
    {
      id: "alarm",
      label: "Alarm / access",
      pct: v.discountAlarmPct,
      active: v.hasAlarmAccess,
      reason: reason(
        v.hasAlarmAccess,
        v.discountAlarmPct,
        "Alarm or access control",
        "No alarm, so no credit.",
      ),
    },
    {
      id: "bonded",
      label: "Bonded cash handlers",
      pct: v.discountBondedStaffPct,
      active: v.hasBondedCashHandlers,
      reason: reason(
        v.hasBondedCashHandlers,
        v.discountBondedStaffPct,
        "Bonding or screening",
        "No bonding, so no credit.",
      ),
    },
  ];
  return items;
}

function computeNetPremium(v: RiskVariableState): {
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

/**
 * Share of years in which the annual cost-of-risk figure assumes the event
 * happens: 12% scaled by the likelihood multiplier, kept between 3% and 45%.
 * This app's assumption, not a measured frequency.
 */
export function assumedAnnualFrequency(likelihoodMultiplier: number): number {
  return clamp(0.12 * likelihoodMultiplier, 0.03, 0.45);
}
