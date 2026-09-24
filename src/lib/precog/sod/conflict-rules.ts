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
  | "approve_invoices"
  | "release_payment"
  | "approve_payroll"
  | "enter_payroll"
  | "edit_payroll_master"
  | "post_journal_entries"
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
  /**
   * A control step many small businesses do not have. Nobody holding it is
   * a choice, not a gap: coverage leaves it out until someone holds it.
   */
  optional?: boolean;
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
    label: "Approve write-offs and voids",
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
    // The second person on a bill: they check the bill against what was
    // ordered and received before anyone pays it.
    id: "approve_invoices",
    label: "Approve bills for payment",
    family: "authorization",
    processIds: ["proc-ap"],
    riskWeight: 4,
    optional: true,
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
    id: "edit_payroll_master",
    label: "Add employees or change pay rates and bank details",
    family: "master_data",
    processIds: ["proc-payroll"],
    riskWeight: 4,
  },
  {
    id: "post_journal_entries",
    label: "Post manual journal entries",
    family: "recording",
    processIds: ["proc-cash", "proc-ar"],
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
    label: "Issue customer refunds",
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
    label: "Edit customer master records",
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
    label: "Export customer or financial data in bulk",
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
    compensatingDefaults: [
      "Someone who enters no bills approves each one before it is paid (record them as approving bills for payment)",
      "Dual release above threshold",
    ],
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-invoice-approve",
    a: "enter_invoices",
    b: "approve_invoices",
    severity: "high",
    title: "Bill entry + bill approval",
    why: "The person who enters a bill also approves it for payment, so a false or inflated bill needs nobody else's sign-off.",
    fraudPath:
      "Enter a bill from a shell or friendly supplier, approve it, and let the payment run pay it",
    compensatingDefaults: [
      "Someone who enters no bills approves each one before payment",
      "Owner compares the paid-bills list with supplier statements monthly",
    ],
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
    id: "rule-release-rec",
    a: "release_payment",
    b: "bank_reconcile",
    severity: "critical",
    title: "Payment release + bank reconciliation",
    why: "The person who sends the money out also produces the record that proves it went where it should. A transfer to their own account, or to a payee they invented, is reconciled by the same hands, and the one check that compares the books with the bank is done by the one person with a reason to make them agree.",
    fraudPath:
      "Pay yourself or an invented payee by ACH or card, then reconcile the statement so nobody else sees where it went",
    compensatingDefaults: [
      "Owner opens the bank statement first and questions every payee they do not know",
      "Someone who releases no payments reconciles the account each month",
    ],
    linkedControlId: "c-sod-cash",
  },
  {
    id: "rule-release-je",
    a: "release_payment",
    b: "post_journal_entries",
    severity: "critical",
    title: "Payment release + manual journal entries",
    why: "The person who sends money out can also post the journal entry that explains it, so a transfer to their own account is booked as an expense or buried in a balance-sheet account and the books still balance. A dealership office manager who wired himself $1.4 million over 14 years, and a practice office manager who moved payments to her own card, each covered it with false journal entries; both are in the library below.",
    fraudPath:
      "Send a payment to yourself, then post a journal entry that makes the books balance around it",
    compensatingDefaults: [
      "Owner opens the bank statement first and questions every payee they do not know",
      "An outside accountant reviews manual journal entries and asks for support for each one",
    ],
    linkedControlId: "c-sod-cash",
  },
  {
    id: "rule-payroll-master-release",
    a: "edit_payroll_master",
    b: "release_payment",
    severity: "high",
    title: "Change employee records + release payments",
    why: "The person who can add an employee or change a bank account on the payroll file can also send payments, so a ghost employee or a redirected paycheck is set up and then paid by the same hands without passing anyone else.",
    fraudPath: "Add a ghost employee or change a pay account to your own, then release the payment",
    compensatingDefaults: [
      "Owner reads the payroll register each cycle against who actually works there",
      "A new employee or a changed bank account needs a second person's approval before the next pay run",
    ],
    linkedControlId: "c-payroll",
  },
  {
    id: "rule-payroll-release",
    a: "enter_payroll",
    b: "release_payment",
    severity: "high",
    title: "Payroll entry + payment release",
    why: "Whoever enters the hours and pay rates also sends the pay run to the bank or prints the checks, so an extra check to themselves, a raised rate, or a pay line for someone who has left is paid without a second person seeing the register.",
    fraudPath:
      "Add a pay line or a paper check for yourself and release it with the rest of the run",
    compensatingDefaults: [
      "Owner reads the payroll register each cycle before the run is released",
      "Owner compares the payroll register with the bank's cleared payments and headcount",
    ],
    linkedControlId: "c-payroll",
  },
  {
    id: "rule-payroll-rec",
    a: "enter_payroll",
    b: "bank_reconcile",
    severity: "high",
    title: "Payroll entry + bank reconciliation",
    why: "The person who runs payroll also reconciles the account it pays from, so a payroll payment that should not exist is matched off by the same hands and never reaches anyone who would ask who it was for.",
    fraudPath:
      "Pay yourself through payroll, then reconcile the account so the extra payment looks like any other pay run",
    compensatingDefaults: [
      "Owner reads the payroll register each cycle and compares it with the bank's payroll debits",
      "Someone who enters no payroll reconciles the account each month",
    ],
    linkedControlId: "c-payroll",
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
    id: "rule-je-rec",
    a: "post_journal_entries",
    b: "bank_reconcile",
    severity: "critical",
    title: "Manual journal entries + bank reconciliation",
    why: "A journal entry can make the books agree with any bank balance. When the person who reconciles the account can also post entries, a missing deposit or an unexplained wire is written away rather than found. A Granger, Iowa dealership office manager wired $1.4 million to himself over 14 years and balanced the books with journal entries; an Indiana business's accountant who reconciled the bank himself recorded his transfers to himself as invoice payments. Both cases are in the library below.",
    fraudPath: "Take the money, then post an entry that makes the reconciliation tie",
    compensatingDefaults: [
      "Owner or outside accountant reviews every manual journal entry each month with its support",
      "Owner opens the bank statement first",
    ],
    linkedControlId: "c-sod-cash",
  },
  {
    id: "rule-payroll-master-run",
    a: "edit_payroll_master",
    b: "enter_payroll",
    severity: "high",
    title: "Change employee records + run payroll",
    why: "Whoever can add a name, change a pay rate, or change a bank account and also run the payroll can pay anyone they invent. An Idaho district manager reactivated departed employees' records and entered their hours for three years; a St. Louis warehouse supervisor kept a person who never worked there on payroll for six and a half years. Both cases are in the library below.",
    fraudPath:
      "Reactivate a former employee, point the deposit at your own account, enter the hours",
    compensatingDefaults: [
      "Owner reads the new-hire, rate-change, and bank-change report every payroll",
      "Owner compares the people paid against the people scheduled",
    ],
    linkedControlId: "c-payroll",
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
    id: "rule-collect-adjust",
    a: "collect_cash",
    b: "post_adjustments",
    severity: "high",
    title: "Collect cash + enter write-offs",
    why: "The person who takes the customer's money can also void the sale, edit the payment record, or write the balance off, so a payment kept at the counter leaves behind a record that says nothing was owed. A counter clerk who entered voids and no-sales, a dental employee who edited payment records in the billing software, and a dealership office manager who falsified transaction entries are all in the library below.",
    fraudPath:
      "Take the payment, then post a void, credit, or write-off so the account closes without it",
    compensatingDefaults: [
      "Owner reads a monthly list of every void, credit, and write-off, by employee",
      "A second person approves any void or write-off above a set amount before it posts",
    ],
    linkedControlId: "c-sod-billing",
  },
  {
    id: "rule-cash-void",
    a: "collect_cash",
    b: "approve_writeoffs",
    severity: "high",
    title: "Take payments + approve voids or write-offs",
    why: "The person who takes the money can also approve the void, comp or write-off that cancels the record of taking it, so a payment kept from the till or the deposit leaves no balance behind and needs nobody else's sign-off. A counter clerk who turned sales into voids and no-sales is in the library below.",
    fraudPath:
      "Take the payment, then approve a void or write-off so the sale or the balance disappears",
    compensatingDefaults: [
      "Owner reads a weekly list of voids, comps and write-offs by employee",
      "Voids above a small amount need a second person's code at the time",
    ],
    linkedControlId: "c-cash",
  },
  {
    id: "rule-cash-admin",
    a: "collect_cash",
    b: "pms_admin_roles",
    severity: "high",
    title: "Take payments + administer the system",
    why: "The person who takes payments can also change the system that records them: delete a payment, edit a receipt, or change who may do either, so money kept at the counter leaves no record behind. A director who collects tuition, banks it and runs the tuition system holds exactly this pair.",
    fraudPath: "Keep a payment, then delete or rewrite its record with administrator rights",
    compensatingDefaults: [
      "Administrator rights sit with the owner or an outside IT provider, not with anyone who takes payments",
      "Owner reads the system's report of deleted and edited payments each month",
    ],
    linkedControlId: "c-cash",
  },
  {
    id: "rule-access-release",
    a: "manage_user_access",
    b: "release_payment",
    severity: "high",
    title: "Control logins + release payments",
    why: "The person who decides who can log in to the payment or banking system can also send payments, so they can create or borrow a second approver's login and release a payment that dual release was meant to stop.",
    fraudPath:
      "Give yourself a second approver's login, then release a payment with both approvals",
    compensatingDefaults: [
      "Access to the bank and payment systems is managed by the owner, not by anyone who releases payments",
      "The bank alerts the owner to every new user or permission change",
    ],
    linkedControlId: "c-sod-ap",
  },
  {
    id: "rule-cash-refund",
    a: "collect_cash",
    b: "issue_refunds",
    severity: "high",
    title: "Take payments + issue refunds",
    why: "The person at the till can refund a sale that never happened, or refund a real one to their own card, and the refund reads as ordinary customer service. Refunds with no sale behind them, sent to the refunder's own cards, are in the library below.",
    fraudPath: "Issue a refund with no sale behind it, to cash or to your own card",
    compensatingDefaults: [
      "Refunds only to the card or account that paid, with the original sale attached",
      "Owner reads a monthly list of refunds by employee and by destination card",
    ],
    linkedControlId: "c-cash",
  },
  {
    id: "rule-refund-post",
    a: "issue_refunds",
    b: "post_payments",
    severity: "high",
    title: "Issue refunds + record payments",
    why: "The person who records what customers paid can also send money back to them, so a refund can go out against a payment that was never received, or against a balance recorded as overpaid, and the account still looks settled.",
    fraudPath: "Record a credit or overpayment on an account, then refund it to yourself",
    compensatingDefaults: [
      "A second person approves each refund before it is paid, with the original payment attached",
      "Owner reads a monthly list of refunds by employee and by destination",
    ],
    linkedControlId: "c-sod-billing",
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
    // case library (a Denny's franchise, a Jersey City condominium, a Brooklyn
    // nonprofit), so it ranks high.
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
    title: "System administration + post payments",
    why: "Whoever administers the system can give themselves any permission they lack, which makes every other restriction optional.",
    fraudPath: "Grant yourself the access you need, then clear the record of it",
    compensatingDefaults: ["Owner-only admin role", "Access change log review"],
  },
  {
    id: "rule-admin-writeoff",
    a: "pms_admin_roles",
    b: "post_adjustments",
    severity: "high",
    title: "System administration + post adjustments",
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
