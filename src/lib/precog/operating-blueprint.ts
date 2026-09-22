export type PracticeProcessDomain =
  "revenue" | "cash" | "purchasing" | "payroll" | "clinical" | "technology" | "governance";

export interface PracticeProcessBlueprint {
  id: string;
  name: string;
  domain: PracticeProcessDomain;
  objective: string;
  primaryOwner: string;
  independentReviewer: string;
  standard: string[];
  leading: string[];
  optimal: string[];
  fallback: string[];
  evidence: string[];
  cadence: string;
}

export const PRACTICE_PROCESS_BLUEPRINTS: PracticeProcessBlueprint[] = [
  {
    id: "patient-intake",
    name: "Patient intake, scheduling & eligibility",
    domain: "revenue",
    objective: "Accurate patient, coverage, consent, and appointment data before care.",
    primaryOwner: "Front Desk Lead",
    independentReviewer: "Office Manager",
    standard: [
      "Verify identity and coverage",
      "Document consent and estimates",
      "Review no-shows and overrides",
    ],
    leading: [
      "Automated eligibility checks",
      "Same-day exception queue",
      "Role-based schedule overrides",
    ],
    optimal: [
      "Daily exception dashboard with owner trends",
      "Measured access, utilization, and no-show causes",
    ],
    fallback: [
      "Weekly sample of registrations and overrides",
      "Owner review of unresolved eligibility exceptions",
    ],
    evidence: ["Eligibility result", "Consent", "Override report"],
    cadence: "Daily; monthly trend review",
  },
  {
    id: "clinical-documentation",
    name: "Clinical documentation, coding & charge capture",
    domain: "clinical",
    objective: "Complete, supported, timely records and charges for services performed.",
    primaryOwner: "Treating Provider",
    independentReviewer: "Clinical Lead / Billing Specialist",
    standard: [
      "Provider closes notes",
      "Codes trace to documentation",
      "Late changes retain an audit trail",
    ],
    leading: [
      "Pre-bill missing-note edits",
      "Targeted coding QA",
      "Exception analytics by procedure",
    ],
    optimal: ["Automated documentation-to-charge reconciliation", "Risk-based coding samples"],
    fallback: ["Weekly unsigned-note list", "Monthly sample by provider and high-risk code"],
    evidence: ["Closed note report", "Coding sample", "Late-entry log"],
    cadence: "Daily; monthly QA",
  },
  {
    id: "claims-ar",
    name: "Claims, denials & accounts receivable",
    domain: "revenue",
    objective: "Submit valid claims, resolve denials, and protect collectible revenue.",
    primaryOwner: "Billing Specialist",
    independentReviewer: "Office Manager / Owner",
    standard: [
      "Reconcile charges to claims",
      "Work aging by priority",
      "Reason-code adjustments and write-offs",
    ],
    leading: [
      "Denial root-cause analytics",
      "Payer-specific work queues",
      "Approval thresholds for adjustments",
    ],
    optimal: [
      "Closed-loop denial prevention",
      "Independent trend review tied to corrective actions",
    ],
    fallback: [
      "Owner reviews top aging and write-offs monthly",
      "Separate approval from posting above threshold",
    ],
    evidence: ["Claim reconciliation", "Aging report", "Adjustment register"],
    cadence: "Daily queues; monthly owner review",
  },
  {
    id: "cash-receipts",
    name: "Cash receipts, deposits & reconciliation",
    domain: "cash",
    objective: "All receipts are recorded, deposited intact, and independently reconciled.",
    primaryOwner: "Front Desk / Deposit Custodian",
    independentReviewer: "Owner or independent bookkeeper",
    standard: [
      "Daily drawer close",
      "Deposit equals PMS receipts",
      "Bank reconciliation independent of custody/posting",
    ],
    leading: ["Dual deposit custody", "Daily electronic exception match", "Surprise cash counts"],
    optimal: [
      "Automated bank-to-PMS reconciliation",
      "Continuous void and deposit anomaly monitoring",
    ],
    fallback: [
      "Owner opens bank statement and reviews recon",
      "Two-person count documented on deposit log",
    ],
    evidence: ["Drawer report", "Deposit slip", "Bank reconciliation"],
    cadence: "Daily; weekly independent review",
  },
  {
    id: "refunds-writeoffs",
    name: "Refunds, credits, write-offs & adjustments",
    domain: "cash",
    objective: "Only valid, supported account reductions and refunds are processed.",
    primaryOwner: "Billing Specialist",
    independentReviewer: "Owner / Office Manager",
    standard: [
      "Required reason and support",
      "Independent approval above threshold",
      "Refund to original method when feasible",
    ],
    leading: [
      "Daily exception queue",
      "Duplicate payee/account detection",
      "Trend review by user and reason",
    ],
    optimal: ["System-enforced maker-checker", "Continuous outlier detection with case workflow"],
    fallback: ["Weekly owner report of all refunds and write-offs", "No preparer self-approval"],
    evidence: ["Refund register", "Approval", "Credit-balance support"],
    cadence: "Per transaction; monthly trend review",
  },
  {
    id: "procure-pay",
    name: "Purchasing, vendors & payments",
    domain: "purchasing",
    objective: "Authorized goods and services are purchased from valid vendors and paid once.",
    primaryOwner: "Office Manager",
    independentReviewer: "Owner",
    standard: [
      "Approved purchase and receipt",
      "Vendor changes verified out of band",
      "Separate setup from payment release",
    ],
    leading: [
      "Dual release by risk threshold",
      "New-vendor report",
      "Duplicate invoice/payment analytics",
    ],
    optimal: [
      "System maker-checker with trusted callback registry",
      "Continuous master-data monitoring",
    ],
    fallback: [
      "Owner approves all new vendors and payments",
      "Monthly independent vendor-master review",
    ],
    evidence: ["Invoice and receipt", "Callback record", "Payment approval"],
    cadence: "Per transaction; monthly master review",
  },
  {
    id: "payroll",
    name: "Payroll & workforce changes",
    domain: "payroll",
    objective: "Only authorized workers and compensation changes are paid accurately.",
    primaryOwner: "Office Manager / Payroll Preparer",
    independentReviewer: "Owner",
    standard: [
      "Authorized master changes",
      "Review payroll register before funding",
      "Remove terminated access promptly",
    ],
    leading: [
      "Direct-deposit change callback",
      "Duplicate account/address scan",
      "Off-cycle exception review",
    ],
    optimal: [
      "HR-to-payroll automated reconciliation",
      "Independent analytics before every release",
    ],
    fallback: [
      "Owner compares register to prior period and personnel file",
      "External payroll provider plus owner release",
    ],
    evidence: ["Change authorization", "Payroll register", "Funding reconciliation"],
    cadence: "Each payroll; quarterly access review",
  },
  {
    id: "access-change",
    name: "Access, system changes & cybersecurity",
    domain: "technology",
    objective: "Access and configuration remain authorized, least-privileged, and recoverable.",
    primaryOwner: "System Administrator / Office Manager",
    independentReviewer: "Owner / Managed service provider",
    standard: [
      "Unique IDs and MFA",
      "Prompt joiner-mover-leaver updates",
      "Approved and logged configuration changes",
    ],
    leading: [
      "Quarterly access certification",
      "Privileged activity alerts",
      "Tested restoration and incident playbooks",
    ],
    optimal: [
      "Central identity lifecycle",
      "Immutable logs/backups and continuous control monitoring",
    ],
    fallback: [
      "Quarterly exported user list signed by owner",
      "Vendor-assisted restore test and change log",
    ],
    evidence: ["Access review", "Change ticket", "Restore test"],
    cadence: "Event-driven; quarterly review",
  },
  {
    id: "close-report",
    name: "Financial close, reporting & owner oversight",
    domain: "governance",
    objective: "Books are complete, reconciled, reviewed, and used for timely decisions.",
    primaryOwner: "Bookkeeper / Office Manager",
    independentReviewer: "Owner / CPA",
    standard: [
      "Reconcile cash and key balances",
      "Review unusual journal entries",
      "Document review and follow-up",
    ],
    leading: [
      "Close checklist with certification",
      "Variance and KPI thresholds",
      "Open-item aging",
    ],
    optimal: ["Continuous close dashboard", "Independent data-driven journal and override review"],
    fallback: ["Monthly CPA review", "Owner receives statements directly and documents questions"],
    evidence: ["Close checklist", "Reconciliations", "Review notes"],
    cadence: "Monthly",
  },
  {
    id: "continuity-governance",
    name: "Continuity, risk acceptance & governance",
    domain: "governance",
    objective: "Critical work survives disruption and accepted risks remain explicit and current.",
    primaryOwner: "Practice Owner",
    independentReviewer: "Advisor / CPA / designated backup",
    standard: ["Named process backups", "Dated risk decisions", "Incident and continuity contacts"],
    leading: [
      "Cross-training validation",
      "Scenario exercises",
      "Expiring risk acceptance workflow",
    ],
    optimal: [
      "Measured recovery objectives",
      "Quarterly control health and remediation governance",
    ],
    fallback: [
      "Document critical procedures and emergency contacts",
      "Quarterly owner/advisor review",
    ],
    evidence: ["Training record", "Exercise result", "Risk acceptance"],
    cadence: "Quarterly; after material change",
  },
];
