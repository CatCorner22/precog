import type { EntitlementId } from "./conflict-rules";

export interface PowerGuidance {
  purpose: string;
  evidence: string;
  boundary: string;
}

/** Plain-language operating guidance for every power represented by the map. */
export const POWER_GUIDANCE: Record<EntitlementId, PowerGuidance> = {
  collect_cash: { purpose: "Accept patient funds and operate the physical or virtual cash drawer.", evidence: "Drawer closeout, merchant receipt, and daily collection log", boundary: "May collect funds; should not reconcile the bank account." },
  post_payments: { purpose: "Apply patient and insurer receipts to the correct ledger and encounter.", evidence: "PMS posting batch tied to remittance or receipt", boundary: "May record receipts; should not independently prove the deposit cleared." },
  prepare_deposit: { purpose: "Count, document, and deliver receipts for deposit.", evidence: "Signed deposit slip and daily batch total", boundary: "May prepare custody transfer; should not perform the final bank reconciliation." },
  bank_reconcile: { purpose: "Independently match bank activity to PMS and accounting records.", evidence: "Dated reconciliation with reviewer sign-off", boundary: "Should not collect, deposit, or post the same receipts." },
  approve_writeoffs: { purpose: "Authorize contractual or discretionary reductions to a balance.", evidence: "Approval linked to reason code and supporting policy", boundary: "May approve; should not also post the approved adjustment." },
  post_adjustments: { purpose: "Record approved credits, write-offs, and corrections in the patient ledger.", evidence: "Adjustment report with approver and reason code", boundary: "May record; should not authorize or refund the resulting credit." },
  submit_claims: { purpose: "Create, validate, and transmit claims and corrected claims.", evidence: "Claim batch, edit report, and transmission acceptance", boundary: "Submission does not include authority to approve unsupported write-offs." },
  create_vendor: { purpose: "Create or change vendor identity, banking, tax, and payment details.", evidence: "Change request plus independent callback verification", boundary: "Should not approve the vendor or release its payments." },
  approve_vendor: { purpose: "Authorize a new or changed supplier after due diligence.", evidence: "Approval record and validated vendor support", boundary: "Approval should be independent of vendor setup and payment release." },
  release_payment: { purpose: "Execute the final release of an approved vendor payment.", evidence: "Bank or payment-platform release log", boundary: "Should not create the vendor, enter its invoice, or initiate the same payment." },
  approve_payroll: { purpose: "Review and authorize the complete payroll before transmission.", evidence: "Payroll register and documented variance review", boundary: "Should be independent of employee master changes and payroll entry." },
  enter_payroll: { purpose: "Enter hours, earnings, deductions, and approved exceptions.", evidence: "Input report tied to time and authorization records", boundary: "May prepare payroll; should not provide final approval." },
  pms_admin_roles: { purpose: "Configure PMS roles, permissions, and privileged settings.", evidence: "Approved access ticket and role-change log", boundary: "Use named admin accounts; business users should not self-approve access." },
  issue_refunds: { purpose: "Send an approved patient credit back through an authorized channel.", evidence: "Refund log, approval, and original-payment reference", boundary: "Should not create the credit or approve the refund." },
  change_fee_schedule: { purpose: "Maintain standard fees, plan tables, and pricing rules.", evidence: "Approved change ticket and before/after report", boundary: "Changes require clinical or owner approval and retrospective review." },
  edit_patient_master: { purpose: "Maintain patient identity, guarantor, coverage, and contact records.", evidence: "PMS audit trail and source documentation", boundary: "Sensitive identity and guarantor changes should be logged and reviewed." },
  manage_user_access: { purpose: "Create, disable, and change workforce and vendor system accounts.", evidence: "Access ticket, approval, and periodic user listing", boundary: "Access administrators should not review their own activity logs." },
  export_bulk_data: { purpose: "Extract patient, clinical, or financial data outside normal screens.", evidence: "Export log with purpose, approver, recipient, and disposition", boundary: "Use minimum necessary data, secure transfer, and time-limited access." },
  order_supplies: { purpose: "Commit the practice to approved goods or services.", evidence: "Purchase order or approved requisition", boundary: "The requester should not confirm receipt without independent evidence." },
  receive_goods: { purpose: "Verify quantity, condition, and delivery of ordered goods or services.", evidence: "Packing slip or service acceptance record", boundary: "Receipt confirmation should be independent of ordering where practical." },
  enter_invoices: { purpose: "Record supplier invoices accurately and prevent duplicates.", evidence: "Invoice image, PO/receipt match, and entry audit trail", boundary: "May enter invoices; should not release the resulting payment." },
  initiate_ach: { purpose: "Create an electronic payment instruction in the banking platform.", evidence: "Initiation log tied to approved payment batch", boundary: "A different authorized person should release the instruction." },
  sign_checks: { purpose: "Apply final signature or authorization to paper checks.", evidence: "Check register and signer evidence", boundary: "Signer should review support and not prepare the same disbursement." },
  review_audit_logs: { purpose: "Independently inspect privileged, access, export, and configuration activity.", evidence: "Dated exception review with follow-up disposition", boundary: "Reviewer should not administer the accounts or logs under review." },
  manage_backups: { purpose: "Configure, monitor, test, and recover protected backup copies.", evidence: "Backup status, restore-test result, and exception ticket", boundary: "Keep a separate immutable copy and independent failure alerts." },
  view_reports_only: { purpose: "Read dashboards and reports without changing transactions or configuration.", evidence: "Read-only role assignment and periodic access review", boundary: "No create, edit, approve, export, or release capability." },
};
