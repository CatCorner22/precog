import type { IndustryId } from "../industry";
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
  | "no-shared-logins"
  | "recovery-copy-out-of-reach"
  | "payroll-tax-remittance-verified"
  | "same-day-access-removal"
  | "check-stock-custody"
  | "void-refund-second-approval";

export interface ControlDefinition {
  id: ControlId;
  /** One line an owner could act on this week. */
  label: string;
  /**
   * The same line for a line of business where "owner" is the wrong person,
   * for example a nonprofit, which belongs to no one. Read through
   * `controlForIndustry`; the catalog keeps one id and one ranking.
   */
  labelByIndustry?: Partial<Record<IndustryId, string>>;
  /** What it actually defends against. */
  why: string;
  /** Roughly what it costs to put in place, once. */
  setup: "minutes" | "an hour" | "a day";
  /** How often it recurs after that; "once" when setting it up is the whole job. */
  cadence: ControlCadence;
}

type ControlCadence =
  | "once"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "each payroll"
  | "each check run"
  | "each payment"
  | "each new supplier"
  | "each claim"
  | "each purchase"
  | "each hire"
  | "whenever someone leaves"
  | "each void or refund";

/** What a control costs, in words: "Minutes to set up, then monthly", "A day to set up". */
export function effortPhrase(control: Pick<ControlDefinition, "setup" | "cadence">): string {
  const setup = `${control.setup === "minutes" ? "Minutes" : control.setup === "an hour" ? "An hour" : "A day"} to set up`;
  return control.cadence === "once" ? setup : `${setup}, then ${control.cadence}`;
}

export const CONTROL_CATALOG: Record<ControlId, ControlDefinition> = {
  "owner-opens-bank-statement": {
    id: "owner-opens-bank-statement",
    label: "Owner opens the bank statement first, before anyone else handles it",
    labelByIndustry: {
      nonprofit: "A board member opens the bank statement first, before anyone else handles it",
    },
    why: "Cleared-check images show where money actually went. A forged signature clears the bank; only someone outside the process looking at the images catches it.",
    setup: "minutes",
    cadence: "monthly",
  },
  "independent-bank-reconciliation": {
    id: "independent-bank-reconciliation",
    label: "Someone other than the person who banks the money reconciles the account",
    why: "If the person who records a deposit also confirms it arrived, the two will always agree regardless of what went in.",
    setup: "an hour",
    cadence: "monthly",
  },
  "positive-pay": {
    id: "positive-pay",
    label: "Turn on Positive Pay so the bank only pays checks on a list you upload",
    why: "Stops an unauthorized check at the bank rather than finding it afterwards.",
    setup: "an hour",
    cadence: "each check run",
  },
  "payroll-register-review": {
    id: "payroll-register-review",
    label: "Owner reviews the payroll register every cycle — one page, names and amounts",
    why: "Whoever runs payroll can change what payroll says, including their own pay.",
    setup: "minutes",
    cadence: "each payroll",
  },
  "no-self-approval": {
    id: "no-self-approval",
    label: "Nobody approves their own pay, expenses, or adjustments, at any amount",
    why: "A threshold with no floor is how escalation starts: small enough to ignore, growing while nothing happens.",
    setup: "minutes",
    cadence: "once",
  },
  "electronic-remittance": {
    id: "electronic-remittance",
    label: "Take payment electronically so no payable check passes through the office",
    why: "Nobody can divert a check that never exists. This removes the exposure rather than watching it.",
    setup: "a day",
    cadence: "once",
  },
  "expected-receipts-vs-deposits": {
    id: "expected-receipts-vs-deposits",
    label: "Owner compares the money expected in with the deposits, monthly",
    why: "Money that never arrives leaves no trace in the books. Only an outside expectation reveals it.",
    setup: "an hour",
    cadence: "monthly",
  },
  "new-payee-review": {
    id: "new-payee-review",
    label:
      "Owner reads the month's list of new suppliers and changed supplier bank details, and confirms any they do not recognize",
    why: "Someone adds an invented supplier once and pays it for years, and the payments look entirely ordinary in the accounts. The one moment it is visible is the month it appears on the list of additions and bank-detail changes, read by someone who cannot add them.",
    setup: "minutes",
    cadence: "monthly",
  },
  "new-payee-second-approval": {
    id: "new-payee-second-approval",
    label:
      "A second person approves each new supplier before its first payment, against a W-9 and a real address",
    why: "Documentation that arrives by email from the supplier proves nothing when the supplier itself is fake.",
    setup: "minutes",
    cadence: "each new supplier",
  },
  "bank-alerts-on-payee-change": {
    id: "bank-alerts-on-payee-change",
    label: "Bank alerts on new payees and on any account-detail change",
    why: "Redirecting an existing supplier's bank details is quieter than inventing a new one.",
    setup: "an hour",
    cadence: "once",
  },
  "dual-release-above-threshold": {
    id: "dual-release-above-threshold",
    label: "A second person releases payments above a set amount, using their own sign-in",
    why: "A shared sign-in defeats this entirely. If the first person can give the second approval, the control exists only on paper.",
    setup: "an hour",
    cadence: "each payment",
  },
  "card-statement-line-review": {
    id: "card-statement-line-review",
    label: "Owner reads the company card statement line by line, every month",
    why: "A consumer marketplace charge is indistinguishable from a supplier line until someone asks what it was for.",
    setup: "minutes",
    cadence: "monthly",
  },
  "receipt-and-second-approval": {
    id: "receipt-and-second-approval",
    label: "Reimbursements need a receipt and a second person's approval",
    why: "A reimbursement carries no tax and does not read as a raise, so it is the quietest way to inflate one's own pay.",
    setup: "minutes",
    cadence: "each claim",
  },
  "adjustments-report-by-employee": {
    id: "adjustments-report-by-employee",
    label: "Review voids, refunds, discounts, and write-offs grouped by employee",
    why: "These are normal, necessary functions, which is exactly why they work as concealment. Grouped by person, the outlier is visible at a glance.",
    setup: "minutes",
    cadence: "weekly",
  },
  "split-one-duty-out": {
    id: "split-one-duty-out",
    label: "Move any single duty out of the concentrated role — even just the bank reconciliation",
    why: "The cycle only works while one person holds every step. Breaking any link breaks it.",
    setup: "a day",
    cadence: "once",
  },
  "permission-review": {
    id: "permission-review",
    label: "Review who holds which system permissions, not who holds which job title",
    why: "Owners design oversight around the senior title while a deputy quietly inherits the same access.",
    setup: "an hour",
    cadence: "quarterly",
  },
  "log-payments-at-the-mail": {
    id: "log-payments-at-the-mail",
    label:
      "Log incoming payments when someone opens the mail, before they reach whoever posts them",
    why: "Creates a record made by a different person, the only thing anyone can check a diverted payment against.",
    setup: "minutes",
    cadence: "daily",
  },
  "independent-financial-review": {
    id: "independent-financial-review",
    label:
      "Have an outside accountant review the books annually, even where no law or lender requires an audit",
    why: "An outsider asks the questions everyone inside has stopped asking.",
    setup: "a day",
    cadence: "yearly",
  },
  "verify-oversight-is-real": {
    id: "verify-oversight-is-real",
    label:
      "Confirm the people your controls rely on know they hold the role, and that approvals leave evidence",
    why: "A control that someone documents but nobody performs is worse than none, because it stops anyone asking the question.",
    setup: "an hour",
    cadence: "yearly",
  },
  "billing-matches-the-schedule": {
    id: "billing-matches-the-schedule",
    label: "Check that what you billed matches who actually worked and what you actually delivered",
    why: "Billing under a name that did not work that day exposes the business to repayment and to the insurer's own fraud finding.",
    setup: "an hour",
    cadence: "monthly",
  },
  "compare-across-locations": {
    id: "compare-across-locations",
    label: "Compare the same cost and cash lines across your locations",
    why: "With attention split across sites, an outlier location is the fastest signal a multi-unit owner has.",
    setup: "minutes",
    cadence: "monthly",
  },
  "volume-vs-recorded-sales": {
    id: "volume-vs-recorded-sales",
    label: "Compare goods used or work done against sales recorded",
    why: "Suppressing a sale in the till does not suppress the stock that left with it.",
    setup: "an hour",
    cadence: "monthly",
  },
  "payee-account-not-an-employee": {
    id: "payee-account-not-an-employee",
    label: "Nobody pays a supplier into a bank account matching an employee's",
    why: "A one-line check against payroll details that catches the crudest and most common version outright.",
    setup: "minutes",
    cadence: "monthly",
  },
  "confirm-remittance-account": {
    id: "confirm-remittance-account",
    label: "Confirm annually with major payers which account they send money to",
    why: "Confirms with the party actually sending the money, which is the one record an insider cannot edit.",
    setup: "an hour",
    cadence: "yearly",
  },
  "terminated-staff-vs-payroll": {
    id: "terminated-staff-vs-payroll",
    label: "Compare the list of people who have left against everyone paid this month",
    why: "A ghost employee is almost always a real person who has left and whose record someone quietly reactivated. The list of people who have left is the one thing the payroll operator does not control.",
    setup: "minutes",
    cadence: "monthly",
  },
  "gift-card-purchases-controlled": {
    id: "gift-card-purchases-controlled",
    label: "Gift cards on a company card need a second approval and a stated purpose",
    why: "A gift card turns a traceable card charge into untraceable cash. They look like any other retailer line on a statement.",
    setup: "minutes",
    cadence: "each purchase",
  },
  "background-check-money-handlers": {
    id: "background-check-money-handlers",
    label: "Reference and background checks on anyone who will touch money",
    why: "A business that quietly fires an embezzler hands the problem to the next small business. The next one is sometimes you.",
    setup: "an hour",
    cadence: "each hire",
  },
  "mandatory-time-away": {
    id: "mandatory-time-away",
    label:
      "Everyone who touches money takes at least a week away each year while someone else does the job",
    why: "A scheme that needs daily tending falls apart the week its owner is not there to tend it. The person covering the desk asks the questions nobody else has been in a position to ask.",
    setup: "an hour",
    cadence: "yearly",
  },
  "count-inventory-independently": {
    id: "count-inventory-independently",
    label:
      "Someone who neither orders nor receives stock counts it and compares the count to the purchase records",
    why: "Goods leave a business as quietly as cash does, and an order placed for personal use looks exactly like a real one on the invoice. A count by a third pair of hands is the only record that does not depend on the person who ordered and signed for it.",
    setup: "an hour",
    cadence: "monthly",
  },
  "controlled-substance-count": {
    id: "controlled-substance-count",
    label:
      "Two people count controlled substances against the log each week and inspect vials and seals for tampering",
    why: "Drug diversion is inventory theft with a patient at the other end. A weekly two-person count with a signed log turns a missing or altered vial into a question within days instead of a months-later discovery. The DEA itself requires only a complete inventory every two years (21 CFR 1304.11); the weekly count is the practice's own policy.",
    setup: "an hour",
    cadence: "weekly",
  },
  "no-shared-logins": {
    id: "no-shared-logins",
    label:
      "Every person has their own sign-in, and every shared password changes the day anyone leaves",
    why: "A departing employee who knows a colleague's password still has your customer list. Named sign-ins make access removable, and make the audit log mean something when you need it.",
    setup: "an hour",
    cadence: "once",
  },
  "recovery-copy-out-of-reach": {
    id: "recovery-copy-out-of-reach",
    label:
      "Keep one backup copy that no employee sign-in can delete — under the owner's own account, or offline",
    why: "A backup the administrator can reach is a backup the administrator can erase, and an angry administrator erases it first. A copy only the owner controls turns a wipe into an afternoon's restore.",
    setup: "an hour",
    cadence: "once",
  },
  "payroll-tax-remittance-verified": {
    id: "payroll-tax-remittance-verified",
    label:
      "Each quarter, sign in to the IRS and state payroll-tax portals yourself and confirm the deposits went in",
    why: "A bookkeeper who is short of cash can stop paying the payroll taxes and keep the money; the notices arrive months later, addressed to the person who caused them. The portals show in minutes whether the deposits exist.",
    setup: "minutes",
    cadence: "quarterly",
  },
  "same-day-access-removal": {
    id: "same-day-access-removal",
    label:
      "Remove every sign-in, administrator right, and shared password the day a person's duties change or they leave",
    why: "Access that outlives the job is how someone who has left or moved to a lesser role reaches the server, the backups, or a colleague's account. Doing it the same day, from a written list of every system, closes the door before the grievance forms.",
    setup: "an hour",
    cadence: "whenever someone leaves",
  },
  "check-stock-custody": {
    id: "check-stock-custody",
    label:
      "Lock the blank check stock, never sign a check in blank, and log the check numbers used each week",
    why: "A pre-signed blank check is cash with your signature on it, and a printed check to a home address is one line in a ledger. Locked stock and a numbered log make a missing check visible before it clears.",
    setup: "minutes",
    cadence: "weekly",
  },
  "void-refund-second-approval": {
    id: "void-refund-second-approval",
    label: "A second person approves every void, refund, and credit memo before it posts",
    why: "A refund with no sale behind it is a payment, and a void after the customer paid is cash in a pocket. Requiring a second name on each one turns a private key into a shared decision.",
    setup: "an hour",
    cadence: "each void or refund",
  },
};

/**
 * A catalog control worded for one line of business: the nonprofit variant
 * of a label where one exists, otherwise the control as written. Everything
 * but the label (id, why, setup, cadence) is the same object's.
 */
export function controlForIndustry(
  control: ControlDefinition,
  industry: IndustryId | undefined,
): ControlDefinition {
  const label = industry ? control.labelByIndustry?.[industry] : undefined;
  return label ? { ...control, label } : control;
}
