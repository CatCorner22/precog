import type {
  ControlItem,
  CrimeFraudStats,
  KnowledgeItem,
  KnowledgeRelation,
  MatrixLayerId,
  Person,
  ProcessNode,
  ScenarioTemplate,
  StaffComposition,
} from "./types";

export const PRACTICE_NAME = "Ridgeview Family Dental";

export const LAYER_META: Record<
  MatrixLayerId,
  { name: string; matrixName: string; blurb: string }
> = {
  surface: {
    name: "Surface Reality",
    matrixName: "The Construct",
    blurb: "Patients, chairs, schedule pressure, cash in drawer.",
  },
  process: {
    name: "Process Layer",
    matrixName: "Workflow Code",
    blurb: "Documented workflows, value streams, SOPs, Lean maps.",
  },
  knowledge: {
    name: "Knowledge / Tribal",
    matrixName: "Hidden Matrix",
    blurb: "Who actually knows how things work — SPOFs and succession risk.",
  },
  control: {
    name: "Control & Governance",
    matrixName: "Ruleset",
    blurb: "Internal controls, segregation of duties, residual risk.",
  },
  source: {
    name: "Source / Architecture",
    matrixName: "Infrastructure",
    blurb: "PMS, claims systems, vendors, data flows.",
  },
  continuity: {
    name: "Continuity / Exit",
    matrixName: "Red Pill",
    blurb: "What breaks when key people or systems disappear.",
  },
};

export const people: Person[] = [
  { id: "p1", name: "Dr. Elena Vargas", role: "Owner / Dentist", active: true, tenureYears: 12 },
  { id: "p2", name: "Maya Chen", role: "Office Manager", active: true, tenureYears: 7 },
  { id: "p3", name: "Jordan Blake", role: "Front Desk Lead", active: true, tenureYears: 5 },
  { id: "p4", name: "Sam Ortiz", role: "Hygienist", active: true, tenureYears: 4 },
  { id: "p5", name: "Riley Kim", role: "Dental Assistant", active: true, tenureYears: 2 },
  { id: "p6", name: "Chris Patel", role: "Billing Specialist", active: true, tenureYears: 3 },
];

export const knowledge: KnowledgeItem[] = [
  {
    id: "k1",
    name: "Insurance denial appeals",
    description: "Full denial workflow, payer quirks, appeal letter patterns.",
    criticality: "critical",
    category: "process",
    linkedProcessIds: ["proc-claims"],
  },
  {
    id: "k2",
    name: "Daily deposit & reconciliation",
    description: "Cash drawer, EFT matching, PMS vs bank deposit process.",
    criticality: "critical",
    category: "process",
    linkedProcessIds: ["proc-cash"],
  },
  {
    id: "k3",
    name: "PMS admin configuration",
    description: "User roles, fee schedules, claim templates, report setup.",
    criticality: "critical",
    category: "system",
    linkedProcessIds: ["proc-claims", "proc-schedule"],
  },
  {
    id: "k4",
    name: "Vendor invoice approval",
    description: "Lab bills, supply orders, approval thresholds.",
    criticality: "important",
    category: "vendor",
    linkedProcessIds: ["proc-ap"],
  },
  {
    id: "k5",
    name: "Sterilization protocol",
    description: "Instrument flow, spore testing, documentation.",
    criticality: "critical",
    category: "clinical",
    linkedProcessIds: ["proc-clinical"],
  },
  {
    id: "k6",
    name: "Payroll exception handling",
    description: "OT, bonuses, PTO edge cases in payroll export.",
    criticality: "important",
    category: "process",
    linkedProcessIds: ["proc-payroll"],
  },
  {
    id: "k7",
    name: "Write-off & adjustment authority",
    description: "Who may adjust balances and how they are documented.",
    criticality: "critical",
    category: "compliance",
    linkedProcessIds: ["proc-ar"],
  },
];

export const relations: KnowledgeRelation[] = [
  { personId: "p3", knowledgeId: "k1", level: "expert" },
  { personId: "p3", knowledgeId: "k2", level: "expert" },
  { personId: "p6", knowledgeId: "k1", level: "basic" },
  { personId: "p2", knowledgeId: "k2", level: "proficient" },
  { personId: "p2", knowledgeId: "k3", level: "expert" },
  { personId: "p6", knowledgeId: "k3", level: "basic" },
  { personId: "p2", knowledgeId: "k4", level: "expert" },
  { personId: "p1", knowledgeId: "k4", level: "aware" },
  { personId: "p4", knowledgeId: "k5", level: "expert" },
  { personId: "p5", knowledgeId: "k5", level: "proficient" },
  { personId: "p2", knowledgeId: "k6", level: "expert" },
  { personId: "p6", knowledgeId: "k7", level: "expert" },
  { personId: "p2", knowledgeId: "k7", level: "proficient" },
];

export const processes: ProcessNode[] = [
  {
    id: "proc-schedule",
    name: "Scheduling & chair utilization",
    layer: "process",
    description: "Booking, confirmations, same-day openings.",
    dependencies: [],
    controlIds: ["c-schedule"],
  },
  {
    id: "proc-clinical",
    name: "Clinical delivery",
    layer: "process",
    description: "Hygiene and restorative chairside flow.",
    dependencies: ["proc-schedule"],
    controlIds: ["c-clinical"],
  },
  {
    id: "proc-claims",
    name: "Claims & denials",
    layer: "process",
    description: "Submit, track, appeal insurance claims.",
    dependencies: ["proc-clinical"],
    controlIds: ["c-claims", "c-sod-billing"],
  },
  {
    id: "proc-cash",
    name: "Cash handling & deposits",
    layer: "process",
    description: "Patient payments, drawer, bank deposit.",
    dependencies: [],
    controlIds: ["c-cash", "c-sod-cash"],
  },
  {
    id: "proc-ap",
    name: "Accounts payable",
    layer: "process",
    description: "Vendor invoices, labs, supplies.",
    dependencies: [],
    controlIds: ["c-ap", "c-sod-ap"],
  },
  {
    id: "proc-ar",
    name: "A/R & adjustments",
    layer: "process",
    description: "Patient balances, write-offs, collections.",
    dependencies: ["proc-claims"],
    controlIds: ["c-ar", "c-sod-ar"],
  },
  {
    id: "proc-payroll",
    name: "Payroll",
    layer: "process",
    description: "Time, exceptions, payroll export.",
    dependencies: [],
    controlIds: ["c-payroll"],
  },
];

export const controls: ControlItem[] = [
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
    compensatingControls: ["Office manager spot-checks deposits weekly"],
    residualRiskAccepted: true,
  },
  {
    id: "c-sod-billing",
    name: "SoD: claims adjustments",
    description: "Billing can submit claims and post write-offs.",
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
    description: "Write-off authority without independent approval.",
    duties: ["authorization", "recording"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
  {
    id: "c-claims",
    name: "Denial aging review",
    description: "Weekly review of open denials > 30 days.",
    duties: ["review"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
  {
    id: "c-ap",
    name: "Invoice matching",
    description: "Match packing slip to invoice before payment.",
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
  {
    id: "c-schedule",
    name: "Schedule change audit",
    description: "Daily confirmation of schedule changes.",
    duties: ["review"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
  {
    id: "c-clinical",
    name: "Clinical documentation check",
    description: "Charts closed same day with required elements.",
    duties: ["review"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
];

export const staffComposition: StaffComposition = {
  teamSize: 6,
  soleOwnerKnowledgeCount: 2,
  avgTenureYears: 5.5,
  segregationScore: 42,
  dualControlPayments: false,
  independentBankRec: false,
};

/** Industry-oriented illustrative base rates for demo (educational, not actuarial advice). */
export const crimeFraudStats: CrimeFraudStats = {
  industryEmbezzlementRate: 0.18,
  typicalLossMid: 35000,
  typicalLossHigh: 125000,
  medianDetectionDays: 90,
  detectionDaysP95: 210,
  source:
    "Illustrative synthesis of small professional practice fraud / embezzlement studies (e.g. ACFE Report to the Nations patterns for small orgs; dental practice management fraud case literature). Educational demo rates — not firm-specific actuarial pricing.",
};

export const scenarios: ScenarioTemplate[] = [
  {
    id: "sc-front-desk-leaves",
    title: "Front desk lead leaves with sole denial knowledge",
    description:
      "Jordan (sole expert on insurance denial appeals) resigns with 2 weeks notice. No cross-training documented.",
    knowledgeId: "k1",
    controlId: "c-claims",
    baseTimelineDays: { p50: 45, p95Low: 28, p95High: 75 },
    baseFinancialImpact: { expected: 18500, low: 8000, high: 42000 },
    statSources: [
      "Denial aging / revenue cycle lag patterns in dental practice management literature",
      "Key-person risk: revenue leakage when sole expert exits mid-cycle",
    ],
    cascadeLayers: ["knowledge", "process", "surface", "continuity"],
    mitigations: [
      {
        id: "m1",
        label: "Cross-train billing on denial appeals (documented SOP)",
        effort: "medium",
        riskReduction: 0.55,
        costAnnual: 2400,
      },
      {
        id: "m2",
        label: "Hire temporary RCM support for 90 days",
        effort: "high",
        riskReduction: 0.65,
        costAnnual: 12000,
      },
      {
        id: "m3",
        label: "Record Jordan's denial playbook before exit",
        effort: "low",
        riskReduction: 0.35,
        costAnnual: 400,
      },
    ],
  },
  {
    id: "sc-cash-sod-failure",
    title: "Unsegregated cash + reconciliation control fails",
    description:
      "Same person posts payments and reconciles bank with weak independent review. Opportunity + weak SoD elevates fraud and error risk.",
    controlId: "c-sod-cash",
    baseTimelineDays: { p50: 90, p95Low: 45, p95High: 210 },
    baseFinancialImpact: { expected: 28000, low: 5000, high: 95000 },
    statSources: [
      crimeFraudStats.source,
      "ACFE-style small organization fraud: longer detection when custody + recording combined",
    ],
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
      {
        id: "m6",
        label: "Camera + dual count on cash drawer close",
        effort: "medium",
        riskReduction: 0.4,
        costAnnual: 800,
      },
    ],
  },
  {
    id: "sc-writeoff-abuse",
    title: "Write-off authority without dual control",
    description:
      "Billing can post large adjustments without independent approval. Control gap + staff composition raises residual risk.",
    controlId: "c-sod-billing",
    knowledgeId: "k7",
    baseTimelineDays: { p50: 120, p95Low: 60, p95High: 240 },
    baseFinancialImpact: { expected: 22000, low: 4000, high: 70000 },
    statSources: [
      crimeFraudStats.source,
      "Revenue leakage studies: undocumented adjustments and weak dual control",
    ],
    cascadeLayers: ["control", "knowledge", "process", "continuity"],
    mitigations: [
      {
        id: "m7",
        label: "Require owner approval for write-offs > $150",
        effort: "low",
        riskReduction: 0.6,
        costAnnual: 0,
      },
      {
        id: "m8",
        label: "Monthly adjustment exception report",
        effort: "low",
        riskReduction: 0.45,
        costAnnual: 0,
      },
    ],
  },
  {
    id: "sc-vendor-fraud",
    title: "Vendor setup + payment not segregated",
    description:
      "AP can create vendors and release payments. Classic fraud path when dual release is missing.",
    controlId: "c-sod-ap",
    baseTimelineDays: { p50: 100, p95Low: 50, p95High: 200 },
    baseFinancialImpact: { expected: 40000, low: 8000, high: 125000 },
    statSources: [
      crimeFraudStats.source,
      "Billing schemes / fictitious vendor patterns in small entity fraud literature",
    ],
    cascadeLayers: ["control", "source", "process", "continuity"],
    mitigations: [
      {
        id: "m9",
        label: "Dual bank release on all ACH > $500",
        effort: "medium",
        riskReduction: 0.75,
        costAnnual: 0,
      },
      {
        id: "m10",
        label: "Independent new-vendor review monthly",
        effort: "low",
        riskReduction: 0.5,
        costAnnual: 0,
      },
    ],
  },
];
