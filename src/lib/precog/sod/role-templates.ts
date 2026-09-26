import { dentalTemplate } from "../templates/dental";
import type { EntitlementId } from "./conflict-rules";

/**
 * The duties a job title usually carries when a template names no
 * `roleTemplates` entry for it and the person carries no duties of their own.
 * A business's own template and the job catalog (onboarding/) come first, so
 * this is the fallback of last resort. The dental sample's titles come from
 * the dental template itself, so one title never means two duty lists; the
 * rest are common office seats no sample names.
 */
export const ROLE_TEMPLATES: Record<string, EntitlementId[]> = {
  ...dentalTemplate.roleTemplates,
  "Associate Dentist": ["approve_writeoffs", "view_reports_only"],
  "Practice Administrator": [
    "approve_vendor",
    "approve_payroll",
    "approve_writeoffs",
    "view_reports_only",
    "review_audit_logs",
  ],
  Receptionist: ["collect_cash", "post_payments", "edit_patient_master", "view_reports_only"],
  "Treatment Coordinator": ["edit_patient_master", "post_adjustments", "view_reports_only"],
  "Insurance Coordinator": [
    "submit_claims",
    "post_adjustments",
    "post_payments",
    "view_reports_only",
  ],
  Bookkeeper: [
    "enter_invoices",
    "post_payments",
    "bank_reconcile",
    "enter_payroll",
    "view_reports_only",
  ],
  "CPA / Independent Reviewer": ["bank_reconcile", "review_audit_logs", "view_reports_only"],
  "Payroll Coordinator": ["enter_payroll", "view_reports_only"],
  "Procurement Coordinator": [
    "order_supplies",
    "receive_goods",
    "enter_invoices",
    "view_reports_only",
  ],
  "IT Administrator": [
    "pms_admin_roles",
    "manage_user_access",
    "manage_backups",
    "view_reports_only",
  ],
  "Clinical Lead": ["order_supplies", "receive_goods", "view_reports_only"],
  "External Billing Service": [
    "submit_claims",
    "post_adjustments",
    "post_payments",
    "export_bulk_data",
    "view_reports_only",
  ],
  "AP Specialist": ["create_vendor", "enter_invoices", "initiate_ach", "view_reports_only"],
  "Payment Approver": ["approve_vendor", "release_payment", "sign_checks", "view_reports_only"],
};
