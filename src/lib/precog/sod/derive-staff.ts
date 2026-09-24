import type { IndustryTemplate } from "../templates/types";
import type { StaffComposition } from "../types";
import { controlOptions, detectSodConflicts } from "./detect";
import type { EntitlementId } from "./conflict-rules";
import type { Person } from "../types";
import { soleOwnerCriticalCount } from "../continuity/coverage";
import { soleOwnerId } from "./owner-role";

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
 * For the sole owner, sending money out (signing checks, releasing payments,
 * approving an ACH) is the oversight itself: an owner who signs and then reads
 * the statement is the independent reconciliation the app recommends. Only
 * handling the cash or writing the records makes the owner's reconciliation a
 * check on their own work.
 */
const OWNER_OVERSIGHT_HANDS = new Set<EntitlementId>([
  "release_payment",
  "initiate_ach",
  "sign_checks",
]);

/**
 * Whether someone reconciles the bank account who neither handles nor records
 * the money: the one check the ledger-keeper cannot make agree by hand.
 */
export function independentReconciliationFromTeam(people: readonly Person[]): boolean {
  const active = people.filter((p) => p.active);
  const ownerId = soleOwnerId(active);
  return active.some((p) => {
    const duties = (p.entitlements ?? []) as EntitlementId[];
    if (!duties.includes("bank_reconcile")) return false;
    const disqualifying = (d: EntitlementId) =>
      MONEY_HANDS.has(d) && !(p.id === ownerId && OWNER_OVERSIGHT_HANDS.has(d));
    return !duties.some(disqualifying);
  });
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
  // Who reconciles follows the team unless the owner set the flag by hand,
  // the same way the segregation score does: marking the reconciler as left
  // must not leave the business credited with an independent reconciliation.
  if (staff.bankRecSource !== "manual") {
    next.independentBankRec = independentReconciliationFromTeam(tpl.people);
    next.bankRecSource = "derived";
  }
  if (staff.segregationSource !== "manual") {
    next.segregationScore = detectSodConflicts(tpl, undefined, {
      ...controlOptions(tpl),
      dualReleaseMitigatedRuleIds: opts.dualReleaseMitigatedRuleIds,
    }).summary.segregationHealth;
    next.segregationSource = "derived";
  }
  return next;
}
