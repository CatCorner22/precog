import { soleOwnerCriticalCount } from "../continuity/coverage";
import type { IndustryTemplate } from "../templates/types";
import type { Person, StaffComposition } from "../types";
import { personDuties } from "./assignments";
import { type EntitlementId } from "./conflict-rules";
import { controlOptions, detectSodConflicts } from "./detect";

/**
 * Whether someone reconciles the bank account who neither handles nor records
 * the money: the one check the ledger-keeper cannot make agree by hand. Each
 * person's duties resolve the way the conflict engine reads them (their own,
 * else their title's in `roleTemplates`), so a team that relies on job titles
 * is read the same as one with duties entered by hand. Ownership is not an
 * exception: someone who releases payments reviews their own transactions.
 * This models recorded responsibilities; it does not verify actual access
 * or establish that a reconciliation was performed.
 */
export function independentReconciliationFromTeam(
  people: readonly Person[],
  roleTemplates: Readonly<Record<string, readonly string[]>> = {},
  _industry?: string,
): boolean {
  const active = people.filter((p) => p.active);
  return active.some((p) => {
    const duties = personDuties(p, roleTemplates);
    if (!duties.includes("bank_reconcile")) return false;
    return !duties.some((d) => BANK_ACTIVITY_DUTIES.has(d));
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
export const BANK_ACTIVITY_DUTIES: ReadonlySet<EntitlementId> = new Set([
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
