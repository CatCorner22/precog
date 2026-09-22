/**
 * SoD conflict rulebook for small dental practices.
 * Classic custody / authorization / recording / reconciliation pairs
 * plus dental-specific entitlement combinations.
 *
 * Educational control design — not a legal compliance product.
 */

export type DutyFamily =
  | "authorization"
  | "custody"
  | "recording"
  | "reconciliation"
  | "master_data";

export type EntitlementId =
  | "collect_cash"
  | "post_payments"
  | "prepare_deposit"
  | "bank_reconcile"
  | "approve_writeoffs"
  | "post_adjustments"
  | "submit_claims"
  | "create_vendor"
  | "approve_vendor"
  | "release_payment"
  | "approve_payroll"
  | "enter_payroll"
  | "pms_admin_roles"
  | "issue_refunds"
  | "change_fee_schedule"
  | "edit_patient_master"
  | "manage_user_access"
  | "export_bulk_data"
  | "order_supplies"
  | "receive_goods"
  | "enter_invoices"
  | "initiate_ach"
  | "sign_checks"
  | "review_audit_logs"
  | "manage_backups"
  | "view_reports_only";

export interface Entitlement {
  id: EntitlementId;
  label: string;
  family: DutyFamily;
  processIds: string[];
  riskWeight: number; // 1–5
}

export interface ConflictRule {
  id: string;
  a: EntitlementId;
  b: EntitlementId;
  severity: "critical" | "high" | "medium";
  title: string;
  why: string;
  fraudPath: string;
  compensatingDefaults: string[];
  linkedScenarioId?: string;
  linkedControlId?: string;
}

export const ENTITLEMENTS: Entitlement[] = [
  {
    id: "collect_cash",
    label: "Collect patient payments / cash drawer",
    family: "custody",
    processIds: ["proc-cash"],
    riskWeight: 5,
  },
  {
    id: "post_payments",
    label: "Post payments in PMS",
    family: "recording",
    processIds: ["proc-cash", "proc-ar"],
    riskWeight: 4,
  },
  {
    id: "prepare_deposit",
    label: "Prepare bank deposit",
    family: "custody",
    processIds: ["proc-cash"],
    riskWeight: 5,
  },
  {
    id: "bank_reconcile",
    label: "Reconcile bank to PMS",
    family: "reconciliation",
    processIds: ["proc-cash", "proc-ar"],
    riskWeight: 5,
  },
  {
    id: "approve_writeoffs",
    label: "Approve write-offs / adjustments",
    family: "authorization",
    processIds: ["proc-ar", "proc-claims"],
    riskWeight: 5,
  },
  {
    id: "post_adjustments",
    label: "Post adjustments / write-offs",
    family: "recording",
    processIds: ["proc-ar", "proc-claims"],
    riskWeight: 4,
  },
  {
    id: "submit_claims",
    label: "Submit insurance claims",
    family: "recording",
    processIds: ["proc-claims"],
    riskWeight: 3,
  },
  {
    id: "create_vendor",
    label: "Create / edit vendor master",
    family: "master_data",
    processIds: ["proc-ap"],
    riskWeight: 5,
  },
  {
    id: "approve_vendor",
    label: "Approve new vendors",
    family: "authorization",
    processIds: ["proc-ap"],
    riskWeight: 4,
  },
  {
    id: "release_payment",
    label: "Release vendor payments / ACH",
    family: "custody",
    processIds: ["proc-ap"],
    riskWeight: 5,
  },
  {
    id: "enter_payroll",
    label: "Enter payroll / exceptions",
    family: "recording",
    processIds: ["proc-payroll"],
    riskWeight: 3,
  },
  {
    id: "approve_payroll",
    label: "Approve payroll file",
    family: "authorization",
    processIds: ["proc-payroll"],
    riskWeight: 4,
  },
  {
    id: "pms_admin_roles",
    label: "PMS admin / role assignment",
    family: "master_data",
    processIds: ["proc-claims", "proc-schedule"],
    riskWeight: 4,
  },
  {
    id: "view_reports_only",
    label: "View financial reports only",
    family: "reconciliation",
    processIds: [],
    riskWeight: 1,
  },
  { id: "issue_refunds", label: "Issue patient refunds", family: "custody", processIds: ["proc-ar", "proc-cash"], riskWeight: 5 },
  { id: "change_fee_schedule", label: "Change fee schedules / pricing", family: "master_data", processIds: ["proc-ar", "proc-claims"], riskWeight: 4 },
  { id: "edit_patient_master", label: "Edit patient / guarantor master data", family: "master_data", processIds: ["proc-schedule", "proc-ar"], riskWeight: 3 },
  { id: "manage_user_access", label: "Create users / assign system access", family: "master_data", processIds: ["proc-schedule", "proc-claims"], riskWeight: 5 },
  { id: "export_bulk_data", label: "Export bulk patient / financial data", family: "custody", processIds: ["proc-ar", "proc-claims"], riskWeight: 4 },
  { id: "order_supplies", label: "Order supplies / services", family: "authorization", processIds: ["proc-ap", "proc-clinical"], riskWeight: 3 },
  { id: "receive_goods", label: "Confirm receipt of goods / services", family: "custody", processIds: ["proc-ap"], riskWeight: 3 },
  { id: "enter_invoices", label: "Enter invoices / bills", family: "recording", processIds: ["proc-ap"], riskWeight: 4 },
  { id: "initiate_ach", label: "Initiate ACH / electronic payment", family: "custody", processIds: ["proc-ap", "proc-payroll"], riskWeight: 5 },
  { id: "sign_checks", label: "Sign / release checks", family: "authorization", processIds: ["proc-ap", "proc-payroll"], riskWeight: 5 },
  { id: "review_audit_logs", label: "Review system audit / access logs", family: "reconciliation", processIds: ["proc-claims", "proc-ar"], riskWeight: 3 },
  { id: "manage_backups", label: "Manage backups / recovery settings", family: "custody", processIds: ["proc-clinical", "proc-claims"], riskWeight: 4 },
];

/**
 * Incompatible pairs — the core of automated conflict detection.
 * Symmetric: engine treats (a,b) same as (b,a).
 */
export const CONFLICT_RULES: ConflictRule[] = [
  {
    id: "rule-refund-adjust",
    a: "issue_refunds",
    b: "post_adjustments",
    severity: "critical",
    title: "Refund custody + account adjustment",
    why: "One person can create a false credit and release the resulting refund.",
    fraudPath: "Post unsupported credit, then refund to a controlled payment method",
    compensatingDefaults: ["Independent refund approval", "Refund to original payment method"],
    linkedControlId: "c-sod-billing",
  },
  {
    id: "rule-invoice-pay",
    a: "enter_invoices",
    b: "release_payment",
    severity: "critical",
    title: "Invoice entry + payment release",
    why: "The same person can enter an unsupported invoice and pay it.",
    fraudPath: "Enter fictitious invoice and release payment",
    compensatingDefaults: ["Owner reviews invoice support", "Dual release above threshold"],
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-order-receive",
    a: "order_supplies",
    b: "receive_goods",
    severity: "high",
    title: "Ordering + receipt confirmation",
    why: "The requester can conceal missing, diverted, or never-delivered goods.",
    fraudPath: "Order for personal use and self-confirm receipt",
    compensatingDefaults: ["Independent receiving evidence", "Periodic inventory review"],
  },
  {
    id: "rule-ach-release",
    a: "initiate_ach",
    b: "release_payment",
    severity: "critical",
    title: "ACH initiation + payment release",
    why: "End-to-end electronic payment power permits unauthorized transfers.",
    fraudPath: "Create and self-release electronic payment",
    compensatingDefaults: ["Bank-enforced dual approval", "Owner out-of-band release"],
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-access-log",
    a: "manage_user_access",
    b: "review_audit_logs",
    severity: "critical",
    title: "Access administration + audit-log review",
    why: "An administrator can grant access and suppress independent detection.",
    fraudPath: "Create privileged account and self-clear or ignore evidence",
    compensatingDefaults: ["Independent quarterly access review", "Immutable vendor-hosted logs"],
  },
  {
    id: "rule-access-export",
    a: "manage_user_access",
    b: "export_bulk_data",
    severity: "high",
    title: "Access administration + bulk export",
    why: "The same person can grant themselves access and export sensitive data.",
    fraudPath: "Elevate access, export PHI or financial data, then remove account",
    compensatingDefaults: ["Export alerts to owner", "Independent access-change report"],
  },
  {
    id: "rule-backup-access",
    a: "manage_backups",
    b: "manage_user_access",
    severity: "high",
    title: "Identity administration + backup control",
    why: "Concentrated administrative power can disable recovery and conceal destructive activity.",
    fraudPath: "Alter access and delete or weaken recovery copies",
    compensatingDefaults: ["Separate backup console credentials", "Immutable/offline recovery copy"],
  },
  {
    id: "rule-cash-rec",
    a: "post_payments",
    b: "bank_reconcile",
    severity: "critical",
    title: "Payment posting + bank reconciliation",
    why: "Same person can hide missing deposits by adjusting the books or recon.",
    fraudPath: "Lapping / skim cash, then force recon to match",
    compensatingDefaults: [
      "Owner performs independent bank rec weekly",
      "Dual count on deposit bags",
    ],
    linkedScenarioId: "sc-cash-sod-failure",
    linkedControlId: "c-sod-cash",
  },
  {
    id: "rule-custody-rec",
    a: "collect_cash",
    b: "bank_reconcile",
    severity: "critical",
    title: "Cash custody + bank reconciliation",
    why: "Custody plus recon removes independent detection of skimming.",
    fraudPath: "Under-ring or pocket cash; recon self-clears",
    compensatingDefaults: [
      "Separate recon by owner or outsourced bookkeeper",
      "Camera on cash drawer close",
    ],
    linkedScenarioId: "sc-cash-sod-failure",
    linkedControlId: "c-cash",
  },
  {
    id: "rule-collect-post",
    a: "collect_cash",
    b: "post_payments",
    severity: "high",
    title: "Collect cash + post payments",
    why: "Opportunity to under-post or void after pocketing cash.",
    fraudPath: "Receive cash, post less or void later",
    compensatingDefaults: [
      "Daily drawer report vs PMS payment report to owner",
      "Void/adjustment reason codes required",
    ],
    linkedControlId: "c-cash",
  },
  {
    id: "rule-deposit-post",
    a: "prepare_deposit",
    b: "post_payments",
    severity: "high",
    title: "Deposit prep + payment posting",
    why: "Can alter posts to match a reduced deposit.",
    fraudPath: "Deposit short; books adjusted to match",
    compensatingDefaults: ["Independent deposit review", "Dual signature on deposit log"],
    linkedControlId: "c-sod-cash",
  },
  {
    id: "rule-writeoff",
    a: "approve_writeoffs",
    b: "post_adjustments",
    severity: "critical",
    title: "Approve + post write-offs",
    why: "Self-approved adjustments hide theft or favoritism.",
    fraudPath: "Write off friend/self balances or cover skim",
    compensatingDefaults: [
      "Owner approval above $150",
      "Monthly adjustment exception report",
    ],
    linkedScenarioId: "sc-writeoff-abuse",
    linkedControlId: "c-sod-billing",
  },
  {
    id: "rule-claims-writeoff",
    a: "submit_claims",
    b: "approve_writeoffs",
    severity: "high",
    title: "Claims submission + write-off authority",
    why: "Can suppress denials via write-offs without independent check.",
    fraudPath: "Write off denied claims instead of appealing; hide revenue loss",
    compensatingDefaults: ["Denial aging review by office manager", "Write-off threshold"],
    linkedScenarioId: "sc-writeoff-abuse",
    linkedControlId: "c-sod-billing",
  },
  {
    id: "rule-vendor-create-pay",
    a: "create_vendor",
    b: "release_payment",
    severity: "critical",
    title: "Create vendor + release payment",
    why: "Classic fictitious vendor scheme.",
    fraudPath: "Create fake lab/vendor; pay self",
    compensatingDefaults: [
      "Dual ACH release > $500",
      "Monthly new-vendor review by owner",
    ],
    linkedScenarioId: "sc-vendor-fraud",
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-vendor-create-approve",
    a: "create_vendor",
    b: "approve_vendor",
    severity: "high",
    title: "Create + approve vendor",
    why: "Self-approved master data enables fraudulent payees.",
    fraudPath: "Approve own fake vendor",
    compensatingDefaults: ["Owner signs new vendor form", "Bank dual control"],
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-vendor-approve-pay",
    a: "approve_vendor",
    b: "release_payment",
    severity: "medium",
    title: "Approve vendor + release payment",
    why: "Weakens independent check on payee legitimacy at payment time.",
    fraudPath: "Rush approval then immediate pay to collusive vendor",
    compensatingDefaults: ["Separate payment batch review", "Dollar thresholds"],
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-payroll",
    a: "enter_payroll",
    b: "approve_payroll",
    severity: "high",
    title: "Enter + approve payroll",
    why: "Can inflate hours/bonuses without independent approval.",
    fraudPath: "Ghost hours or self-bonus",
    compensatingDefaults: ["Owner always approves final file", "Exception report"],
    linkedControlId: "c-payroll",
  },
  {
    id: "rule-admin-pay",
    a: "pms_admin_roles",
    b: "post_payments",
    severity: "medium",
    title: "PMS admin + post payments",
    why: "Can grant self extra rights then conceal activity.",
    fraudPath: "Elevate privileges, alter audit trail",
    compensatingDefaults: ["Owner-only admin role", "Access change log review"],
  },
  {
    id: "rule-admin-writeoff",
    a: "pms_admin_roles",
    b: "post_adjustments",
    severity: "high",
    title: "PMS admin + post adjustments",
    why: "Admin can disable controls then write off balances.",
    fraudPath: "Bypass approval flags in PMS",
    compensatingDefaults: ["Separate admin account from daily billing login"],
    linkedControlId: "c-sod-billing",
  },
];

/** Family-level matrix: true = inherently conflicting when combined. */
export const FAMILY_CONFLICT_MATRIX: Record<
  DutyFamily,
  Partial<Record<DutyFamily, boolean>>
> = {
  authorization: { custody: true, recording: true, master_data: true },
  custody: {
    authorization: true,
    recording: true,
    reconciliation: true,
    master_data: true,
  },
  recording: {
    authorization: true,
    custody: true,
    reconciliation: true,
  },
  reconciliation: { custody: true, recording: true },
  master_data: { custody: true, authorization: true },
};
