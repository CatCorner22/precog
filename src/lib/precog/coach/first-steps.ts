import type { ControlDefinition, ControlId } from "../evidence/controls";
import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import type { DetectedConflict } from "../sod/detect";
import type { DualReleasePolicy } from "../controls/dual-release";

/**
 * The duties each catalog control polices: a control answers an open finding
 * when it watches either duty of the finding's pair. Controls that watch
 * something no duty grid records (a company card, gift cards, expenses) or
 * that apply to everyone regardless of duties (background checks, time away)
 * answer no finding; they still appear, after the ones that do.
 */
const ALL_DUTIES: EntitlementId[] = ENTITLEMENTS.map((e) => e.id);

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
  "card-statement-line-review": [],
  "receipt-and-second-approval": [],
  "adjustments-report-by-employee": [
    "post_adjustments",
    "approve_writeoffs",
    "issue_refunds",
    "post_payments",
  ],
  "split-one-duty-out": ALL_DUTIES,
  "permission-review": ["manage_user_access", "pms_admin_roles", "export_bulk_data"],
  "log-payments-at-the-mail": ["collect_cash", "post_payments", "prepare_deposit"],
  "independent-financial-review": ["post_journal_entries", "bank_reconcile"],
  "verify-oversight-is-real": [
    "approve_vendor",
    "approve_payroll",
    "approve_writeoffs",
    "bank_reconcile",
  ],
  "billing-matches-the-schedule": ["submit_claims", "change_fee_schedule"],
  "compare-across-locations": [],
  "volume-vs-recorded-sales": ["collect_cash", "post_payments", "issue_refunds", "receive_goods"],
  "payee-account-not-an-employee": ["create_vendor", "edit_payroll_master", "release_payment"],
  "confirm-remittance-account": ["collect_cash", "post_payments"],
  "terminated-staff-vs-payroll": ["edit_payroll_master", "enter_payroll"],
  "gift-card-purchases-controlled": [],
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
  "vendor-master-change-log": ["create_vendor", "approve_vendor"],
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
 * a team with no card finding.
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

/** A duty-conflict suggestion that quotes a dual-release threshold of its own, or the detector's generic note. */
const STALE_DUAL_RELEASE = [
  /dual release on payments\s*>\s*\$[\d,]+/i,
  /^dual-release policy active on related channel$/i,
];

function usd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * The live dual-release policy as it applies to one rule, in one sentence, or
 * null when no channel of the policy addresses the rule. Thresholds are the
 * policy's own, so every screen quotes the same figure.
 */
export function dualReleaseLine(policy: DualReleasePolicy, ruleId: string): string | null {
  const covering = policy.rules.filter((r) => r.mitigatesRuleIds.includes(ruleId));
  if (covering.length === 0) return null;
  const channels = (rules: typeof covering) =>
    rules
      .map((r) =>
        r.thresholdUsd > 0
          ? `${r.label} above ${usd(r.thresholdUsd)}`
          : `${r.label} at every amount`,
      )
      .join("; ");
  const on = policy.enabled ? covering.filter((r) => r.enabled) : [];
  if (on.length === 0) {
    return `Dual release is off for this in your policy; switching it on under Who controls what would require a second person on ${channels(covering)}`;
  }
  return `Your dual-release policy requires a second person on ${channels(on)}`;
}

/**
 * What closes a gap, with any threshold taken from the live policy: suggestions
 * that quote their own dual-release figure, and the detector's generic "policy
 * active" note, give way to one sentence quoting the policy.
 */
export function closingSteps(
  compensatingControls: readonly string[],
  policy: DualReleasePolicy,
  ruleId: string,
): string[] {
  const kept = compensatingControls.filter((c) => !STALE_DUAL_RELEASE.some((re) => re.test(c)));
  const line = dualReleaseLine(policy, ruleId);
  return line ? [...kept, line] : kept;
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
      pair: `${c.labelA} with ${lowerFirst(c.labelB)}`,
      suggestion: c.compensatingControls[0] ?? "",
    });
  }
  return [...out.values()];
}

function lowerFirst(label: string): string {
  return label.replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase());
}
