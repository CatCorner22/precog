export const INSURANCE_MODEL_VERSION = "precog-insurance-v2.0.0";
export type InsuranceStatus =
  "not_assessed" | "none_reported" | "reported_incomplete" | "terms_entered";
export type FactSource =
  "unverified" | "owner_entered" | "document_referenced" | "broker_review_recorded" | "sample";
export type CoverageKind =
  | "employee_theft"
  | "funds_transfer"
  | "social_engineering"
  | "cyber"
  | "business_interruption"
  | "property"
  | "professional_liability"
  | "key_person"
  | "other";
export type Applicability = "unknown" | "assumed_covered" | "excluded";
export const TERM_LABELS = {
  premiumAnnual: "Annual premium",
  deductible: "Deductible / retention",
  insurerPaymentLimit: "Insurer-payment limit",
  unreimbursedPct: "Unreimbursed share above deductible (%)",
  sublimit: "Applicable sublimit",
  aggregateLimit: "Annual aggregate limit",
  aggregateRemaining: "Remaining aggregate",
  premiumCreditPct: "Credit supported by this quote (%)",
  paymentDelayDays: "Assumed claim-payment delay (days)",
} as const;
export type TermKey = keyof typeof TERM_LABELS;

export interface NumericFact {
  value: number | null;
  source: FactSource;
  reference: string;
  recordedOn: string | null;
}
export interface InsurancePolicy {
  id: string;
  label: string;
  kind: CoverageKind;
  carrier: string;
  policyReference: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  trigger: "unknown" | "loss_sustained" | "discovery" | "claims_made" | "occurrence";
  limitBasis: "unknown" | "per_event" | "annual_aggregate";
  premiumBasis: "quoted_net" | "base_before_quoted_credit";
  terms: Record<TermKey, NumericFact>;
  scenarios: Record<string, Applicability>;
  conditions: string;
  exclusions: string;
  reportingRequirements: string;
  waitingPeriod: string;
}
export interface InsuranceWorkspace {
  version: 2;
  modelVersion: string;
  status: InsuranceStatus;
  policies: InsurancePolicy[];
  selectedPolicyId: string | null;
  annualFrequencyPct: number | null;
  annualFrequencySource: string;
}

const SOURCES = new Set<FactSource>([
  "unverified",
  "owner_entered",
  "document_referenced",
  "broker_review_recorded",
  "sample",
]);
const KINDS = new Set<CoverageKind>([
  "employee_theft",
  "funds_transfer",
  "social_engineering",
  "cyber",
  "business_interruption",
  "property",
  "professional_liability",
  "key_person",
  "other",
]);
const STATUS = new Set<InsuranceStatus>([
  "not_assessed",
  "none_reported",
  "reported_incomplete",
  "terms_entered",
]);
const text = (value: unknown, limit = 500): string =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const number = (value: unknown, maximum = 1_000_000_000): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum
    ? value
    : null;

export function dateValue(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}
export const unknownFact = (): NumericFact => ({
  value: null,
  source: "unverified",
  reference: "",
  recordedOn: null,
});
export function enteredFact(
  value: number | null,
  reference = "",
  source: FactSource = "owner_entered",
): NumericFact {
  return { value, reference, source, recordedOn: new Date().toISOString().slice(0, 10) };
}
export function emptyInsurance(): InsuranceWorkspace {
  return {
    version: 2,
    modelVersion: INSURANCE_MODEL_VERSION,
    status: "not_assessed",
    policies: [],
    selectedPolicyId: null,
    annualFrequencyPct: null,
    annualFrequencySource: "",
  };
}
export function newPolicy(id: string): InsurancePolicy {
  return {
    id,
    label: "My policy",
    kind: "employee_theft",
    carrier: "",
    policyReference: "",
    effectiveFrom: null,
    effectiveTo: null,
    trigger: "unknown",
    limitBasis: "unknown",
    premiumBasis: "quoted_net",
    terms: Object.fromEntries(
      Object.keys(TERM_LABELS).map((key) => [key, unknownFact()]),
    ) as Record<TermKey, NumericFact>,
    scenarios: {},
    conditions: "",
    exclusions: "",
    reportingRequirements: "",
    waitingPeriod: "",
  };
}

export function normalizeInsurance(value: unknown): InsuranceWorkspace {
  const raw = object(value);
  // Old numeric defaults carry no provenance. They must never become confirmed facts.
  if (raw.version !== 2) return emptyInsurance();
  const policies: InsurancePolicy[] = [];
  const ids = new Set<string>();
  for (const input of Array.isArray(raw.policies) ? raw.policies.slice(0, 20) : []) {
    const item = object(input);
    const id = text(item.id, 80);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const policy = newPolicy(id);
    policy.label = text(item.label, 100) || "Policy";
    policy.kind = KINDS.has(item.kind as CoverageKind) ? (item.kind as CoverageKind) : "other";
    policy.carrier = text(item.carrier, 100);
    policy.policyReference = text(item.policyReference, 200);
    policy.effectiveFrom = dateValue(item.effectiveFrom);
    policy.effectiveTo = dateValue(item.effectiveTo);
    if (["loss_sustained", "discovery", "claims_made", "occurrence"].includes(String(item.trigger)))
      policy.trigger = item.trigger as InsurancePolicy["trigger"];
    if (["per_event", "annual_aggregate"].includes(String(item.limitBasis)))
      policy.limitBasis = item.limitBasis as InsurancePolicy["limitBasis"];
    policy.premiumBasis =
      item.premiumBasis === "base_before_quoted_credit"
        ? "base_before_quoted_credit"
        : "quoted_net";
    const terms = object(item.terms);
    for (const key of Object.keys(TERM_LABELS) as TermKey[]) {
      const fact = object(terms[key]);
      policy.terms[key] = {
        value: number(
          fact.value,
          key.endsWith("Pct") ? 100 : key === "paymentDelayDays" ? 3650 : 1_000_000_000,
        ),
        source: SOURCES.has(fact.source as FactSource) ? (fact.source as FactSource) : "unverified",
        reference: text(fact.reference, 500),
        recordedOn: dateValue(fact.recordedOn),
      };
    }
    for (const [scenarioId, applicability] of Object.entries(object(item.scenarios)).slice(
      0,
      500,
    )) {
      if (["unknown", "assumed_covered", "excluded"].includes(String(applicability)))
        policy.scenarios[scenarioId.slice(0, 100)] = applicability as Applicability;
    }
    for (const key of [
      "conditions",
      "exclusions",
      "reportingRequirements",
      "waitingPeriod",
    ] as const)
      policy[key] = text(item[key], 2000);
    policies.push(policy);
  }
  return {
    version: 2,
    modelVersion: INSURANCE_MODEL_VERSION,
    status: STATUS.has(raw.status as InsuranceStatus)
      ? (raw.status as InsuranceStatus)
      : "not_assessed",
    policies,
    selectedPolicyId: policies.some((p) => p.id === raw.selectedPolicyId)
      ? String(raw.selectedPolicyId)
      : null,
    annualFrequencyPct: number(raw.annualFrequencyPct, 100),
    annualFrequencySource: text(raw.annualFrequencySource, 500),
  };
}

export function known(fact: NumericFact): boolean {
  return fact.value !== null && fact.source !== "unverified";
}
export function policyPremium(policy: InsurancePolicy): number | null {
  if (!known(policy.terms.premiumAnnual)) return null;
  const premium = policy.terms.premiumAnnual.value!;
  if (policy.premiumBasis === "quoted_net") return premium;
  // Do not apply a purported credit twice or infer a carrier discount from a control.
  const credit = known(policy.terms.premiumCreditPct) ? policy.terms.premiumCreditPct.value! : 0;
  return Math.round(premium * (1 - credit / 100) * 100) / 100;
}

export interface InsuranceScenarioResult {
  modelVersion: string;
  status:
    | "not_assessed"
    | "none_reported"
    | "not_established"
    | "excluded_recorded"
    | "coordination_needed"
    | "conditional";
  gross: number;
  potentialRecovery: number | null;
  retainedIfAssumptionsHold: number | null;
  conservativeUncreditedLoss: number;
  premiumAnnual: number | null;
  annualCostOfRisk: number | null;
  policyId: string | null;
  notes: string[];
}

export function modelInsuranceScenario(
  workspace: InsuranceWorkspace,
  scenarioId: string,
  grossLoss: number,
  asOf = new Date().toISOString().slice(0, 10),
): InsuranceScenarioResult {
  if (!Number.isFinite(grossLoss) || grossLoss < 0 || grossLoss > 1_000_000_000)
    throw new Error("Loss must be a nonnegative finite amount within the model limit");
  if (!dateValue(asOf)) throw new Error("Scenario date must be a valid calendar date");
  const gross = Math.round(grossLoss * 100) / 100;
  const result: InsuranceScenarioResult = {
    modelVersion: INSURANCE_MODEL_VERSION,
    status: "not_assessed",
    gross,
    potentialRecovery: null,
    retainedIfAssumptionsHold: null,
    conservativeUncreditedLoss: gross,
    premiumAnnual: null,
    annualCostOfRisk: null,
    policyId: null,
    notes: [
      "Conditional illustration, not a quote, policy interpretation, claim decision, or promise of payment.",
    ],
  };
  if (workspace.status === "not_assessed") return result;
  if (workspace.status === "none_reported")
    return {
      ...result,
      status: "none_reported",
      potentialRecovery: 0,
      retainedIfAssumptionsHold: gross,
      premiumAnnual: 0,
    };
  const candidates = workspace.policies.filter(
    (p) => p.scenarios[scenarioId] === "assumed_covered",
  );
  const selected = workspace.policies.find((p) => p.id === workspace.selectedPolicyId);
  if (!selected && candidates.length > 1)
    return {
      ...result,
      status: "coordination_needed",
      notes: [
        ...result.notes,
        "Several policies are marked potentially applicable. Select one for a stand-alone comparison; recoveries are not added together.",
      ],
    };
  const policy = selected ?? candidates[0];
  if (!policy)
    return {
      ...result,
      status: "not_established",
      notes: [
        ...result.notes,
        "No policy has an explicit applicability assumption for this scenario.",
      ],
    };
  result.policyId = policy.id;
  result.premiumAnnual = policyPremium(policy);
  if (policy.scenarios[scenarioId] === "excluded")
    return {
      ...result,
      status: "excluded_recorded",
      potentialRecovery: 0,
      retainedIfAssumptionsHold: gross,
    };
  if (policy.scenarios[scenarioId] !== "assumed_covered")
    return { ...result, status: "not_established" };
  const missing = (["deductible", "insurerPaymentLimit", "unreimbursedPct"] as TermKey[]).filter(
    (key) => !known(policy.terms[key]),
  );
  if (policy.limitBasis === "unknown") result.notes.push("The limit basis has not been recorded.");
  if (policy.limitBasis === "annual_aggregate" && !known(policy.terms.aggregateRemaining))
    missing.push("aggregateRemaining");
  const aggregate = policy.terms.aggregateLimit;
  const remaining = policy.terms.aggregateRemaining;
  if (known(aggregate) && (!known(remaining) || remaining.value! > aggregate.value!)) {
    result.notes.push("Record a remaining aggregate that does not exceed the annual aggregate.");
    return { ...result, status: "not_established" };
  }
  if (missing.length || policy.limitBasis === "unknown")
    return {
      ...result,
      status: "not_established",
      notes: [
        ...result.notes,
        `Missing confirmed terms: ${missing.map((key) => TERM_LABELS[key]).join(", ") || "limit basis"}.`,
      ],
    };
  if (
    (policy.effectiveFrom && asOf < policy.effectiveFrom) ||
    (policy.effectiveTo && asOf > policy.effectiveTo) ||
    (policy.effectiveFrom && policy.effectiveTo && policy.effectiveFrom > policy.effectiveTo)
  ) {
    return {
      ...result,
      status: "not_established",
      notes: [
        ...result.notes,
        "The illustration date is outside the recorded period or the period is invalid. Extended reporting/discovery provisions require review; no recovery is credited automatically.",
      ],
    };
  }
  if (!policy.effectiveFrom || !policy.effectiveTo)
    result.notes.push("Policy dates are incomplete; their applicability remains an assumption.");
  if (policy.trigger === "unknown")
    result.notes.push("The loss/discovery/claims trigger remains unverified.");
  const cents = Math.round(gross * 100);
  const deductible = Math.round(policy.terms.deductible.value! * 100);
  const layer = Math.round(
    Math.max(0, cents - deductible) * (1 - policy.terms.unreimbursedPct.value! / 100),
  );
  const caps = [Math.round(policy.terms.insurerPaymentLimit.value! * 100)];
  for (const key of ["sublimit", "aggregateRemaining"] as const) {
    if (known(policy.terms[key])) caps.push(Math.round(policy.terms[key].value! * 100));
  }
  const recovery = Math.max(0, Math.min(cents, layer, ...caps));
  const retained = cents - recovery;
  result.status = "conditional";
  result.potentialRecovery = recovery / 100;
  result.retainedIfAssumptionsHold = retained / 100;
  if (result.premiumAnnual !== null && workspace.annualFrequencyPct !== null) {
    result.annualCostOfRisk =
      Math.round(
        (result.premiumAnnual + ((retained / 100) * workspace.annualFrequencyPct) / 100) * 100,
      ) / 100;
    result.notes.push(
      "Annual cost uses the owner's stated one-event annual-frequency assumption; it is not actuarially calibrated and does not model multiple annual events.",
    );
  }
  result.notes.push(
    "Unmodeled conditions, exclusions, expenses, reporting deadlines and overlapping coverage require broker review. Insurance transfer does not correct the underlying control gap.",
  );
  return result;
}
