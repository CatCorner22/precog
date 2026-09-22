import type { EntitlementId } from "./conflict-rules";

export type ControlMeasureCategory = "directive" | "preventive" | "detective" | "corrective";

export interface DutyControlMeasures {
  directive: string[];
  preventive: string[];
  detective: string[];
  corrective: string[];
}

const measures = (
  directive: string[],
  preventive: string[],
  detective: string[],
  corrective: string[],
): DutyControlMeasures => ({ directive, preventive, detective, corrective });

/**
 * Practical control-action catalog for every modeled duty. Each list includes
 * alternatives so a smaller practice can select a proportionate design rather
 * than treating one implementation as mandatory.
 */
export const DUTY_CONTROL_MEASURES: Record<EntitlementId, DutyControlMeasures> = {
  collect_cash: measures(
    [
      "Document cash-handling and drawer-close procedures",
      "Train collectors on receipts, shortages, and escalation",
    ],
    [
      "Use named drawers and sequential receipts",
      "Use cashless payment or two-person counts when feasible",
    ],
    [
      "Compare daily collections to PMS and merchant totals",
      "Perform surprise drawer counts and trend over/short activity",
    ],
    [
      "Investigate variances and document disposition",
      "Restrict drawer access and retrain or reassign after repeated exceptions",
    ],
  ),
  post_payments: measures(
    [
      "Define posting standards and approved reason codes",
      "Require remittance and batch-retention procedures",
    ],
    [
      "Restrict posting to named users and locked periods",
      "Import bank or ERA files instead of manual entry where available",
    ],
    [
      "Reconcile posting batches to receipts and remittances",
      "Review reversals, unapplied cash, and backdated postings",
    ],
    [
      "Correct misapplications through auditable reversals",
      "Escalate unexplained differences and refine posting rules",
    ],
  ),
  prepare_deposit: measures(
    [
      "Set same-day deposit and chain-of-custody requirements",
      "Define acceptable deposit evidence and delay escalation",
    ],
    [
      "Use tamper-evident bags and dual counts",
      "Use remote deposit or armored pickup as alternatives",
    ],
    [
      "Match validated deposits to daily closeouts",
      "Monitor missing, late, split, and altered deposits",
    ],
    [
      "Trace shortages and obtain independent sign-off",
      "Change custody arrangements after recurring exceptions",
    ],
  ),
  bank_reconcile: measures(
    [
      "Require timely, independent monthly reconciliation",
      "Define reconciling-item aging and approval standards",
    ],
    [
      "Provide read-only bank access to the reconciler",
      "Lock completed accounting periods and protect statements",
    ],
    [
      "Review outstanding items, transfers, and unusual payees",
      "Evidence owner or CPA review of each reconciliation",
    ],
    [
      "Resolve stale items and correct supported errors",
      "Escalate unexplained differences and suspend affected authority",
    ],
  ),
  approve_writeoffs: measures(
    [
      "Publish approval thresholds and reason-code policy",
      "Define prohibited and owner-only adjustment types",
    ],
    [
      "Use workflow approvals and amount limits",
      "Require clinical or payer support before approval",
    ],
    [
      "Review write-offs by user, provider, reason, and trend",
      "Sample approvals to source documents and contracts",
    ],
    [
      "Reverse unsupported write-offs and recover balances",
      "Revise limits or remove authority after policy breaches",
    ],
  ),
  post_adjustments: measures(
    [
      "Require documented approval before posting",
      "Standardize reason codes and supporting evidence",
    ],
    [
      "Separate posting from approval and refund release",
      "Limit users, amounts, dates, and available reason codes",
    ],
    [
      "Review daily adjustment and reversal reports",
      "Compare credits, refunds, and write-offs for unusual patterns",
    ],
    [
      "Reverse unsupported entries with an audit trail",
      "Escalate patterns and restrict posting access",
    ],
  ),
  submit_claims: measures(
    [
      "Maintain coding, documentation, and timely-filing standards",
      "Train staff on corrections and payer-specific rules",
    ],
    [
      "Use claim edits, required fields, and documented provider sign-off",
      "Restrict corrected-claim and override capability",
    ],
    [
      "Monitor rejection, denial, resubmission, and aging reports",
      "Audit samples to clinical documentation and fee schedules",
    ],
    [
      "Correct claims, refund overpayments, and disclose when required",
      "Remediate training, templates, or access after recurring errors",
    ],
  ),
  create_vendor: measures(
    [
      "Define vendor onboarding and change-verification policy",
      "Require tax, ownership, conflict, and banking documentation",
    ],
    [
      "Use independent callback verification and duplicate checks",
      "Separate vendor setup from approval and payment",
    ],
    [
      "Review vendor-change logs and employee-address matches",
      "Monitor dormant, duplicate, and one-time vendors",
    ],
    [
      "Freeze suspect vendors and reverse unauthorized changes",
      "Revalidate details and investigate related payments",
    ],
  ),
  approve_vendor: measures(
    [
      "Set due-diligence and conflict-disclosure requirements",
      "Define approval authority by vendor type and spend",
    ],
    [
      "Require verified onboarding evidence before activation",
      "Use secondary approval for related or high-risk vendors",
    ],
    [
      "Periodically recertify active vendors and conflicts",
      "Review approvals lacking tax, banking, or ownership support",
    ],
    [
      "Suspend or terminate unsupported vendors",
      "Recover improper payments and update approval criteria",
    ],
  ),
  release_payment: measures(
    [
      "Define payment-release limits, timing, and evidence",
      "Require exception escalation and prohibited-payment rules",
    ],
    [
      "Use bank-enforced dual release and positive pay",
      "Separate release from vendor, invoice, and ACH setup",
    ],
    [
      "Review released payments against approved batches",
      "Monitor new payees, round amounts, rush, and duplicate payments",
    ],
    [
      "Recall or stop unauthorized payments promptly",
      "Disable compromised credentials and investigate the payment chain",
    ],
  ),
  edit_payroll_master: measures(
    [
      "Require a signed form for every new hire, rate change, and deposit-account change",
      "Name who may change employee records and who may not",
    ],
    [
      "Restrict employee-record changes to a role that does not run payroll",
      "Have the payroll service confirm bank-account changes with the employee directly",
    ],
    [
      "Owner reads the payroll change report every cycle against the signed forms",
      "Compare the people paid against the people scheduled and the terminated list",
    ],
    [
      "Reverse unauthorized changes and recover any pay they produced",
      "Remove the access that allowed the change and record the review",
    ],
  ),
  post_journal_entries: measures(
    [
      "Define which entries need support and a second reviewer",
      "Prohibit entries that adjust cash or receivables without a stated reason",
    ],
    [
      "Restrict manual entries to a role that does not reconcile the bank",
      "Require support attached before an entry can post",
    ],
    [
      "Owner or outside accountant reads the manual-entry log each month",
      "Question every entry that changes cash, receivables, or a suspense account",
    ],
    [
      "Reverse unsupported entries and trace what they concealed",
      "Escalate any entry that adjusted cash to an independent review",
    ],
  ),
  enter_payroll: measures(
    [
      "Document payroll calendars, inputs, and exception evidence",
      "Define authorized earning, deduction, and override types",
    ],
    [
      "Import approved time records and restrict manual overrides",
      "Separate entry from employee-master changes and approval",
    ],
    [
      "Compare input reports to prior payroll and HR records",
      "Review manual checks, overrides, and unusual hours",
    ],
    [
      "Correct errors through documented off-cycle or next-cycle action",
      "Recover overpayments and remediate recurring input causes",
    ],
  ),
  approve_payroll: measures(
    [
      "Require pre-release register and variance review",
      "Set approval deadlines and backup approvers",
    ],
    [
      "Use independent final approval and bank limits",
      "Require separate approval for off-cycle or bonus payroll",
    ],
    [
      "Compare approved totals to bank debits and the general ledger",
      "Review headcount, net-pay, and bank-account changes",
    ],
    [
      "Stop or recall incorrect payroll where possible",
      "Document recovery, correction, and access changes",
    ],
  ),
  pms_admin_roles: measures(
    [
      "Maintain role standards, least-privilege rules, and admin procedures",
      "Require tickets, owners, expiry, and emergency-access rules",
    ],
    [
      "Use named admin accounts, MFA, and separate daily accounts",
      "Prevent self-approval and time-limit elevated access",
    ],
    [
      "Review role changes, privileged activity, and dormant admins",
      "Run periodic access certifications by system owners",
    ],
    [
      "Revoke excess access and rotate exposed credentials",
      "Investigate unauthorized changes and restore approved configuration",
    ],
  ),
  issue_refunds: measures(
    [
      "Define refund eligibility, thresholds, and required support",
      "Require original-payment-method and exception rules",
    ],
    [
      "Separate credit creation, approval, and refund release",
      "Use system limits and dual approval above threshold",
    ],
    [
      "Review refunds by user, patient, method, and frequency",
      "Reconcile refunds to credits, bank activity, and approvals",
    ],
    [
      "Cancel or recover unsupported refunds",
      "Restrict authority and investigate connected adjustments",
    ],
  ),
  change_fee_schedule: measures(
    [
      "Establish pricing ownership, effective dates, and approval policy",
      "Require payer and clinical impact assessment",
    ],
    [
      "Use controlled change tickets and limited configuration access",
      "Test changes in a nonproduction copy or peer review",
    ],
    [
      "Compare before/after fee tables and transaction impacts",
      "Review overrides and unexpected charge or reimbursement trends",
    ],
    [
      "Rollback incorrect rates and correct affected accounts",
      "Notify stakeholders and improve testing after errors",
    ],
  ),
  edit_patient_master: measures(
    [
      "Define identity, guarantor, coverage, and demographic change standards",
      "Train staff on minimum necessary access and verification",
    ],
    [
      "Require source documents for sensitive changes",
      "Use duplicate detection and restrict bulk or high-risk edits",
    ],
    [
      "Review audit logs for identity, guarantor, and banking changes",
      "Monitor duplicates, merges, and changes preceding refunds",
    ],
    [
      "Restore verified data and resolve duplicate records",
      "Investigate privacy impact and notify under applicable procedures",
    ],
  ),
  manage_user_access: measures(
    [
      "Maintain joiner-mover-leaver, least-privilege, and MFA standards",
      "Define privileged and emergency-access approval",
    ],
    [
      "Use HR-triggered provisioning and separate admin accounts",
      "Require owner approval and automatic expiry for elevated access",
    ],
    [
      "Certify users and privileges periodically",
      "Alert on admin grants, dormant accounts, and failed deprovisioning",
    ],
    [
      "Disable inappropriate access and rotate credentials",
      "Investigate activity performed during unauthorized access",
    ],
  ),
  export_bulk_data: measures(
    [
      "Define permitted export purposes, recipients, retention, and disposal",
      "Require minimum-necessary and privacy approval",
    ],
    [
      "Restrict export roles and use encrypted approved destinations",
      "Apply row limits, masking, or time-limited secure links",
    ],
    [
      "Log and alert on large, after-hours, or unusual exports",
      "Reconcile exports to approved requests and deletion attestations",
    ],
    [
      "Revoke links and contain unintended disclosure",
      "Assess impact, notify appropriately, and narrow future access",
    ],
  ),
  order_supplies: measures(
    [
      "Set purchasing thresholds, approved catalogs, and budget owners",
      "Require conflicts disclosure and competitive quotes where appropriate",
    ],
    [
      "Use approved requisitions, purchase orders, and spend limits",
      "Separate requester, receiver, and payment release",
    ],
    [
      "Review off-contract, split, rush, and personal-address orders",
      "Compare purchases to budgets, inventory, and usage",
    ],
    [
      "Cancel or return unauthorized orders",
      "Recover losses and adjust requester limits or suppliers",
    ],
  ),
  receive_goods: measures(
    [
      "Define inspection, evidence, shortage, and service-acceptance procedures",
      "Require prompt recording by an identified receiver",
    ],
    [
      "Separate receipt confirmation from ordering",
      "Use packing slips, counts, photos, or end-user confirmation",
    ],
    [
      "Match receipts to orders and invoices",
      "Review missing, partial, duplicate, and after-the-fact receipts",
    ],
    [
      "Reject, return, or dispute deficient deliveries",
      "Correct receipt records and investigate repeated mismatches",
    ],
  ),
  enter_invoices: measures(
    [
      "Define valid invoice support, coding, and duplicate policy",
      "Require PO and receipt matching or documented exception approval",
    ],
    [
      "Use duplicate detection and controlled vendor selection",
      "Separate invoice entry from payment release",
    ],
    [
      "Review duplicates, round-dollar entries, credits, and overrides",
      "Sample invoices to orders, receipts, and vendor statements",
    ],
    [
      "Reverse unsupported entries and request credits",
      "Block suspect invoices or vendors and remediate entry errors",
    ],
  ),
  initiate_ach: measures(
    [
      "Define authorized payment files, limits, and cutoff procedures",
      "Require verified instructions and exception escalation",
    ],
    [
      "Separate initiation from release and require MFA",
      "Use templates, allowlists, transaction limits, and dual control",
    ],
    [
      "Alert on new recipients, template changes, and unusual transfers",
      "Reconcile initiated files to approvals and bank confirmations",
    ],
    [
      "Recall transfers and contact the bank immediately",
      "Lock credentials, preserve evidence, and investigate compromise",
    ],
  ),
  sign_checks: measures(
    [
      "Set signature authority, thresholds, and support requirements",
      "Prohibit blank, pre-signed, and payable-to-cash checks",
    ],
    [
      "Secure check stock and separate preparation from signature",
      "Use dual signatures or bank positive pay as alternatives",
    ],
    [
      "Review check sequence, images, voids, and payee changes",
      "Reconcile cleared checks independently",
    ],
    [
      "Stop payment and replace compromised stock",
      "Recover unauthorized disbursements and revise signer access",
    ],
  ),
  review_audit_logs: measures(
    [
      "Define log sources, review frequency, ownership, and escalation",
      "Specify high-risk events and evidence retention",
    ],
    [
      "Protect logs from alteration and separate reviewer from administrator",
      "Send copies or alerts to an independent platform",
    ],
    [
      "Review privileged, access, export, and configuration events",
      "Track exceptions to closure and test log completeness",
    ],
    [
      "Contain suspicious accounts and preserve evidence",
      "Correct logging gaps and tune alerts after incidents",
    ],
  ),
  manage_backups: measures(
    [
      "Define recovery objectives, retention, scope, and test cadence",
      "Assign recovery ownership and failure escalation",
    ],
    [
      "Use encrypted, immutable, offline, or separately credentialed copies",
      "Apply MFA and least privilege to backup consoles",
    ],
    [
      "Monitor job success, coverage, age, and capacity",
      "Perform documented restore and disaster-recovery tests",
    ],
    [
      "Rerun failed jobs and restore clean data",
      "Investigate gaps, rotate credentials, and revise recovery design",
    ],
  ),
  view_reports_only: measures(
    [
      "Define approved reports, users, uses, and confidentiality",
      "Train viewers on minimum necessary handling",
    ],
    [
      "Use read-only roles, masking, and restricted downloads",
      "Provide scheduled reports instead of interactive access",
    ],
    [
      "Review report access, downloads, sharing, and dormant users",
      "Periodically certify continuing business need",
    ],
    [
      "Revoke unnecessary access and retrieve shared copies",
      "Investigate inappropriate disclosure and adjust report scope",
    ],
  ),
};
