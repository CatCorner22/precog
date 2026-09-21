/**
 * Canonical control catalogue.
 *
 * Why this exists: each case records what would have caught it in that
 * business's own terms — "the owner opens the bank statement before the
 * controller sees it" reads differently from "the bank statement goes to a
 * partner, not the administrator". Those are the same control. Aggregating on
 * the prose made every count exactly one, which made the "ordered by how many
 * cases each would have stopped" claim false.
 *
 * A case now names the canonical control and keeps its own phrasing alongside
 * it, so the case card stays concrete while the recommendation list can count
 * honestly.
 */
export type ControlId =
  | "owner-opens-bank-statement"
  | "independent-bank-reconciliation"
  | "positive-pay"
  | "payroll-register-review"
  | "no-self-approval"
  | "electronic-remittance"
  | "expected-receipts-vs-deposits"
  | "new-payee-review"
  | "new-payee-second-approval"
  | "bank-alerts-on-payee-change"
  | "dual-release-above-threshold"
  | "card-statement-line-review"
  | "receipt-and-second-approval"
  | "adjustments-report-by-employee"
  | "split-one-duty-out"
  | "permission-review"
  | "log-payments-at-the-mail"
  | "independent-financial-review"
  | "verify-oversight-is-real"
  | "billing-matches-the-schedule"
  | "compare-across-locations"
  | "volume-vs-recorded-sales"
  | "payee-account-not-an-employee"
  | "confirm-remittance-account"
  | "terminated-staff-vs-payroll"
  | "gift-card-purchases-controlled"
  | "background-check-money-handlers"
  | "mandatory-time-away"
  | "count-inventory-independently"
  | "controlled-substance-count"
  | "no-shared-logins";

export interface ControlDefinition {
  id: ControlId;
  /** One line an owner could act on this week. */
  label: string;
  /** What it actually defends against. */
  why: string;
  /** Roughly what it costs to put in place. */
  effort: "minutes" | "an hour" | "ongoing";
}

export const CONTROL_CATALOG: Record<ControlId, ControlDefinition> = {
  "owner-opens-bank-statement": {
    id: "owner-opens-bank-statement",
    label: "Owner opens the bank statement first, before anyone else handles it",
    why: "Cleared-check images show where money actually went. A forged signature clears the bank; only someone outside the process looking at the images catches it.",
    effort: "minutes",
  },
  "independent-bank-reconciliation": {
    id: "independent-bank-reconciliation",
    label: "Someone other than the person who banks the money reconciles the account",
    why: "If the person who records a deposit also confirms it arrived, the two will always agree regardless of what went in.",
    effort: "an hour",
  },
  "positive-pay": {
    id: "positive-pay",
    label: "Turn on Positive Pay so the bank only pays checks on a list you upload",
    why: "Stops an unauthorized check at the bank rather than finding it afterwards.",
    effort: "an hour",
  },
  "payroll-register-review": {
    id: "payroll-register-review",
    label: "Owner reviews the payroll register every cycle — one page, names and amounts",
    why: "Whoever runs payroll can change what payroll says, including their own pay.",
    effort: "minutes",
  },
  "no-self-approval": {
    id: "no-self-approval",
    label: "Nobody approves their own pay, expenses, or adjustments, at any amount",
    why: "A threshold with no floor is how escalation starts: small enough to ignore, growing while nothing happens.",
    effort: "minutes",
  },
  "electronic-remittance": {
    id: "electronic-remittance",
    label: "Take payment electronically so no payable check passes through the office",
    why: "A check that never exists cannot be diverted. This removes the exposure rather than watching it.",
    effort: "ongoing",
  },
  "expected-receipts-vs-deposits": {
    id: "expected-receipts-vs-deposits",
    label: "Owner compares what should have come in against what was deposited, monthly",
    why: "Money that never arrives leaves no trace in the books. Only an outside expectation reveals it.",
    effort: "an hour",
  },
  "new-payee-review": {
    id: "new-payee-review",
    label: "Owner reviews every payee and supplier added that month",
    why: "An invented supplier is paid like any other, and the payments look entirely ordinary in the accounts. The only place it shows is the list of who was added.",
    effort: "minutes",
  },
  "new-payee-second-approval": {
    id: "new-payee-second-approval",
    label:
      "A second person approves each new supplier before its first payment, against a W-9 and a real address",
    why: "Documentation that arrives by email from the supplier proves nothing when the supplier is the one being invented.",
    effort: "minutes",
  },
  "bank-alerts-on-payee-change": {
    id: "bank-alerts-on-payee-change",
    label: "Bank alerts on new payees and on any account-detail change",
    why: "Redirecting an existing supplier's bank details is quieter than inventing a new one.",
    effort: "an hour",
  },
  "dual-release-above-threshold": {
    id: "dual-release-above-threshold",
    label: "A second person releases payments above a set amount, using their own login",
    why: "A shared login defeats this entirely. If the first person can give the second approval, the control exists only on paper.",
    effort: "an hour",
  },
  "card-statement-line-review": {
    id: "card-statement-line-review",
    label: "Owner reads the company card statement line by line, every month",
    why: "A consumer marketplace charge is indistinguishable from a supplier line until someone asks what it was for.",
    effort: "minutes",
  },
  "receipt-and-second-approval": {
    id: "receipt-and-second-approval",
    label: "Reimbursements need a receipt and a second person's approval",
    why: "A reimbursement is not taxed and does not read as a raise, so it is the quietest way to inflate one's own pay.",
    effort: "minutes",
  },
  "adjustments-report-by-employee": {
    id: "adjustments-report-by-employee",
    label: "Review voids, refunds, discounts, and write-offs grouped by employee",
    why: "These are normal, necessary functions, which is exactly why they work as concealment. Grouped by person, the outlier is visible at a glance.",
    effort: "minutes",
  },
  "split-one-duty-out": {
    id: "split-one-duty-out",
    label: "Move any single duty out of the concentrated role — even just the bank reconciliation",
    why: "The cycle only works while one person holds every step. Breaking any link breaks it.",
    effort: "ongoing",
  },
  "permission-review": {
    id: "permission-review",
    label: "Review who holds which system permissions, not who holds which job title",
    why: "Oversight gets designed around the senior title while a deputy quietly inherits the same access.",
    effort: "an hour",
  },
  "log-payments-at-the-mail": {
    id: "log-payments-at-the-mail",
    label: "Log incoming payments when the mail is opened, before they reach whoever posts them",
    why: "Creates a record made by a different person, which is the only thing a diverted payment can be checked against.",
    effort: "minutes",
  },
  "independent-financial-review": {
    id: "independent-financial-review",
    label: "Have an outside accountant review the books annually, even where no audit is required",
    why: "An outsider asks the questions everyone inside has stopped asking.",
    effort: "ongoing",
  },
  "verify-oversight-is-real": {
    id: "verify-oversight-is-real",
    label:
      "Confirm the people your controls rely on know they hold the role, and that approvals leave evidence",
    why: "A control that is documented but never performed is worse than none, because it stops anyone asking the question.",
    effort: "an hour",
  },
  "billing-matches-the-schedule": {
    id: "billing-matches-the-schedule",
    label: "Check that what you billed matches who actually worked and what was actually delivered",
    why: "Billing under a name that did not work that day exposes the business to repayment and to the insurer's own fraud finding.",
    effort: "an hour",
  },
  "compare-across-locations": {
    id: "compare-across-locations",
    label: "Compare the same cost and cash lines across your locations",
    why: "With attention split across sites, an outlier location is the fastest signal a multi-unit owner has.",
    effort: "minutes",
  },
  "volume-vs-recorded-sales": {
    id: "volume-vs-recorded-sales",
    label: "Compare goods used or work done against sales recorded",
    why: "Suppressing a sale in the till does not suppress the stock that left with it.",
    effort: "an hour",
  },
  "payee-account-not-an-employee": {
    id: "payee-account-not-an-employee",
    label: "No supplier is paid to a bank account matching an employee's",
    why: "A one-line check against payroll details that catches the crudest and most common version outright.",
    effort: "minutes",
  },
  "confirm-remittance-account": {
    id: "confirm-remittance-account",
    label: "Confirm annually with major payers which account they send money to",
    why: "Confirms with the party actually sending the money, which is the one record an insider cannot edit.",
    effort: "an hour",
  },
  "terminated-staff-vs-payroll": {
    id: "terminated-staff-vs-payroll",
    label: "Compare the list of people who have left against everyone paid this month",
    why: "A ghost employee is almost always a real former employee whose record was quietly reactivated. The departed list is the one thing the payroll operator does not control.",
    effort: "minutes",
  },
  "gift-card-purchases-controlled": {
    id: "gift-card-purchases-controlled",
    label: "Gift cards on a company card need a second approval and a stated purpose",
    why: "A gift card turns a traceable card charge into untraceable cash. They look like any other retailer line on a statement.",
    effort: "minutes",
  },
  "background-check-money-handlers": {
    id: "background-check-money-handlers",
    label: "Reference and background checks on anyone who will touch money",
    why: "A business that quietly fires an embezzler hands the problem to the next small business. The next one is sometimes you.",
    effort: "an hour",
  },
  "mandatory-time-away": {
    id: "mandatory-time-away",
    label:
      "Everyone who touches money takes at least a week away each year while someone else does the job",
    why: "A scheme that needs daily tending falls apart the week its owner is not there to tend it. The person covering the desk asks the questions nobody else has been in a position to ask.",
    effort: "ongoing",
  },
  "count-inventory-independently": {
    id: "count-inventory-independently",
    label:
      "Someone who neither orders nor receives stock counts it and compares the count to what was bought",
    why: "Goods leave a business as quietly as cash does, and an order placed for personal use looks exactly like a real one on the invoice. A count by a third pair of hands is the only record that does not depend on the person who ordered and signed for it.",
    effort: "an hour",
  },
  "controlled-substance-count": {
    id: "controlled-substance-count",
    label:
      "Two people count controlled substances against the log each day and inspect vials and seals for tampering",
    why: "Drug diversion is inventory theft with a patient at the other end. A daily two-person count with a signed log turns a missing or altered vial into a same-day question instead of a months-later discovery.",
    effort: "ongoing",
  },
  "no-shared-logins": {
    id: "no-shared-logins",
    label:
      "Every person has their own login, and every shared password changes the day anyone leaves",
    why: "A departing employee who knows a colleague's password still has your customer list. Named logins make access removable, and make the audit log mean something when you need it.",
    effort: "an hour",
  },
};
