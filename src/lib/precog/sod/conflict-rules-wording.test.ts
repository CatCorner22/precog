import { describe, expect, it } from "vitest";
import { CONFLICT_RULES } from "./conflict-rules";

/**
 * The suggested fixes on duty-conflict cards. Each was once a fragment such
 * as "Dollar thresholds" or "Immutable vendor-hosted logs", which names no
 * person and no schedule; each now says who acts, what they do and how often.
 */
const REWRITTEN: Record<string, string[]> = {
  "rule-refund-adjust": [
    "A second person who issues no refunds approves each refund before it goes out",
    "Every refund goes only to the card or account that paid, and the owner reads each month's refunds by employee",
  ],
  "rule-invoice-pay": [
    "A second person releases each payment above a set amount, using their own sign-in",
  ],
  "rule-order-receive": [
    "Someone who places no orders signs for each delivery against the packing slip",
    "Each month, someone who neither orders nor receives stock counts it against the purchase records",
  ],
  "rule-access-log": [
    "Each quarter, the owner reviews who holds which system permissions and removes any nobody needs",
    "The activity log stays with the software provider, where no employee sign-in can edit it, and the owner reads it each month",
  ],
  "rule-access-export": [
    "The system emails the owner each time anyone exports customer or patient records in bulk",
    "Owner reads the system's report of new users and permission changes each month",
  ],
  "rule-backup-access": [
    "Only the owner holds the sign-in to the backup service, and each quarter the owner confirms nobody else has one",
    "Owner keeps one backup copy no employee sign-in can delete, offline or under the owner's own account, and checks each month that it is current",
  ],
  "rule-deposit-post": [
    "Each week, someone who neither prepares deposits nor posts payments matches each deposit slip to the payments posted",
    "Two people count each deposit and both sign the deposit log before it leaves",
  ],
  "rule-claims-writeoff": [
    "Each month, an office manager who submits no claims reads the list of denied and unpaid claims and follows up each one",
    "Owner approves each write-off above the amount you set before it posts",
  ],
  "rule-vendor-create-approve": [
    "Owner signs off each new supplier, against a W-9 and a real address, before its first payment",
    "The bank requires a second person's approval to release each electronic payment",
  ],
  "rule-vendor-approve-pay": [
    "Before each payment run, someone who approves no suppliers reads the list of payees and amounts",
    "A second person approves each payment above the amount you set before it goes out",
  ],
  "rule-payroll": [
    "Owner approves the final payroll file each pay run, after the person who entered it",
    "Owner reads the payroll changes report each pay run: new hires, rate changes, bank changes and unusual hours",
  ],
  "rule-admin-pay": [
    "Only the owner or an outside IT provider holds administrator rights, and the owner checks that list each quarter",
    "Owner reads the system's log of permission changes each month",
  ],
  "rule-admin-writeoff": [
    "Anyone with administrator rights uses a separate administrator sign-in, never their daily billing one, and the owner reads its change log each month",
  ],
  "rule-je-rec": ["Owner opens the bank statement first each month, before anyone else handles it"],
  "rule-payroll-master-run": [
    "Owner compares the people paid against the people scheduled each payroll",
  ],
  "rule-custody-rec": [
    "The owner or an outside bookkeeper reconciles the bank account each month instead",
    "A camera covers the till at close, and the owner checks the footage whenever the count is short",
  ],
  "rule-collect-post": [
    "Whoever enters a void or adjustment records the reason each time, and the owner reads them weekly",
  ],
};

/** The fragments the rewrite replaced; none may come back. */
const OLD_FRAGMENTS = [
  "Independent refund approval",
  "Refund to original payment method",
  "Dual release above threshold",
  "Independent receiving evidence",
  "Periodic inventory review",
  "Independent quarterly access review",
  "Immutable vendor-hosted logs",
  "Export alerts to owner",
  "Independent access-change report",
  "Separate backup console credentials",
  "Immutable/offline recovery copy",
  "Independent deposit review",
  "Dual signature on deposit log",
  "Denial aging review by office manager",
  "Write-off threshold",
  "Owner signs new vendor form",
  "Bank dual release",
  "Separate payment batch review",
  "Dollar thresholds",
  "Owner always approves final file",
  "Exception report",
  "Owner-only admin role",
  "Access change log review",
  "Separate admin account from daily billing sign-in",
];

/** A person or party who acts. */
const ACTOR =
  /\b(owner|second person|someone|anyone|whoever|office manager|two people|bank|system|outside bookkeeper|outside IT provider)\b/i;
/** How often, or on what event, they act. */
const FREQUENCY =
  /\b(each|every|monthly|weekly|quarterly|daily)\b|\bbefore (it|its|anyone)\b|whenever/i;

describe("suggested fixes on duty-conflict cards", () => {
  const defaults = new Map(CONFLICT_RULES.map((r) => [r.id, r.compensatingDefaults]));

  it("carries each rewritten fix on its rule", () => {
    for (const [ruleId, fixes] of Object.entries(REWRITTEN)) {
      for (const fix of fixes) expect(defaults.get(ruleId)).toContain(fix);
    }
  });

  it("names who acts and how often in every rewritten fix", () => {
    for (const fix of Object.values(REWRITTEN).flat()) {
      expect(fix, fix).toMatch(ACTOR);
      expect(fix, fix).toMatch(FREQUENCY);
    }
  });

  it("keeps none of the old fragments", () => {
    const all = CONFLICT_RULES.flatMap((r) => r.compensatingDefaults);
    for (const old of OLD_FRAGMENTS) expect(all).not.toContain(old);
  });
});
