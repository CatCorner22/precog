import type { IndustryTemplate } from "../templates/types";
import type { StaffComposition } from "../types";
import { controlOptions, detectSodConflicts } from "./detect";
import type { EntitlementId } from "./conflict-rules";
import type { Person } from "../types";
import { soleOwnerCriticalCount } from "../continuity/coverage";

const MONEY_HANDS = new Set<EntitlementId>([
  "collect_cash",
  "post_payments",
  "prepare_deposit",
  "release_payment",
  "initiate_ach",
  "sign_checks",
  "enter_invoices",
  "enter_payroll",
  "edit_payroll_master",
  "post_journal_entries",
  "post_adjustments",
  "issue_refunds",
  "create_vendor",
]);

/**
 * Whether someone reconciles the bank account who neither handles nor records
 * the money: the one check the ledger-keeper cannot make agree by hand.
 */
export function independentReconciliationFromTeam(people: readonly Person[]): boolean {
  return people.some(
    (p) =>
      p.active &&
      (p.entitlements ?? []).includes("bank_reconcile") &&
      !(p.entitlements ?? []).some((e) => MONEY_HANDS.has(e as EntitlementId)),
  );
}

export function deriveStaffFromTeam(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  opts: { dualReleaseMitigatedRuleIds?: Set<string> } = {},
): StaffComposition {
  const activePeople = tpl.people.filter((person) => person.active);
  const knownTenures = activePeople
    .map((person) => person.tenureYears)
    .filter((tenure): tenure is number => typeof tenure === "number");
  const next: StaffComposition = {
    ...staff,
    teamSize: Math.max(1, activePeople.length),
    soleOwnerKnowledgeCount: soleOwnerCriticalCount(tpl),
    avgTenureYears: knownTenures.length
      ? Math.round(
          (knownTenures.reduce((total, tenure) => total + tenure, 0) / knownTenures.length) * 10,
        ) / 10
      : staff.avgTenureYears,
  };
  if (staff.segregationSource !== "manual") {
    next.segregationScore = detectSodConflicts(tpl, undefined, {
      ...controlOptions(tpl),
      dualReleaseMitigatedRuleIds: opts.dualReleaseMitigatedRuleIds,
    }).summary.segregationHealth;
    next.segregationSource = "derived";
  }
  return next;
}
