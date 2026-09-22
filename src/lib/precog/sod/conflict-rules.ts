/**
 * SoD conflict rulebook for small dental practices.
 * Classic custody / authorization / recording / reconciliation pairs
 * plus dental-specific entitlement combinations.
 *
 * Educational control design — not a legal compliance product.
 */

export type DutyFamily =
  "authorization" | "custody" | "recording" | "reconciliation" | "master_data";

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
    label: "Take payment from customers",
    family: "custody",
    processIds: ["proc-cash"],
    riskWeight: 5,
  },
  {
    id: "post_payments",
    label: "Record payments received",
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
    label: "Reconcile the bank account",
    family: "reconciliation",
    processIds: ["proc-cash", "proc-ar"],
    riskWeight: 5,
  },
  {
    id: "approve_writeoffs",
    label: "Approve write-offs",
    family: "authorization",
    processIds: ["proc-ar", "proc-claims"],
    riskWeight: 5,
  },
  {
    id: "post_adjustments",
    label: "Enter write-offs",
    family: "recording",
    processIds: ["proc-ar", "proc-claims"],
    riskWeight: 4,
  },
  {
    id: "submit_claims",
    label: "Issue invoices or claims",
    family: "recording",
    processIds: ["proc-claims"],
    riskWeight: 3,
  },
  {
    id: "create_vendor",
    label: "Set up suppliers",
    family: "master_data",
    processIds: ["proc-ap"],
    riskWeight: 5,
  },
  {
    id: "approve_vendor",
    label: "Approve new suppliers",
    family: "authorization",
    processIds: ["proc-ap"],
    riskWeight: 4,
  },
  {
    id: "release_payment",
    label: "Release payments",
    family: "custody",
    processIds: ["proc-ap"],
    riskWeight: 5,
  },
  {
    id: "enter_payroll",
    label: "Enter payroll",
    family: "recording",
    processIds: ["proc-payroll"],
    riskWeight: 3,
  },
  {
    id: "approve_payroll",
    label: "Approve payroll",
    family: "authorization",
    processIds: ["proc-payroll"],
    riskWeight: 4,
  },
  {
    id: "pms_admin_roles",
    label: "Administer the system and its user roles",
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
  {
    id: "issue_refunds",
    label: "Issue patient refunds",
    family: "custody",
    processIds: ["proc-ar", "proc-cash"],
    riskWeight: 5,
  },
  {
    id: "change_fee_schedule",
    label: "Change fee schedules / pricing",
    family: "master_data",
    processIds: ["proc-ar", "proc-claims"],
    riskWeight: 4,
  },
  {
    id: "edit_patient_master",
    label: "Edit patient / guarantor master data",
    family: "master_data",
    processIds: ["proc-schedule", "proc-ar"],
    riskWeight: 3,
  },
  {
    id: "manage_user_access",
    label: "Create users / assign system access",
    family: "master_data",
    processIds: ["proc-schedule", "proc-claims"],
    riskWeight: 5,
  },
  {
    id: "export_bulk_data",
    label: "Export bulk patient / financial data",
    family: "custody",
    processIds: ["proc-ar", "proc-claims"],
    riskWeight: 4,
  },
  {
    id: "order_supplies",
    label: "Order supplies / services",
    family: "authorization",
    processIds: ["proc-ap", "proc-clinical"],
    riskWeight: 3,
  },
  {
    id: "receive_goods",
    label: "Confirm receipt of goods / services",
    family: "custody",
    processIds: ["proc-ap"],
    riskWeight: 3,
  },
  {
    id: "enter_invoices",
    label: "Enter invoices / bills",
    family: "recording",
    processIds: ["proc-ap"],
    riskWeight: 4,
  },
  {
    id: "initiate_ach",
    label: "Initiate ACH / electronic payment",
    family: "custody",
    processIds: ["proc-ap", "proc-payroll"],
    riskWeight: 5,
  },
  {
    id: "sign_checks",
    label: "Sign / release checks",
    family: "authorization",
    processIds: ["proc-ap", "proc-payroll"],
    riskWeight: 5,
  },
  {
    id: "review_audit_logs",
    label: "Review system audit / access logs",
    family: "reconciliation",
    processIds: ["proc-claims", "proc-ar"],
    riskWeight: 3,
  },
  {
    id: "manage_backups",
    label: "Manage backups / recovery settings",
    family: "custody",
    processIds: ["proc-clinical", "proc-claims"],
    riskWeight: 4,
  },
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
    compensatingDefaults: [
      "Separate backup console credentials",
      "Immutable/offline recovery copy",
    ],
  },
  {
    id: "rule-payments-adjust",
    a: "post_payments",
    b: "post_adjustments",
    severity: "high",
    title: "Payment posting + write-off entry",
    why: "The same person records what customers paid and can write off or credit what they still owe, so a payment that never reached the bank can be covered by an adjustment and the customer's account still looks settled.",
    fraudPath: "Take a payment, then post a write-off or credit so the balance closes without it",
    compensatingDefaults: [
      "Monthly report of every write-off and credit, by employee, read by the owner",
      "Adjustments above a set amount approved by a second person before posting",
    ],
    linkedControlId: "c-sod-cash",
  },
  {
    id: "rule-sign-rec",
    a: "sign_checks",
    b: "bank_reconcile",
    severity: "critical",
    title: "Check signing + bank reconciliation",
    why: "The same person signs or releases the checks and reconciles the account they clear through, so a check to themselves is approved and then confirmed by the same hand.",
    fraudPath: "Sign a check to yourself and reconcile the statement so nobody else sees it clear",
    compensatingDefaults: [
      "Owner opens the bank statement first and reads every cleared-check image",
      "Bank Positive Pay: only checks on the owner's list are paid",
    ],
    linkedControlId: "c-sod-cash",
  },
  {
    id: "rule-cash-rec",
    a: "post_payments",
    b: "bank_reconcile",
    severity: "critical",
    title: "Payment posting + bank reconciliation",
    why: "The same person records the money and checks whether it arrived, so a missing deposit can be papered over in the books and the check will still balance.",
    fraudPath: "Take cash, then adjust the books so the bank check still balances",
    compensatingDefaults: [
      "Owner checks the bank statement against the books every week, personally",
      "Two people count the deposit before it leaves",
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
    why: "Holding the cash and checking the bank account leaves nobody to notice a shortfall, because the only person who could compare the two is the person who caused it.",
    fraudPath: "Keep cash, then clear the discrepancy yourself",
    compensatingDefaults: [
      "The owner or an outside bookkeeper checks the bank account instead",
      "Camera covering the till at close",
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
    why: "Taking payment and recording it are the same act here, so the amount recorded can simply be smaller than the amount received, or cancelled afterwards.",
    fraudPath: "Take the payment, record less, or void it later",
    compensatingDefaults: [
      "Owner compares the till total against recorded payments daily",
      "Every void and adjustment must carry a stated reason",
    ],
    linkedControlId: "c-cash",
  },
  {
    id: "rule-deposit-post",
    a: "prepare_deposit",
    b: "post_payments",
    severity: "high",
    title: "Deposit prep + payment posting",
    why: "Whoever prepares the deposit can also change what the books say was received, so the two will always agree no matter what went in the bag.",
    fraudPath: "Bank less than was taken, then adjust the books to match",
    compensatingDefaults: ["Independent deposit review", "Dual signature on deposit log"],
    linkedControlId: "c-sod-cash",
  },
  {
    id: "rule-writeoff",
    a: "approve_writeoffs",
    b: "post_adjustments",
    severity: "critical",
    title: "Approve + post write-offs",
    why: "An adjustment that needs nobody else’s approval can erase a balance that was actually paid, and the payment goes with it.",
    fraudPath: "Write off a balance that was paid, and keep the payment",
    compensatingDefaults: [
      "Owner approves any write-off above the amount you set",
      "Monthly list of every write-off, reviewed by the owner",
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
    why: "Unpaid invoices and claims can be written off rather than chased, which hides lost revenue as though it were a routine adjustment.",
    fraudPath: "Write off unpaid claims instead of pursuing them, hiding the loss",
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
    why: "One person can invent a supplier and then pay it, and the payments look entirely ordinary in the accounts. Nothing in the books distinguishes an invented supplier from a real one.",
    fraudPath: "Set up a supplier that does not exist, then pay it",
    compensatingDefaults: [
      "A second person releases any electronic payment above the amount you set, using their own login",
      "Owner reviews every supplier added that month",
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
    why: "Adding a supplier and approving it are the same step, so nothing stands between an invented payee and the payment run.",
    fraudPath: "Approve a supplier you set up yourself",
    compensatingDefaults: ["Owner signs new vendor form", "Bank dual control"],
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-vendor-approve-pay",
    a: "approve_vendor",
    b: "release_payment",
    // Approving a supplier and paying it is the fictitious-vendor path in the
    // case library (Human First, Dartmouth, Brooklyn), so it ranks high.
    severity: "high",
    title: "Approve vendor + release payment",
    why: "The approval meant to confirm a supplier is real is given by the person releasing the money, which removes the only check on where it goes.",
    fraudPath: "Approve and pay in one motion, with no one else looking",
    compensatingDefaults: ["Separate payment batch review", "Dollar thresholds"],
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-payroll",
    a: "enter_payroll",
    b: "approve_payroll",
    severity: "high",
    title: "Enter + approve payroll",
    why: "Whoever runs payroll can change what payroll says, including their own pay. A Florida construction office manager raised her own weekly pay by $1,000, then $2,000; an Idaho district manager paid $685,376 to former employees whose records he reactivated. Both cases are in the library below.",
    fraudPath: "Add hours, a raise, or a reimbursement to your own pay",
    compensatingDefaults: ["Owner always approves final file", "Exception report"],
    linkedControlId: "c-payroll",
  },
  {
    id: "rule-admin-pay",
    a: "pms_admin_roles",
    b: "post_payments",
    severity: "medium",
    title: "PMS admin + post payments",
    why: "Whoever administers the system can give themselves any permission they lack, which makes every other restriction optional.",
    fraudPath: "Grant yourself the access you need, then clear the record of it",
    compensatingDefaults: ["Owner-only admin role", "Access change log review"],
  },
  {
    id: "rule-admin-writeoff",
    a: "pms_admin_roles",
    b: "post_adjustments",
    severity: "high",
    title: "PMS admin + post adjustments",
    why: "System administration plus write-off authority means the approval requirement itself can be switched off before it is used.",
    fraudPath: "Turn off the approval requirement, then write the balance off",
    compensatingDefaults: ["Separate admin account from daily billing login"],
    linkedControlId: "c-sod-billing",
  },
];

/** Family-level matrix: true = inherently conflicting when combined. */
export const FAMILY_CONFLICT_MATRIX: Record<DutyFamily, Partial<Record<DutyFamily, boolean>>> = {
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
