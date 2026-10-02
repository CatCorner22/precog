import type { ControlItem, ScenarioTemplate, CrimeFraudStats } from "../types";
import type { SamplePaymentSafeguards } from "./types";

type Mitigation = ScenarioTemplate["mitigations"][number];

/** How one sample words a shared scenario: its own text, relabelled mitigations, extra ones. */
type ScenarioChange = Partial<
  Pick<ScenarioTemplate, "title" | "description" | "knowledgeId" | "controlId" | "sodRuleIds">
> & {
  /** New labels for shared mitigations, by mitigation id. */
  relabel?: Partial<Record<string, string>>;
  /** Mitigations only this sample offers, after the shared ones. */
  extraMitigations?: Mitigation[];
};

/**
 * Core financial SoD controls reused across industry templates. `changes`
 * rewords or re-flags a control by id for one sample, so every sample keeps
 * the shared ids and only states what differs.
 */
export function baseFinancialControls(
  changes: Partial<Record<string, Partial<ControlItem>>> = {},
): ControlItem[] {
  return BASE_CONTROLS.map((c) => ({
    ...c,
    duties: [...c.duties],
    compensatingControls: [...c.compensatingControls],
    ...changes[c.id],
  }));
}

/**
 * The key-person scenario, worded for the sample's own expert, followed by
 * the shared fraud scenarios (see sharedFraudScenarios).
 */
export function baseFraudScenarios(opts: {
  keyPersonTitle: string;
  keyPersonDesc: string;
  knowledgeId: string;
  billingLabel?: string;
  changes?: Partial<Record<string, ScenarioChange>>;
}): ScenarioTemplate[] {
  const keyPerson: ScenarioTemplate = {
    id: "sc-key-person-leaves",
    title: opts.keyPersonTitle,
    description: opts.keyPersonDesc,
    knowledgeId: opts.knowledgeId,
    ...SCENARIO_FIGURES.keyPerson,
    cascadeLayers: ["knowledge", "process", "surface", "continuity"],
    mitigations: [
      {
        id: "m1",
        label: "Cross-train a stand-in with a written procedure",
        effort: "medium",
        riskReduction: 0.55,
        costAnnual: 2400,
      },
      {
        id: "m2",
        label: "Write down what only they know before they leave",
        effort: "low",
        riskReduction: 0.35,
        costAnnual: 400,
      },
    ],
  };
  const changes = { ...opts.changes };
  if (opts.billingLabel) {
    changes["sc-writeoff-abuse"] = { title: opts.billingLabel, ...changes["sc-writeoff-abuse"] };
  }
  return [
    applyScenarioChange(keyPerson, changes["sc-key-person-leaves"]),
    ...sharedFraudScenarios(changes),
  ];
}

/**
 * The three fraud scenarios every sample shares (cash posting and
 * reconciliation, write-offs, vendor setup and payment), reworded by id.
 */
export function sharedFraudScenarios(
  changes: Partial<Record<string, ScenarioChange>> = {},
): ScenarioTemplate[] {
  return SHARED_FRAUD_SCENARIOS.map((s) => applyScenarioChange(s, changes[s.id]));
}

/**
 * Timeline and loss inputs for each kind of scenario, the only place a
 * template's scenario dollars and days are written. They are illustrative
 * examples, not sized to any business and not measurements, and they never
 * set a scenario's rank (see scoring/scenario-level). Every sample reuses
 * the set for the closest scheme so one change moves them all: the cash
 * scenario for skimming, card abuse, payroll padding, trust money, sales
 * tax, repair-order cash and padded field time; the write-off scenario for
 * non-cash theft, parts and materials, restricted funds and the tip pool;
 * vendor fraud for invented vendors, subcontractors, kickbacks, deal fees
 * and wires covered by journal entries.
 */
export const SCENARIO_FIGURES = {
  keyPerson: {
    baseTimelineDays: { p50: 45, p95Low: 28, p95High: 75 },
    baseFinancialImpact: { expected: 16500, low: 7000, high: 38000 },
  },
  // The key-person days, with a larger loss because a denial backlog holds
  // up insurance revenue (the dental front desk).
  frontDesk: {
    baseTimelineDays: { p50: 45, p95Low: 28, p95High: 75 },
    baseFinancialImpact: { expected: 18500, low: 8000, high: 42000 },
  },
  cash: {
    baseTimelineDays: { p50: 90, p95Low: 45, p95High: 210 },
    baseFinancialImpact: { expected: 28000, low: 5000, high: 95000 },
  },
  writeoff: {
    baseTimelineDays: { p50: 120, p95Low: 60, p95High: 240 },
    baseFinancialImpact: { expected: 22000, low: 4000, high: 70000 },
  },
  vendor: {
    baseTimelineDays: { p50: 100, p95Low: 50, p95High: 200 },
    baseFinancialImpact: { expected: 40000, low: 8000, high: 125000 },
  },
} satisfies Record<string, Pick<ScenarioTemplate, "baseTimelineDays" | "baseFinancialImpact">>;

/**
 * No sample has either payment safeguard yet: one person can release a
 * payment and nobody independent reconciles the bank. The other team figures
 * are derived from each sample's people (see IndustrySample).
 */
export const SAMPLE_SAFEGUARDS: SamplePaymentSafeguards = {
  dualControlPayments: false,
  independentBankRec: false,
};

/**
 * Published fraud statistics, shared by every industry.
 *
 * Every figure below comes from the ACFE's Occupational Fraud 2026: A Report
 * to the Nations — 2,402 cases across 143 countries, investigated and closed
 * between January 2024 and September 2025. The one exception is the prior,
 * which is labelled as the assumption it is.
 *
 * This record is deliberately identical across industries. The previous
 * per-industry rates (dental 18%, professional services 16%, restaurant 22%)
 * implied a precision no study supports, and the variation between them was
 * invented.
 */
export const DEFAULT_FRAUD_STATS: CrimeFraudStats = {
  // Not a measurement. See CrimeFraudStats for why this is an assumption and
  // why it does not vary by industry.
  assumedControlFailurePrior: 0.15,
  medianLossSmallOrgUsd: 126_000,
  medianLossAllUsd: 104_000,
  revenueLossRateAnnual: 0.05,
  medianDetectionMonths: 12,
  lossIfCaughtEarlyUsd: 40_000,
  // Published as "exceeding $1.1 million" — an open-ended floor. Recorded as
  // that floor rather than a manufactured precise figure.
  lossIfRunsLongUsd: 1_100_000,
  shareFoundUnderSixMonths: 0.33,
  shareRunningOverFiveYears: 0.05,
  source:
    "ACFE, Occupational Fraud 2026: A Report to the Nations (2,402 cases, 143 countries). Figures describe organizations that suffered an investigated fraud; they are not a forecast for any particular business.",
  sourceUrl: "https://www.acfe.com/fraud-resources/report-to-the-nations",
};

function applyScenarioChange(
  scenario: ScenarioTemplate,
  change: ScenarioChange | undefined,
): ScenarioTemplate {
  if (!change) return { ...scenario, mitigations: scenario.mitigations.map((m) => ({ ...m })) };
  const { relabel = {}, extraMitigations = [], ...text } = change;
  return {
    ...scenario,
    ...text,
    mitigations: [
      ...scenario.mitigations.map((m) => ({ ...m, label: relabel[m.id] ?? m.label })),
      ...extraMitigations,
    ],
  };
}

const BASE_CONTROLS: readonly ControlItem[] = [
  {
    id: "c-cash",
    name: "Cash handling control",
    description: "Separate custody of cash from deposit reconciliation.",
    duties: ["custody", "recording", "reconciliation"],
    segregated: false,
    compensatingControls: ["Owner reviews bank statements monthly"],
    residualRiskAccepted: false,
  },
  {
    id: "c-sod-cash",
    name: "Split duties: posting payments and reconciling the bank",
    description: "The same person posts payments and reconciles the bank.",
    duties: ["recording", "reconciliation"],
    segregated: false,
    compensatingControls: ["Owner compares each deposit with the day's sales record weekly"],
    residualRiskAccepted: true,
  },
  {
    id: "c-sod-billing",
    name: "Split duties: billing adjustments",
    description: "Billing can post write-offs without independent approval.",
    duties: ["authorization", "recording"],
    segregated: false,
    compensatingControls: ["Monthly adjustment report to owner"],
    residualRiskAccepted: false,
  },
  {
    id: "c-sod-ap",
    name: "Split duties: vendor setup and payment",
    description: "The person who pays bills can also add vendors.",
    duties: ["authorization", "custody"],
    segregated: false,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
  {
    id: "c-sod-ar",
    name: "Split duties: receivable write-offs",
    description: "Write-off authority with independent approval.",
    duties: ["authorization", "recording"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
  {
    id: "c-ap",
    name: "Invoice matching",
    description: "Match receipt to invoice before payment.",
    duties: ["review", "authorization"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
  {
    id: "c-ar",
    name: "Receivables aging review",
    description: "The owner reviews balances more than 90 days old each month.",
    duties: ["review"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
  {
    id: "c-payroll",
    name: "Payroll approval",
    description: "Owner approves payroll before transmission.",
    duties: ["authorization"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
];

const SHARED_FRAUD_SCENARIOS: readonly ScenarioTemplate[] = [
  {
    id: "sc-cash-sod-failure",
    title: "One person posts payments and reconciles the bank",
    description:
      "The same person posts payments and reconciles the bank, and nobody independent reviews the reconciliation.",
    controlId: "c-sod-cash",
    ...SCENARIO_FIGURES.cash,
    cascadeLayers: ["control", "process", "surface", "continuity"],
    mitigations: [
      {
        id: "m4",
        label: "Owner reconciles the bank independently each week",
        effort: "low",
        riskReduction: 0.5,
        costAnnual: 0,
      },
      {
        id: "m5",
        label: "Separate posting payments from handling deposits",
        effort: "medium",
        riskReduction: 0.7,
        costAnnual: 0,
      },
    ],
  },
  {
    id: "sc-writeoff-abuse",
    title: "Write-offs posted without a second approval",
    description:
      "Staff can post large adjustments without anyone else approving them, so revenue leaks away unseen.",
    controlId: "c-sod-billing",
    ...SCENARIO_FIGURES.writeoff,
    cascadeLayers: ["control", "knowledge", "process", "continuity"],
    mitigations: [
      {
        id: "m7",
        label: "Owner approves write-offs above the amount you set",
        effort: "low",
        riskReduction: 0.6,
        costAnnual: 0,
      },
    ],
  },
  {
    id: "sc-vendor-fraud",
    title: "One person sets up vendors and pays them",
    description:
      "The person who pays bills can also add vendors, so they can set up and pay a fake vendor.",
    controlId: "c-sod-ap",
    ...SCENARIO_FIGURES.vendor,
    cascadeLayers: ["control", "source", "process", "continuity"],
    mitigations: [
      {
        id: "m9",
        label: "Dual release on electronic payments above the amount you set",
        effort: "medium",
        riskReduction: 0.75,
        costAnnual: 0,
      },
    ],
  },
];
