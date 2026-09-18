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
];

/**
 * Incompatible pairs — the core of automated conflict detection.
 * Symmetric: engine treats (a,b) same as (b,a).
 */
export const CONFLICT_RULES: ConflictRule[] = [
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
      "Owner approves any write-off above $150",
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
    why: "One person can invent a supplier and then pay it. This is the most common way money leaves a small business, and the payments look entirely ordinary in the accounts.",
    fraudPath: "Set up a supplier that does not exist, then pay it",
    compensatingDefaults: [
      "A second person releases any electronic payment above $500, using their own login",
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
    severity: "medium",
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
    why: "Whoever runs payroll can change what payroll says, including their own pay. Two cases in this application’s library ran on exactly that.",
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
