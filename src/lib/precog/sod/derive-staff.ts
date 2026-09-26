import { soleOwnerCriticalCount } from "../continuity/coverage";
import type { IndustryTemplate } from "../templates/types";
import type { Person, StaffComposition } from "../types";
import { personDuties } from "./assignments";
import { PAYMENT_CHANNELS, type EntitlementId } from "./conflict-rules";
import { controlOptions, detectSodConflicts } from "./detect";
import { soleOwnerId } from "./owner-role";

/**
 * Whether someone reconciles the bank account who neither handles nor records
 * the money: the one check the ledger-keeper cannot make agree by hand. Each
 * person's duties resolve the way the conflict engine reads them (their own,
 * else their title's in `roleTemplates`), so a team that relies on job titles
 * is read the same as one with duties entered by hand. For the sole owner,
 * sending money out (signing checks, releasing payments, approving an ACH) is
 * the oversight itself: an owner who signs and then reads the statement is the
 * independent reconciliation the app recommends. Only handling the cash or
 * writing the records makes the owner's reconciliation a check on their own
 * work.
 */
export function independentReconciliationFromTeam(
  people: readonly Person[],
  roleTemplates: Readonly<Record<string, readonly string[]>> = {},
  industry?: string,
): boolean {
  const active = people.filter((p) => p.active);
  const ownerId = soleOwnerId(active, industry);
  return active.some((p) => {
    const duties = personDuties(p, roleTemplates);
    if (!duties.includes("bank_reconcile")) return false;
    const disqualifying = (d: EntitlementId) =>
      MONEY_HANDS.has(d) && !(p.id === ownerId && PAYMENT_CHANNELS.has(d));
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
    next.independentBankRec = independentReconciliationFromTeam(
      tpl.people,
      tpl.roleTemplates,
      tpl.id,
    );
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

/**
 * Duties that handle or record money: a reconciler who holds any of them is
 * checking their own work. This is wider than the money cycle the
 * concentration recommendation counts (recommendations.ts): changing payroll
 * master data or posting journal entries lets a reconciler make the books
 * agree, even though neither is a step the onboarding grid asks about.
 */
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
