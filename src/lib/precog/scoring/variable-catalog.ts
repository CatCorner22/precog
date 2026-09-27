/**
 * The variable catalog the Dynamic variables panel shows: each variable's
 * label, range and what it does to likelihood and severity. Defaults are the
 * engine's own (DEFAULT_RISK_VARIABLES), never restated.
 */
import { DEFAULT_RISK_VARIABLES } from "./risk-variables";

type VariableCategory =
  | "insurance"
  | "transfer"
  | "physical_security"
  | "financial_control"
  | "monitoring"
  | "continuity";

type VariableKind = "currency" | "percent" | "boolean" | "number";

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
    // The most the app stores, not the slider's range: a real policy can be larger.
    max: 1_000_000,
    step: 100,
    defaultValue: DEFAULT_RISK_VARIABLES.basePremiumAnnual,
  },
  {
    id: "deductible",
    label: "Deductible",
    category: "insurance",
    kind: "currency",
    description: "Amount retained per covered loss before insurance responds.",
    likelihoodEffect: "No likelihood change; a deductible finances loss rather than preventing it.",
    severityEffect:
      "For an eligible modeled loss, the business retains up to the loss amount before recovery starts.",
    min: 0,
    max: 1_000_000,
    step: 500,
    defaultValue: DEFAULT_RISK_VARIABLES.deductible,
  },
  {
    id: "policyLimit",
    label: "Policy limit",
    category: "insurance",
    kind: "currency",
    description: "Maximum recovery per claim / aggregate (simplified single limit).",
    likelihoodEffect: "None.",
    severityEffect: "Caps transferred severity; excess loss stays with the business.",
    min: 0,
    max: 50_000_000,
    step: 5000,
    defaultValue: DEFAULT_RISK_VARIABLES.policyLimit,
  },
  {
    id: "coinsurancePct",
    label: "Unreimbursed share above deductible",
    category: "transfer",
    kind: "percent",
    description:
      "Simplified coinsurance / gap % after deductible (0 if first-dollar after deductible).",
    likelihoodEffect: "None.",
    severityEffect: "Increases retained severity on large losses.",
    min: 0,
    max: 50,
    step: 1,
    defaultValue: DEFAULT_RISK_VARIABLES.coinsurancePct,
  },
  {
    id: "hasSecurityCameras",
    label: "Security cameras (cash / safe / front)",
    category: "physical_security",
    kind: "boolean",
    description: "Cameras covering cash drawer, safe, and public entry.",
    likelihoodEffect: "Lowers theft/opportunity likelihood (deterrence + detection).",
    severityEffect: "May shorten duration of schemes (faster detection).",
    defaultValue: DEFAULT_RISK_VARIABLES.hasSecurityCameras,
    unlocksDiscount: true,
  },
  {
    id: "discountCamerasPct",
    label: "Credit from your quote: cameras",
    category: "insurance",
    kind: "percent",
    description:
      "The credit your own carrier quoted for cameras, if any. The app assumes none until you enter one.",
    likelihoodEffect: "Indirect — only if cameras are actually installed.",
    severityEffect: "Reduces premium cost-of-risk.",
    min: 0,
    max: 20,
    step: 1,
    defaultValue: DEFAULT_RISK_VARIABLES.discountCamerasPct,
  },
  {
    id: "hasDualControl",
    label: "Dual release on payments / deposits",
    category: "financial_control",
    kind: "boolean",
    description: "A second signer for ACH release, or deposit custody kept apart from posting.",
    likelihoodEffect:
      "This app assumes dual release lowers the chance of a fraud starting (see the multiplier it applies).",
    severityEffect: "Limits size of unauthorized transfers.",
    defaultValue: DEFAULT_RISK_VARIABLES.hasDualControl,
    unlocksDiscount: true,
  },
  {
    id: "discountDualControlPct",
    label: "Credit from your quote: dual release",
    category: "insurance",
    kind: "percent",
    description:
      "The credit your own carrier quoted for dual signature or dual release, if any. The app assumes none until you enter one.",
    likelihoodEffect: "Indirect via control presence.",
    severityEffect: "Reduces premium.",
    min: 0,
    max: 20,
    step: 1,
    defaultValue: DEFAULT_RISK_VARIABLES.discountDualControlPct,
  },
  {
    id: "hasIndependentBankRec",
    label: "Independent bank reconciliation",
    category: "monitoring",
    kind: "boolean",
    description: "Someone who does not post payments reconciles the bank.",
    likelihoodEffect: "Shortens detection lag → lower multi-period scheme likelihood.",
    severityEffect: "Cuts cumulative loss severity via earlier detection.",
    defaultValue: DEFAULT_RISK_VARIABLES.hasIndependentBankRec,
    unlocksDiscount: true,
  },
  {
    id: "discountBankRecPct",
    label: "Credit from your quote: bank rec / CPA",
    category: "insurance",
    kind: "percent",
    description:
      "The credit your own carrier quoted for independent reconciliation or an outside review, if any. The app assumes none until you enter one.",
    likelihoodEffect: "Indirect.",
    severityEffect: "Reduces premium.",
    min: 0,
    max: 15,
    step: 1,
    defaultValue: DEFAULT_RISK_VARIABLES.discountBankRecPct,
  },
  {
    id: "hasAlarmAccess",
    label: "Alarm / access control",
    category: "physical_security",
    kind: "boolean",
    description: "Monitored alarm and controlled after-hours access.",
    likelihoodEffect: "Lowers external theft / break-in likelihood.",
    severityEffect: "Limits overnight cash/equipment loss.",
    defaultValue: DEFAULT_RISK_VARIABLES.hasAlarmAccess,
    unlocksDiscount: true,
  },
  {
    id: "discountAlarmPct",
    label: "Credit from your quote: alarm",
    category: "insurance",
    kind: "percent",
    description:
      "The credit your own carrier quoted for an alarm, if any. The app assumes none until you enter one.",
    likelihoodEffect: "Indirect.",
    severityEffect: "Reduces premium.",
    min: 0,
    max: 10,
    step: 1,
    defaultValue: DEFAULT_RISK_VARIABLES.discountAlarmPct,
  },
  {
    id: "hasBondedCashHandlers",
    label: "Bonded / background-checked cash handlers",
    category: "continuity",
    kind: "boolean",
    description: "Bonding or enhanced screening for staff with cash/ACH access.",
    likelihoodEffect: "Modest reduction in employee dishonesty likelihood.",
    severityEffect: "May improve recovery odds; model applies small severity relief.",
    defaultValue: DEFAULT_RISK_VARIABLES.hasBondedCashHandlers,
    unlocksDiscount: true,
  },
  {
    id: "discountBondedStaffPct",
    label: "Credit from your quote: bonded staff",
    category: "insurance",
    kind: "percent",
    description:
      "The credit your own carrier quoted for bonding or screening, if any. The app assumes none until you enter one.",
    likelihoodEffect: "Indirect.",
    severityEffect: "Reduces premium.",
    min: 0,
    max: 15,
    step: 1,
    defaultValue: DEFAULT_RISK_VARIABLES.discountBondedStaffPct,
  },
  {
    id: "maxDiscountPct",
    label: "Max stackable discount",
    category: "insurance",
    kind: "percent",
    description: "Enter the cap your carrier applies to combined credits, if any.",
    likelihoodEffect: "None.",
    severityEffect: "Caps premium reduction.",
    min: 0,
    max: 40,
    step: 1,
    defaultValue: DEFAULT_RISK_VARIABLES.maxDiscountPct,
  },
  {
    id: "claimsLoadFactor",
    label: "Claims / underwriting load factor",
    category: "transfer",
    kind: "number",
    description: "Premium pricing multiplier only; 1.0 means no additional pricing load.",
    likelihoodEffect: "No automatic operational likelihood change.",
    severityEffect: "Scales premium only, not underlying loss severity.",
    min: 0.8,
    max: 2.5,
    step: 0.05,
    defaultValue: DEFAULT_RISK_VARIABLES.claimsLoadFactor,
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
    defaultValue: DEFAULT_RISK_VARIABLES.dailyCashExposure,
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
    defaultValue: DEFAULT_RISK_VARIABLES.underwritingLoadAnnual,
  },
];
