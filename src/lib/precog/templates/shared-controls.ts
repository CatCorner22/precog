import type { ControlItem, ScenarioTemplate, CrimeFraudStats } from "../types";

/** Core financial SoD controls reused across industry templates. */
export function baseFinancialControls(): ControlItem[] {
  return [
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
      name: "SoD: payments vs reconciliation",
      description: "Same person posts payments and reconciles bank.",
      duties: ["recording", "reconciliation"],
      segregated: false,
      compensatingControls: ["Manager spot-checks deposits weekly"],
      residualRiskAccepted: true,
    },
    {
      id: "c-sod-billing",
      name: "SoD: billing adjustments",
      description: "Billing can post write-offs without independent approval.",
      duties: ["authorization", "recording"],
      segregated: false,
      compensatingControls: ["Monthly adjustment report to owner"],
      residualRiskAccepted: false,
    },
    {
      id: "c-sod-ap",
      name: "SoD: vendor setup vs payment",
      description: "AP can create vendors and release payments.",
      duties: ["authorization", "custody"],
      segregated: false,
      compensatingControls: ["Dual release on payments > $1,000"],
      residualRiskAccepted: false,
    },
    {
      id: "c-sod-ar",
      name: "SoD: A/R write-offs",
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
      name: "A/R aging review",
      description: "Owner reviews 90+ aging monthly.",
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
}

export function baseFraudScenarios(opts: {
  keyPersonTitle: string;
  keyPersonDesc: string;
  knowledgeId: string;
  billingLabel?: string;
}): ScenarioTemplate[] {
  return [
    {
      id: "sc-key-person-leaves",
      title: opts.keyPersonTitle,
      description: opts.keyPersonDesc,
      knowledgeId: opts.knowledgeId,
      baseTimelineDays: { p50: 45, p95Low: 28, p95High: 75 },
      baseFinancialImpact: { expected: 16500, low: 7000, high: 38000 },
      cascadeLayers: ["knowledge", "process", "surface", "continuity"],
      mitigations: [
        {
          id: "m1",
          label: "Cross-train backup with documented SOP",
          effort: "medium",
          riskReduction: 0.55,
          costAnnual: 2400,
        },
        {
          id: "m2",
          label: "Record tribal knowledge before exit",
          effort: "low",
          riskReduction: 0.35,
          costAnnual: 400,
        },
      ],
    },
    {
      id: "sc-cash-sod-failure",
      title: "Unsegregated cash + reconciliation control fails",
      description: "Same person posts payments and reconciles bank with weak independent review.",
      controlId: "c-sod-cash",
      baseTimelineDays: { p50: 90, p95Low: 45, p95High: 210 },
      baseFinancialImpact: { expected: 28000, low: 5000, high: 95000 },
      cascadeLayers: ["control", "process", "surface", "continuity"],
      mitigations: [
        {
          id: "m4",
          label: "Independent bank recon by owner weekly",
          effort: "low",
          riskReduction: 0.5,
          costAnnual: 0,
        },
        {
          id: "m5",
          label: "Split posting vs deposit custody",
          effort: "medium",
          riskReduction: 0.7,
          costAnnual: 0,
        },
      ],
    },
    {
      id: "sc-writeoff-abuse",
      title: opts.billingLabel ?? "Write-off authority without dual control",
      description:
        "Staff can post large adjustments without independent approval — revenue leakage path.",
      controlId: "c-sod-billing",
      baseTimelineDays: { p50: 120, p95Low: 60, p95High: 240 },
      baseFinancialImpact: { expected: 22000, low: 4000, high: 70000 },
      cascadeLayers: ["control", "knowledge", "process", "continuity"],
      mitigations: [
        {
          id: "m7",
          label: "Require owner approval above threshold",
          effort: "low",
          riskReduction: 0.6,
          costAnnual: 0,
        },
      ],
    },
    {
      id: "sc-vendor-fraud",
      title: "Vendor setup + payment not segregated",
      description: "AP can create vendors and release payments — fictitious vendor path.",
      controlId: "c-sod-ap",
      baseTimelineDays: { p50: 100, p95Low: 50, p95High: 200 },
      baseFinancialImpact: { expected: 40000, low: 8000, high: 125000 },
      cascadeLayers: ["control", "source", "process", "continuity"],
      mitigations: [
        {
          id: "m9",
          label: "Dual bank release on ACH above threshold",
          effort: "medium",
          riskReduction: 0.75,
          costAnnual: 0,
        },
      ],
    },
  ];
}

export const DEFAULT_STAFF = {
  teamSize: 6,
  soleOwnerKnowledgeCount: 2,
  avgTenureYears: 5.5,
  segregationScore: 42,
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
