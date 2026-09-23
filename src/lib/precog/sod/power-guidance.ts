import type { IndustryId } from "../industry";
import type { EntitlementId } from "./conflict-rules";

export interface PowerGuidance {
  purpose: string;
  evidence: string;
  boundary: string;
}

/** The nouns that differ by line of business in the guidance below. */
interface GuidanceWords {
  /** Who pays: "patient", "customer", "guest", "client". */
  payer: string;
  /** The system of record: "PMS", "POS", "billing system". */
  system: string;
  /** What receipts are applied to: "the correct ledger and encounter". */
  postingTarget: string;
  /** Who also pays, besides the payer, when there is someone: "patient and insurer". */
  receipts: string;
  /** Where credits and write-offs are recorded. */
  ledger: string;
  /** What a master record holds. */
  masterRecord: string;
  /** Which master-record changes need a log and a review. */
  sensitiveChanges: string;
  /** What bulk exports can carry. */
  exportData: string;
  /** Who approves a price change besides the owner. */
  feeApproval: string;
  /** The business, as the object of "commit the ... to". */
  business: string;
}

const WORDS: Record<IndustryId, GuidanceWords> = {
  dental: {
    payer: "patient",
    system: "PMS",
    postingTarget: "the correct ledger and encounter",
    receipts: "patient and insurer",
    ledger: "patient ledger",
    masterRecord: "patient identity, guarantor, coverage, and contact records",
    sensitiveChanges: "Sensitive identity and guarantor changes",
    exportData: "patient, clinical, or financial data",
    feeApproval: "clinical or owner approval",
    business: "practice",
  },
  retail: {
    payer: "customer",
    system: "POS",
    postingTarget: "the correct account and sale",
    receipts: "customer and card",
    ledger: "customer account",
    masterRecord: "customer identity, account, and contact records",
    sensitiveChanges: "Sensitive identity and account changes",
    exportData: "customer or financial data",
    feeApproval: "owner approval",
    business: "store",
  },
  restaurant: {
    payer: "guest",
    system: "POS",
    postingTarget: "the correct check and shift",
    receipts: "guest and card",
    ledger: "guest check or house account",
    masterRecord: "house-account identity, billing, and contact records",
    sensitiveChanges: "Sensitive identity and billing changes",
    exportData: "guest or financial data",
    feeApproval: "owner approval",
    business: "restaurant",
  },
  professional_services: {
    payer: "client",
    system: "billing system",
    postingTarget: "the correct invoice and matter",
    receipts: "client",
    ledger: "client ledger",
    masterRecord: "client identity, billing, and contact records",
    sensitiveChanges: "Sensitive identity and billing changes",
    exportData: "client or financial data",
    feeApproval: "partner or owner approval",
    business: "firm",
  },
  general: {
    payer: "customer",
    system: "accounting system",
    postingTarget: "the correct account and invoice",
    receipts: "customer",
    ledger: "customer account",
    masterRecord: "customer identity, billing, and contact records",
    sensitiveChanges: "Sensitive identity and billing changes",
    exportData: "customer or financial data",
    feeApproval: "owner approval",
    business: "business",
  },
};

function guidanceFor(w: GuidanceWords): Record<EntitlementId, PowerGuidance> {
  return {
    collect_cash: {
      purpose: `Accept ${w.payer} funds and operate the physical or virtual cash drawer.`,
      evidence: "Drawer closeout, merchant receipt, and daily collection log",
      boundary: "May collect funds; should not reconcile the bank account.",
    },
    post_payments: {
      purpose: `Apply ${w.receipts} receipts to ${w.postingTarget}.`,
      evidence: `${w.system} posting batch tied to remittance or receipt`,
      boundary: "May record receipts; should not independently prove the deposit cleared.",
    },
    prepare_deposit: {
      purpose: "Count, document, and deliver receipts for deposit.",
      evidence: "Signed deposit slip and daily batch total",
      boundary: "May prepare custody transfer; should not perform the final bank reconciliation.",
    },
    bank_reconcile: {
      purpose: `Independently match bank activity to ${w.system} and accounting records.`,
      evidence: "Dated reconciliation with reviewer sign-off",
      boundary: "Should not collect, deposit, or post the same receipts.",
    },
    approve_writeoffs: {
      purpose: "Authorize contractual or discretionary reductions to a balance.",
      evidence: "Approval linked to reason code and supporting policy",
      boundary: "May approve; should not also post the approved adjustment.",
    },
    post_adjustments: {
      purpose: `Record approved credits, write-offs, and corrections in the ${w.ledger}.`,
      evidence: "Adjustment report with approver and reason code",
      boundary: "May record; should not authorize or refund the resulting credit.",
    },
    submit_claims: {
      purpose: "Create, validate, and transmit claims and corrected claims.",
      evidence: "Claim batch, edit report, and transmission acceptance",
      boundary: "Submission does not include authority to approve unsupported write-offs.",
    },
    create_vendor: {
      purpose: "Create or change vendor identity, banking, tax, and payment details.",
      evidence: "Change request plus independent callback verification",
      boundary: "Should not approve the vendor or release its payments.",
    },
    approve_vendor: {
      purpose: "Authorize a new or changed supplier after due diligence.",
      evidence: "Approval record and validated vendor support",
      boundary: "Approval should be independent of vendor setup and payment release.",
    },
    release_payment: {
      purpose: "Execute the final release of an approved vendor payment.",
      evidence: "Bank or payment-platform release log",
      boundary: "Should not create the vendor, enter its invoice, or initiate the same payment.",
    },
    approve_payroll: {
      purpose: "Review and authorize the complete payroll before transmission.",
      evidence: "Payroll register and documented variance review",
      boundary: "Should be independent of employee master changes and payroll entry.",
    },
    edit_payroll_master: {
      purpose: "Add or remove employees and change pay rates, deductions, and deposit accounts.",
      evidence: "Payroll change report signed by someone who does not run payroll",
      boundary: "Should not enter hours or run the payroll the change feeds.",
    },
    post_journal_entries: {
      purpose: "Post manual entries that move balances outside the normal transaction flow.",
      evidence: "Entry log with support attached and a reviewer's initials",
      boundary: "Should not reconcile the bank account the entries adjust.",
    },
    enter_payroll: {
      purpose: "Enter hours, earnings, deductions, and approved exceptions.",
      evidence: "Input report tied to time and authorization records",
      boundary: "May prepare payroll; should not provide final approval.",
    },
    pms_admin_roles: {
      purpose: `Configure ${w.system} roles, permissions, and privileged settings.`,
      evidence: "Approved access ticket and role-change log",
      boundary: "Use named admin accounts; business users should not self-approve access.",
    },
    issue_refunds: {
      purpose: `Send an approved ${w.payer} credit back through an authorized channel.`,
      evidence: "Refund log, approval, and original-payment reference",
      boundary: "Should not create the credit or approve the refund.",
    },
    change_fee_schedule: {
      purpose: "Maintain standard fees, plan tables, and pricing rules.",
      evidence: "Approved change ticket and before/after report",
      boundary: `Changes require ${w.feeApproval} and retrospective review.`,
    },
    edit_patient_master: {
      purpose: `Maintain ${w.masterRecord}.`,
      evidence: `${w.system} audit trail and source documentation`,
      boundary: `${w.sensitiveChanges} should be logged and reviewed.`,
    },
    manage_user_access: {
      purpose: "Create, disable, and change workforce and vendor system accounts.",
      evidence: "Access ticket, approval, and periodic user listing",
      boundary: "Access administrators should not review their own activity logs.",
    },
    export_bulk_data: {
      purpose: `Extract ${w.exportData} outside normal screens.`,
      evidence: "Export log with purpose, approver, recipient, and disposition",
      boundary: "Use minimum necessary data, secure transfer, and time-limited access.",
    },
    order_supplies: {
      purpose: `Commit the ${w.business} to approved goods or services.`,
      evidence: "Purchase order or approved requisition",
      boundary: "The requester should not confirm receipt without independent evidence.",
    },
    receive_goods: {
      purpose: "Verify quantity, condition, and delivery of ordered goods or services.",
      evidence: "Packing slip or service acceptance record",
      boundary: "Receipt confirmation should be independent of ordering where practical.",
    },
    enter_invoices: {
      purpose: "Record supplier invoices accurately and prevent duplicates.",
      evidence: "Invoice image, PO/receipt match, and entry audit trail",
      boundary: "May enter invoices; should not release the resulting payment.",
    },
    initiate_ach: {
      purpose: "Create an electronic payment instruction in the banking platform.",
      evidence: "Initiation log tied to approved payment batch",
      boundary: "A different authorized person should release the instruction.",
    },
    sign_checks: {
      purpose: "Apply final signature or authorization to paper checks.",
      evidence: "Check register and signer evidence",
      boundary: "Signer should review support and not prepare the same disbursement.",
    },
    review_audit_logs: {
      purpose: "Independently inspect privileged, access, export, and configuration activity.",
      evidence: "Dated exception review with follow-up disposition",
      boundary: "Reviewer should not administer the accounts or logs under review.",
    },
    manage_backups: {
      purpose: "Configure, monitor, test, and recover protected backup copies.",
      evidence: "Backup status, restore-test result, and exception ticket",
      boundary: "Keep a separate immutable copy and independent failure alerts.",
    },
    view_reports_only: {
      purpose: "Read dashboards and reports without changing transactions or configuration.",
      evidence: "Read-only role assignment and periodic access review",
      boundary: "No create, edit, approve, export, or release capability.",
    },
  };
}

const BY_INDUSTRY = Object.fromEntries(
  Object.entries(WORDS).map(([id, words]) => [id, guidanceFor(words)]),
) as Record<IndustryId, Record<EntitlementId, PowerGuidance>>;

/**
 * Plain-language operating guidance for every power on the map, in the
 * business's own words: patients and the PMS for a dental or medical
 * office, guests and the POS for a restaurant, clients for a firm.
 */
export function powerGuidance(industry: IndustryId): Record<EntitlementId, PowerGuidance> {
  return BY_INDUSTRY[industry] ?? BY_INDUSTRY.general;
}

/**
 * The same guidance in wording that fits any business, for callers that do
 * not know the line of business.
 */
export const POWER_GUIDANCE: Record<EntitlementId, PowerGuidance> = BY_INDUSTRY.general;
