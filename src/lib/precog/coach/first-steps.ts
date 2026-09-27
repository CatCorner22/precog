import type { ControlDefinition, ControlId } from "../evidence/controls";
import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import type { DetectedConflict } from "../sod/detect";
import { midSentence } from "../text";

/**
 * The duties each catalog control polices: a control answers an open finding
 * when it watches either duty of the finding's pair. Controls that apply to
 * everyone regardless of duties (background checks, time away) or that watch
 * a pattern rather than a duty (comparing locations) answer no finding; they
 * still appear, after the ones that do. "Split one duty out" watches every
 * duty (UNIVERSAL_FIX): moving one duty of any pair closes it.
 */
const ALL_DUTIES: EntitlementId[] = ENTITLEMENTS.map((e) => e.id);

/**
 * The one control that answers every open finding, because moving either duty
 * of any pair closes it. It therefore leads or ties the ranking on every
 * business with a finding, by design: it is the fix Start here names first.
 */
export const UNIVERSAL_FIX = "split-one-duty-out" satisfies ControlId;

export const CONTROL_DUTIES: Record<ControlId, readonly EntitlementId[]> = {
  "owner-opens-bank-statement": [
    "release_payment",
    "sign_checks",
    "initiate_ach",
    "create_vendor",
    "enter_invoices",
    "prepare_deposit",
    "bank_reconcile",
  ],
  "independent-bank-reconciliation": [
    "bank_reconcile",
    "prepare_deposit",
    "collect_cash",
    "post_payments",
    "release_payment",
    "post_journal_entries",
  ],
  "positive-pay": ["sign_checks", "release_payment"],
  "payroll-register-review": ["enter_payroll", "approve_payroll", "edit_payroll_master"],
  "no-self-approval": [
    "approve_writeoffs",
    "approve_payroll",
    "approve_vendor",
    "approve_expenses",
    "post_adjustments",
  ],
  "electronic-remittance": ["collect_cash", "post_payments", "prepare_deposit"],
  "expected-receipts-vs-deposits": [
    "collect_cash",
    "post_payments",
    "prepare_deposit",
    "submit_claims",
  ],
  "new-payee-review": ["create_vendor", "approve_vendor", "release_payment", "enter_invoices"],
  "new-payee-second-approval": ["create_vendor", "approve_vendor"],
  "bank-alerts-on-payee-change": ["create_vendor", "release_payment", "initiate_ach"],
  "dual-release-above-threshold": ["release_payment", "initiate_ach", "sign_checks"],
  "card-statement-line-review": ["hold_company_card", "review_card_statement"],
  "receipt-and-second-approval": ["approve_expenses", "hold_company_card"],
  "adjustments-report-by-employee": [
    "post_adjustments",
    "approve_writeoffs",
    "issue_refunds",
    "post_payments",
  ],
  [UNIVERSAL_FIX]: ALL_DUTIES,
  "permission-review": ["manage_user_access", "pms_admin_roles", "export_bulk_data"],
  "log-payments-at-the-mail": ["collect_cash", "post_payments", "prepare_deposit"],
  "independent-financial-review": ["post_journal_entries", "bank_reconcile"],
  "verify-oversight-is-real": [
    "approve_vendor",
    "approve_invoices",
    "approve_payroll",
    "approve_writeoffs",
    "approve_expenses",
    "bank_reconcile",
    "review_card_statement",
  ],
  "billing-matches-the-schedule": ["submit_claims", "change_fee_schedule"],
  "compare-across-locations": [],
  "volume-vs-recorded-sales": ["collect_cash", "post_payments", "issue_refunds", "receive_goods"],
  "payee-account-not-an-employee": ["create_vendor", "edit_payroll_master", "release_payment"],
  "confirm-remittance-account": ["collect_cash", "post_payments"],
  "terminated-staff-vs-payroll": ["edit_payroll_master", "enter_payroll"],
  "gift-card-purchases-controlled": ["hold_company_card"],
  "background-check-money-handlers": [],
  "mandatory-time-away": [],
  "count-inventory-independently": ["order_supplies", "receive_goods"],
  "controlled-substance-count": ["order_supplies", "receive_goods"],
  "no-shared-logins": ["manage_user_access", "pms_admin_roles"],
  "recovery-copy-out-of-reach": ["manage_backups"],
  "payroll-tax-remittance-verified": ["enter_payroll", "approve_payroll", "release_payment"],
  "same-day-access-removal": ["manage_user_access"],
  "check-stock-custody": ["sign_checks", "release_payment"],
  "void-refund-second-approval": ["issue_refunds", "post_adjustments", "approve_writeoffs"],
};

/** An open finding as the ranking needs it: its rule and the two duties it pairs. */
export type OpenFinding = Pick<DetectedConflict, "ruleId" | "entitlementA" | "entitlementB">;

/** How many of the open findings (distinct rules) a control answers. */
export function findingsAnswered(control: ControlId, findings: readonly OpenFinding[]): number {
  const duties = new Set(CONTROL_DUTIES[control]);
  const rules = new Set<string>();
  for (const f of findings) {
    if (duties.has(f.entitlementA) || duties.has(f.entitlementB)) rules.add(f.ruleId);
  }
  return rules.size;
}

/**
 * "Do these first", ranked for this business: first by how many of its open
 * findings each control answers, then by how many of the matching prosecuted
 * cases it would plausibly have caught, then by name. A control counted across
 * the whole case pool (a company-card review, say) no longer leads a list for
 * a team with no card finding. UNIVERSAL_FIX answers every finding, so it
 * leads or ties whenever it is in the list.
 */
export function rankFirstSteps<
  T extends { control: ControlDefinition; supportingCaseIds: readonly string[] },
>(steps: readonly T[], findings: readonly OpenFinding[]): (T & { answers: number })[] {
  return steps
    .map((s) => ({ ...s, answers: findingsAnswered(s.control.id, findings) }))
    .sort(
      (a, b) =>
        b.answers - a.answers ||
        b.supportingCaseIds.length - a.supportingCaseIds.length ||
        a.control.label.localeCompare(b.control.label),
    );
}

/** How a gap card is badged: severity until dual release covers it. */
export type GapBadge =
  "Fix first" | "Fix soon" | "Worth doing" | "Reduced, not closed" | "Covered by dual release";

/**
 * A gap the policy covers at every amount carries "Covered by dual release",
 * one it covers above a threshold "Reduced, not closed"; only an unmitigated
 * gap keeps its severity badge.
 */
export function gapBadge(
  conflict: Pick<DetectedConflict, "severity" | "dualReleaseMitigated">,
  partialThreshold: number | undefined,
): GapBadge {
  if (partialThreshold !== undefined) return "Reduced, not closed";
  if (conflict.dualReleaseMitigated) return "Covered by dual release";
  return conflict.severity === "critical"
    ? "Fix first"
    : conflict.severity === "high"
      ? "Fix soon"
      : "Worth doing";
}

/** One owner-held pair for the "Duties you hold yourself" note. */
export interface OwnerHeldPair {
  ruleId: string;
  personName: string;
  pair: string;
  suggestion: string;
}

/**
 * The owner's own pairs, one per rule, with the outside-reader suggestion the
 * detector gives. They are not theft findings (an owner cannot steal from
 * themselves), so they sit in a short note rather than among the gap cards.
 */
export function ownerHeldPairs(conflicts: readonly DetectedConflict[]): OwnerHeldPair[] {
  const out = new Map<string, OwnerHeldPair>();
  for (const c of conflicts) {
    if (!c.ownerHeld || c.residualRiskAccepted || out.has(c.ruleId)) continue;
    out.set(c.ruleId, {
      ruleId: c.ruleId,
      personName: c.personName,
      pair: `${c.labelA} and ${midSentence(c.labelB)}`,
      suggestion: c.compensatingControls[0] ?? "",
    });
  }
  return [...out.values()];
}
