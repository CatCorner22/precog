import { industryNoun, type IndustryId } from "../industry";
import type { EntitlementId } from "./conflict-rules";

interface PowerGuidance {
  purpose: string;
  evidence: string;
  boundary: string;
}

/** The nouns that differ by line of business in the guidance below. */
export interface GuidanceWords {
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
  /** Which master-record changes need a log and a review, as in "every ... change". */
  sensitiveChange: string;
  /** What the business bills: "insurance claims", "invoices". */
  bills: string;
  /** The record that shows what was billed and corrected. */
  billsEvidence: string;
  /** The independent reader: "the owner", or a nonprofit's board treasurer. */
  overseer: string;
  /** The file that records payments received without keying them in. */
  paymentFile: string;
  /** What supports a write-off before it is approved. */
  writeoffSupport: string;
  /** The list of standard prices: "fee schedule", "price list". */
  priceList: string;
  /** What a price change affects, as in "work out ... before approving". */
  priceImpact: string;
  /** Who is told when a price change went wrong, as in "tell the ... and staff". */
  affected: string;
  /** What bulk exports can carry. */
  exportData: string;
  /** Who approves a price change besides the owner. */
  feeApproval: string;
}

const WORDS: Record<IndustryId, GuidanceWords> = {
  dental: {
    payer: "patient",
    system: "PMS",
    postingTarget: "the correct ledger and encounter",
    receipts: "patient and insurer",
    ledger: "patient ledger",
    masterRecord: "patient identity, guarantor, coverage, and contact records",
    sensitiveChange: "identity and guarantor",
    bills: "insurance claims",
    billsEvidence: "Claim batch, edit report, and the insurer's acceptance report",
    overseer: "the owner",
    paymentFile: "the bank file or the insurer's electronic remittance",
    writeoffSupport: "the clinical note or the insurer's explanation of benefits",
    priceList: "fee schedule",
    priceImpact: "the effect on patients and insurers",
    affected: "patients, insurers",
    exportData: "patient, clinical, or financial data",
    feeApproval: "clinical or owner approval",
  },
  retail: {
    payer: "customer",
    system: "POS",
    postingTarget: "the correct account and sale",
    receipts: "customer and card",
    ledger: "customer account",
    masterRecord: "customer identity, account, and contact records",
    sensitiveChange: "identity and account",
    bills: "invoices",
    billsEvidence: "Invoice register with every corrected or cancelled invoice",
    overseer: "the owner",
    paymentFile: "the bank or card-processor file",
    writeoffSupport: "the customer's agreement or the dispute record",
    priceList: "price list",
    priceImpact: "the effect on customers",
    affected: "customers",
    exportData: "customer or financial data",
    feeApproval: "owner approval",
  },
  restaurant: {
    payer: "guest",
    system: "POS",
    postingTarget: "the correct check and shift",
    receipts: "guest and card",
    ledger: "guest check or house account",
    masterRecord: "house-account identity, billing, and contact records",
    sensitiveChange: "identity and billing",
    bills: "invoices",
    billsEvidence: "Invoice register with every corrected or cancelled invoice",
    overseer: "the owner",
    paymentFile: "the bank or card-processor file",
    writeoffSupport: "the guest's agreement or the dispute record",
    priceList: "menu prices",
    priceImpact: "the effect on guests",
    affected: "guests",
    exportData: "guest or financial data",
    feeApproval: "owner approval",
  },
  professional_services: {
    payer: "client",
    system: "billing system",
    postingTarget: "the correct invoice and matter",
    receipts: "client",
    ledger: "client ledger",
    masterRecord: "client identity, billing, and contact records",
    sensitiveChange: "identity and billing",
    bills: "invoices",
    billsEvidence: "Invoice register with every corrected or cancelled invoice",
    overseer: "the owner",
    paymentFile: "the bank or payment-processor file",
    writeoffSupport: "the client's agreement or the engagement record",
    priceList: "rate card",
    priceImpact: "the effect on clients",
    affected: "clients",
    exportData: "client or financial data",
    feeApproval: "partner or owner approval",
  },
  construction: {
    payer: "client",
    system: "job-cost system",
    postingTarget: "the correct job and pay application",
    receipts: "client",
    ledger: "job receivable",
    masterRecord: "client, job, and contact records",
    sensitiveChange: "client and job billing",
    bills: "invoices and pay applications",
    billsEvidence: "Pay application log with every corrected or cancelled invoice",
    overseer: "the owner",
    paymentFile: "the bank or payment-processor file",
    writeoffSupport: "the signed change order or the client's agreement",
    priceList: "price list",
    priceImpact: "the effect on clients and open jobs",
    affected: "clients",
    exportData: "client, bid, or financial data",
    feeApproval: "owner approval",
  },
  automotive: {
    payer: "customer",
    system: "DMS",
    postingTarget: "the correct repair order, deal or schedule",
    receipts: "customer, warranty and lender",
    ledger: "customer account or deal",
    masterRecord: "customer identity, vehicle, lienholder, and contact records",
    sensitiveChange: "identity, lienholder, and payoff",
    bills: "repair orders and deal jackets",
    billsEvidence: "Repair-order and deal register with every voided or reopened record",
    overseer: "the dealer principal",
    paymentFile: "the bank, card-processor, or lender funding file",
    writeoffSupport: "the customer's agreement or the warranty claim's rejection notice",
    priceList: "labor rate and parts price list",
    priceImpact: "the effect on customers and open repair orders",
    affected: "customers",
    exportData: "customer, credit-application, or financial data",
    feeApproval: "dealer principal approval",
  },
  nonprofit: {
    payer: "donor",
    system: "donor database",
    postingTarget: "the correct donor record and fund",
    receipts: "donor and funder",
    ledger: "donor and pledge records",
    masterRecord: "donor identity, pledge, and contact records",
    sensitiveChange: "donor and pledge",
    bills: "invoices and grant reimbursement requests",
    billsEvidence: "Invoice and grant-request register with every correction",
    overseer: "the board treasurer",
    paymentFile: "the bank or donation-processor file",
    writeoffSupport: "the donor's letter or the board's approval",
    priceList: "fee schedule",
    priceImpact: "the effect on donors and program participants",
    affected: "donors, participants",
    exportData: "donor or financial data",
    feeApproval: "executive director or board approval",
  },
  general: {
    payer: "customer",
    system: "accounting system",
    postingTarget: "the correct account and invoice",
    receipts: "customer",
    ledger: "customer account",
    masterRecord: "customer identity, billing, and contact records",
    sensitiveChange: "identity and billing",
    bills: "invoices",
    billsEvidence: "Invoice register with every corrected or cancelled invoice",
    overseer: "the owner",
    paymentFile: "the bank or card-processor file",
    writeoffSupport: "the customer's agreement or the dispute record",
    priceList: "price list",
    priceImpact: "the effect on customers",
    affected: "customers",
    exportData: "customer or financial data",
    feeApproval: "owner approval",
  },
};

/** `business` is the industry's word for a business, as in "commit the practice to". */
function guidanceFor(w: GuidanceWords, business: string): Record<EntitlementId, PowerGuidance> {
  return {
    collect_cash: {
      purpose: `Accept ${w.payer} funds and operate the physical or virtual cash drawer.`,
      evidence: "Drawer closeout, merchant receipt, and daily collection log",
      boundary: "Collects funds. Does not reconcile the bank account.",
    },
    post_payments: {
      purpose: `Apply ${w.receipts} receipts to ${w.postingTarget}.`,
      evidence: `${w.system} posting batch tied to remittance or receipt`,
      boundary:
        "Records receipts. Does not confirm on the bank statement that the deposit cleared.",
    },
    prepare_deposit: {
      purpose: "Count, document, and deliver receipts for deposit.",
      evidence: "Signed deposit slip and daily batch total",
      boundary: "Prepares the deposit. Does not perform the bank reconciliation.",
    },
    bank_reconcile: {
      purpose: `Independently match bank activity to ${w.system} and accounting records.`,
      evidence: "Dated reconciliation with reviewer sign-off",
      boundary: "Collects, deposits and posts none of the receipts they reconcile.",
    },
    approve_writeoffs: {
      purpose: "Authorize contractual or discretionary reductions to a balance.",
      evidence: "Approval linked to reason code and supporting policy",
      boundary: "Approves write-offs. Does not also post them.",
    },
    post_adjustments: {
      purpose: `Record approved credits, write-offs, and corrections in the ${w.ledger}.`,
      evidence: "Adjustment report with approver and reason code",
      boundary:
        "Records credits and write-offs. Does not approve them or refund the resulting credit.",
    },
    submit_claims: {
      purpose: `Create, check, and send ${w.bills} and their corrections.`,
      evidence: w.billsEvidence,
      boundary: `Issues ${w.bills}. Does not approve writing off the ones that go unpaid.`,
    },
    create_vendor: {
      purpose: "Create or change vendor identity, banking, tax, and payment details.",
      evidence: "Change request plus independent callback verification",
      boundary: "Sets up suppliers. Does not approve them or release their payments.",
    },
    approve_vendor: {
      purpose: "Authorize a new or changed supplier after due diligence.",
      evidence: "Approval record and validated vendor support",
      boundary: "The approver neither sets up the supplier nor releases its payments.",
    },
    approve_invoices: {
      purpose: "Approve each supplier bill for payment against the order and the receipt.",
      evidence: "Approval on each bill, with the order and proof of receipt",
      boundary: "The approver neither enters the bill nor releases its payment.",
    },
    release_payment: {
      purpose: "Execute the final release of an approved vendor payment.",
      evidence: "Bank or payment-platform release log",
      boundary:
        "Releases payments. Does not set up the supplier, enter its bill, or initiate the same payment.",
    },
    approve_payroll: {
      purpose: "Review and authorize the complete payroll before transmission.",
      evidence: "Payroll register and documented variance review",
      boundary: "The approver neither changes employee records nor enters the payroll.",
    },
    edit_payroll_master: {
      purpose: "Add or remove employees and change pay rates, deductions, and deposit accounts.",
      evidence: "Payroll change report signed by someone who does not run payroll",
      boundary:
        "Changes employee records. Does not enter hours or run the payroll the change feeds.",
    },
    post_journal_entries: {
      purpose: "Post manual entries that move balances outside the normal transaction flow.",
      evidence: "Entry log with support attached and a reviewer's initials",
      boundary: "Posts journal entries. Does not reconcile the bank account the entries adjust.",
    },
    enter_payroll: {
      purpose: "Enter hours, earnings, deductions, and approved exceptions.",
      evidence: "Input report tied to time and authorization records",
      boundary: "Prepares payroll. Does not give the final approval.",
    },
    pms_admin_roles: {
      purpose: `Configure ${w.system} roles, permissions, and privileged settings.`,
      evidence: "Approved access ticket and role-change log",
      boundary:
        "Uses a named administrator sign-in, separate from their daily one. Nobody approves their own access.",
    },
    issue_refunds: {
      purpose: `Send an approved ${w.payer} credit back through an authorized channel.`,
      evidence: "Refund log, approval, and original-payment reference",
      boundary: "Sends refunds. Does not create the credit or approve the refund.",
    },
    change_fee_schedule: {
      purpose: "Maintain standard fees, plan tables, and pricing rules.",
      evidence: "Approved change ticket and before/after report",
      boundary: `Every change needs ${w.feeApproval} and a review afterwards.`,
    },
    edit_patient_master: {
      purpose: `Maintain ${w.masterRecord}.`,
      evidence: `${w.system} audit trail and source documentation`,
      boundary: `The system logs every ${w.sensitiveChange} change; ${w.overseer} reviews the log each month.`,
    },
    manage_user_access: {
      purpose: "Create, disable, and change workforce and vendor system accounts.",
      evidence: "Access ticket, approval, and periodic user listing",
      boundary: "Administers sign-ins. Does not review their own activity logs.",
    },
    export_bulk_data: {
      purpose: `Extract ${w.exportData} outside normal screens.`,
      evidence: "Export log with purpose, approver, recipient, and disposition",
      boundary:
        "Exports only the data the purpose needs, sends it securely, and has the access removed afterwards.",
    },
    order_supplies: {
      purpose: `Commit the ${business} to approved goods or services.`,
      evidence: "Purchase order or approved requisition",
      boundary: "Orders goods and services. Does not confirm their receipt.",
    },
    receive_goods: {
      purpose: "Verify quantity, condition, and delivery of ordered goods or services.",
      evidence: "Packing slip or service acceptance record",
      boundary: `The person who ordered does not confirm receipt. In a team too small for that, ${w.overseer} checks deliveries against orders each month.`,
    },
    enter_invoices: {
      purpose: "Record supplier invoices accurately and prevent duplicates.",
      evidence: "Invoice image, PO/receipt match, and entry audit trail",
      boundary: "Enters bills. Does not release their payment.",
    },
    initiate_ach: {
      purpose: "Create an electronic payment instruction in the banking platform.",
      evidence: "Initiation log tied to approved payment batch",
      boundary: "Sets up the electronic payment. Someone else approves its release.",
    },
    sign_checks: {
      purpose: "Apply final signature or authorization to paper checks.",
      evidence: "Check register and signer evidence",
      boundary: "Reads the support before signing. Does not prepare the same payment.",
    },
    review_audit_logs: {
      purpose: "Independently inspect privileged, access, export, and configuration activity.",
      evidence: "Dated exception review with follow-up disposition",
      boundary: "Reviews the logs. Does not administer the accounts or logs under review.",
    },
    manage_backups: {
      purpose: "Configure, monitor, test, and recover protected backup copies.",
      evidence: "Backup status, restore-test result, and exception ticket",
      boundary:
        "Keeps one copy nobody can change or delete, and sends failure alerts to someone else.",
    },
    hold_company_card: {
      purpose: `Buy approved goods and services for the ${business} on a company card or charge account.`,
      evidence: "Receipt and stated business purpose for every charge, matched to the statement",
      boundary:
        "Spends on the card. Does not review or code its statement, or approve the spending on it.",
    },
    review_card_statement: {
      purpose:
        "Read each card statement line against a receipt and a purpose, and code it into the books.",
      evidence: "Statement initialled line by line, with the receipts and any queried charge",
      boundary: "Holds no card on the account they review.",
    },
    approve_expenses: {
      purpose: "Approve expense claims, reimbursements, and card spending before anyone pays them.",
      evidence: "Approval on each claim, with the receipt and the purpose stated",
      boundary: "Approves no claim of their own and no statement of a card they hold.",
    },
    view_reports_only: {
      purpose: "Read dashboards and reports without changing transactions or configuration.",
      evidence: "Read-only role assignment and periodic access review",
      boundary: "Cannot create, edit, approve, export or release anything.",
    },
  };
}

const BY_INDUSTRY = Object.fromEntries(
  Object.entries(WORDS).map(([id, words]) => [
    id,
    guidanceFor(words, industryNoun(id as IndustryId)),
  ]),
) as Record<IndustryId, Record<EntitlementId, PowerGuidance>>;

/**
 * Plain-language operating guidance for every power on the map, in the
 * business's own words: patients and the PMS for a dental or medical
 * office, guests and the POS for a restaurant, clients for a firm.
 */
export function powerGuidance(industry: IndustryId): Record<EntitlementId, PowerGuidance> {
  return BY_INDUSTRY[industry] ?? BY_INDUSTRY.general;
}

/** The words the guidance uses for a line of business; the general wording for one it does not know. */
export function guidanceWords(industry: IndustryId): GuidanceWords {
  return WORDS[industry] ?? WORDS.general;
}
