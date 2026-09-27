/**
 * The Recommendations box under the duty-conflict findings: what to do first,
 * in plain words, naming whoever the business has as its independent reader.
 */
import { personLabel } from "../person-label";
import { count, verb } from "../text";
import type { RoleAssignment } from "./assignments";
import { PAYMENT_CHANNELS, type EntitlementId } from "./conflict-rules";
import type { FindingSeverity } from "./score";

/** The parts of a finding the recommendations read. */
export interface RecommendationFinding {
  ruleId: string;
  severity: FindingSeverity;
  ownerHeld: boolean;
  dualReleaseMitigated: boolean;
}

/** Who the recommendations name as the person outside the duties. */
export interface Overseer {
  /** The business has an owner at all (a nonprofit has none). */
  hasOwner: boolean;
  /** The one person who owns the business alone, when there is one. */
  soleOwnerId: string | null;
}

/**
 * Rule and recommendation wording names "the owner" as the independent
 * reader. A nonprofit has no owner: its board treasurer holds that seat, so
 * the same advice names the treasurer there.
 */
export function inOverseerWords(text: string, hasOwner: boolean): string {
  if (hasOwner) return text;
  return text.replace(/\bOwner\b/g, "Board treasurer").replace(/\bowner\b/g, "board treasurer");
}

/** The recommendations for a team's findings, most urgent first. */
export function sodRecommendations(
  assignments: readonly RoleAssignment[],
  conflicts: readonly RecommendationFinding[],
  overseer: Overseer,
): string[] {
  const open = conflicts.filter((c) => !c.dualReleaseMitigated && !c.ownerHeld);
  const openOf = (...ruleIds: string[]) => open.some((c) => ruleIds.includes(c.ruleId));
  const critical = open.filter((c) => c.severity === "critical").length;
  const otherOpen = open.length - critical;
  const mitigated = conflicts.filter((c) => c.dualReleaseMitigated).length;
  const ownerHeld = conflicts.filter((c) => c.ownerHeld).length;
  // With one owner, the owner is the reader outside the duties; partners
  // each hold part of the business, so the reader is one who holds none.
  const reader = overseer.soleOwnerId ? "the owner" : "an owner or partner who holds none of them";

  const recommendations: string[] = [];
  if (critical > 0) {
    recommendations.push(
      `Close the ${count(critical, "critical pair")} first, or narrow ${verb(critical, "it", "them")} with a dual-release rule.`,
    );
  }
  // One employee holding most of the money cycle is the finding a CPA leads
  // with: every pair above is then in the same pair of hands.
  for (const person of assignments) {
    if (person.personId === overseer.soleOwnerId) continue;
    const cycle = moneyCycleHeld(person.entitlements);
    if (cycle.length < CONCENTRATION_THRESHOLD) continue;
    recommendations.push(
      `${personLabel(person.personName, person.role)} holds ${cycle.length} of the ${MONEY_CYCLE.length} core money duties, so most of the money cycle runs through one person with nobody in between. ${
        cycle.includes("bank_reconcile")
          ? "Start by moving the bank reconciliation to someone who holds none of the others."
          : "Start by having someone who holds none of them reconcile the bank account."
      }`,
    );
  }
  if (mitigated > 0) {
    recommendations.push(
      `A dual-release rule narrows ${count(mitigated, "pair")}. Keep its thresholds set in the bank and in your own system.`,
    );
  }
  if (openOf("rule-cash-rec", "rule-custody-rec")) {
    recommendations.push(
      `Have two people count and sign each deposit, and have ${reader} reconcile the bank account: two records the same person can no longer make agree.`,
    );
  }
  if (openOf("rule-vendor-create-pay")) {
    recommendations.push(
      `Turn on dual release for electronic payments above the amount you set, and have ${reader} sign off on every new supplier.`,
    );
  }
  if (openOf("rule-card-review", "rule-card-approve")) {
    recommendations.push(
      `Have ${reader} read every company card statement line by line before it is coded, turn off cash advances on the cards, and let nobody approve their own card spending or expense claims.`,
    );
  }
  if (openOf("rule-writeoff", "rule-claims-writeoff")) {
    recommendations.push(
      `Require a second approval on write-offs above the amount you set, from ${reader} or the office manager.`,
    );
  }
  if (!recommendations.length && otherOpen > 0) {
    recommendations.push(
      `Move one duty in each of the ${count(otherOpen, "open pair")} to someone else, or record the control that closes ${verb(otherOpen, "it", "them")}.`,
    );
  }
  if (ownerHeld > 0) {
    recommendations.push(
      `The owner holds ${count(ownerHeld, "pair")}. An owner cannot steal from themselves, so ${verb(ownerHeld, "it is not a theft finding", "they are not theft findings")}; have an outside bookkeeper or accountant read the bank statement and the payroll register each month.`,
    );
  }
  if (!recommendations.length) {
    recommendations.push("Duties look separated; scan again after any role change.");
  }
  return recommendations.map((text) => inOverseerWords(text, overseer.hasOwner));
}

/** Money-cycle duties a set of duties covers, counting ACH initiation and check signing as releasing payments. */
function moneyCycleHeld(duties: readonly EntitlementId[]): EntitlementId[] {
  const held = new Set(duties);
  if (duties.some((d) => PAYMENT_CHANNELS.has(d))) held.add("release_payment");
  return MONEY_CYCLE.filter((d) => held.has(d));
}

/**
 * The money cycle the onboarding grid asks about. One employee holding most
 * of it is a finding on its own: every pair is then in one pair of hands.
 */
const MONEY_CYCLE: readonly EntitlementId[] = [
  "collect_cash",
  "post_payments",
  "prepare_deposit",
  "bank_reconcile",
  "enter_invoices",
  "create_vendor",
  "release_payment",
  "enter_payroll",
  "approve_payroll",
  "issue_refunds",
  "approve_writeoffs",
];

/** How many of the money-cycle duties one employee may hold before it is called out. */
const CONCENTRATION_THRESHOLD = 5;
