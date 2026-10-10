import { PAYMENT_DESTINATION_CHANGE, RECEIPT_SETTLEMENT } from "../controls/critical-guidance";
import type { IndustryId } from "../industry";
import { personDuties } from "../sod/assignments";
import type { EntitlementId } from "../sod/conflict-rules";
import type { IndustryTemplate } from "../templates";
import type { KnowledgeItem, ProcessCadence } from "../types";
import { newProcedure, newStep } from "./lifecycle";
import type { Procedure } from "./types";

/**
 * Procedures a small business should have written, each with suggested steps
 * that follow recognized control practice. They are a starting point: every
 * suggested step stays marked as a suggestion until the owner fits it to
 * their own screens and people (by editing it, or by verifying the
 * procedure), and the best-practice check says so until then.
 *
 * `source` names the rule or guidance a procedure follows where one applies;
 * the rest is written as common small-business practice and says so. Steps
 * name no owner, because a nonprofit has none: the independent check is
 * always "a second person".
 */
export interface RecommendedProcedure {
  id: string;
  title: string;
  /** Why it matters and what done looks like. */
  purpose: string;
  trigger: string;
  cadence: ProcessCadence;
  /** Only these lines of business; every line of business when absent. */
  industries?: readonly IndustryId[];
  /** Duties following it exercises; a business where someone holds one is shown it first. */
  dutyIds: EntitlementId[];
  /** Register items it covers, matched on the item's name. */
  covers: RegExp;
  prerequisites: string[];
  steps: { text: string; caution?: string }[];
  /** The rule or guidance it follows. */
  source: string;
  /** The records that show it ran, to keep with each run. */
  evidenceToKeep?: string[];
  /** What to do instead when one person has to do both halves of the work. */
  ifYouCannotSeparate?: string;
  /**
   * The same, for a line of business whose stock or records call for a
   * stricter fallback than the shared one. Every other line of business reads
   * `ifYouCannotSeparate`. Resolve it with `ifYouCannotSeparateFor`.
   */
  ifYouCannotSeparateByIndustry?: Partial<Record<IndustryId, string>>;
  /**
   * The same procedure in a line of business's own words, for example a
   * nonprofit's donations in place of the day's sales. Only the fields given
   * change. Resolve it with `recommendationFor`; `libraryRows` already does.
   */
  wordingByIndustry?: Partial<Record<IndustryId, IndustryWording>>;
}

/** The fields a line of business may word its own way. */
export type IndustryWording = Partial<
  Pick<
    RecommendedProcedure,
    "title" | "purpose" | "trigger" | "prerequisites" | "steps" | "evidenceToKeep"
  >
>;

/**
 * The recommendation as this line of business reads it: its own wording
 * where it has some, else the recommendation itself (the same object).
 */
export function recommendationFor(
  r: RecommendedProcedure,
  industry: IndustryId,
): RecommendedProcedure {
  const own = r.wordingByIndustry?.[industry];
  return own ? { ...r, ...own } : r;
}

/** The fallback text this line of business reads: its own where one is set, else the shared one. */
export function ifYouCannotSeparateFor(
  r: Pick<RecommendedProcedure, "ifYouCannotSeparate" | "ifYouCannotSeparateByIndustry">,
  industry: IndustryId,
): string | undefined {
  return r.ifYouCannotSeparateByIndustry?.[industry] ?? r.ifYouCannotSeparate;
}

const COMMON_PRACTICE = "Common small-business control practice.";
const GREEN_BOOK_10 =
  "GAO Standards for Internal Control in the Federal Government (the Green Book), Principle 10: control activities, including segregation of duties and review.";

export const RECOMMENDED_PROCEDURES: readonly RecommendedProcedure[] = [
  {
    id: "lib-bank-rec",
    title: "Reconcile the bank account",
    purpose:
      "Catches missing deposits, duplicate or unauthorized payments, and bank errors. Done when every line on the statement matches the books and a second person has signed the reconciliation.",
    trigger: "When the monthly bank statement arrives, by the 10th of the month",
    cadence: "monthly",
    dutyIds: ["bank_reconcile"],
    covers: /\bbank\s+(?:rec\b|reconcil)/i,
    prerequisites: ["Read-only access to the bank's online statement", "Access to the books"],
    steps: [
      { text: "Download last month's bank statement." },
      { text: "Open the reconciliation screen in the books for the same account and month." },
      { text: "Tick each deposit on the statement that matches a deposit in the books." },
      { text: "Tick each payment on the statement that matches a payment in the books." },
      {
        text: "List every line that does not match, with its date and amount.",
        caution: "Never enter an adjustment to force the difference to zero; find the cause first.",
      },
      { text: "Find the cause of each unmatched line before finishing the reconciliation." },
      { text: "Save the reconciliation report with the statement." },
      {
        text: "Give the report to a second person who does not handle cash or payments to review and sign.",
      },
    ],
    source: GREEN_BOOK_10,
    evidenceToKeep: ["Reconciliation sign-off"],
    ifYouCannotSeparate:
      "Each month, a person who does not post to the books compares the bank statement with the books.",
  },
  {
    id: "lib-vendor-bank-change",
    title: "Change a vendor's bank details",
    purpose:
      "Stops payments going to a criminal who pretends to be a vendor. Done when a call to a number already on file confirms the change and a second person approves it.",
    trigger: "Whenever a vendor asks you to pay them into a different account",
    cadence: "ad-hoc",
    dutyIds: ["create_vendor", "approve_vendor"],
    covers:
      /\b(?:vendor|supplier|subcontractor)s?\s*(?:&\s*\w+\s+)?(?:master|onboarding|set-?up|relationships?)\b/i,
    prerequisites: ["The vendor's phone number from an earlier invoice or contract"],
    steps: [
      { text: "Stop: make no change from the email, letter or call that asked for it." },
      {
        text: PAYMENT_DESTINATION_CHANGE.verification,
        caution: PAYMENT_DESTINATION_CHANGE.caution,
      },
      {
        text: "Confirm the new bank details only with the authorized supplier contact.",
        caution: "Stop if the contact's identity or authority is uncertain.",
      },
      { text: "Write down who confirmed, the date and the number you called." },
      { text: PAYMENT_DESTINATION_CHANGE.secondReview },
      { text: "Save the new bank details in the vendor record." },
      { text: "Confirm with the vendor that the first payment to the new account arrived." },
    ],
    source: `${PAYMENT_DESTINATION_CHANGE.source.publisher}: ${PAYMENT_DESTINATION_CHANGE.source.document}, ${PAYMENT_DESTINATION_CHANGE.source.url}. ${PAYMENT_DESTINATION_CHANGE.source.scope}`,
    evidenceToKeep: [...PAYMENT_DESTINATION_CHANGE.evidence, "Approved supplier list"],
    ifYouCannotSeparate: `${PAYMENT_DESTINATION_CHANGE.verification} ${PAYMENT_DESTINATION_CHANGE.monitoring} If no second person can approve, someone who did not make the change reads the vendor change log every week, and the bank alerts that person to each new payee.`,
  },
  {
    id: "lib-release-payments",
    title: "Release vendor payments",
    purpose:
      "Pays only approved bills, and each only once. Done when every payment released matches an approved bill and a second person has approved the batch.",
    trigger: "On the weekly payment day",
    cadence: "weekly",
    dutyIds: ["release_payment", "initiate_ach", "sign_checks"],
    covers:
      /\b(?:accounts payable|vendor (?:bills?|payments?|invoices?)|bill (?:approval|pay)|pay(?:ing)? (?:bills|vendors))\b/i,
    prerequisites: ["Access to the bills awaiting payment", "The list of approved bills"],
    steps: [
      { text: "Open the list of bills awaiting payment." },
      { text: "Select only bills marked as approved." },
      { text: "Compare each selected bill with its purchase order or receipt." },
      {
        text: "Remove any bill the business has already paid.",
        caution:
          "Check the vendor, amount and invoice number together; a duplicate bill can differ in one of them.",
      },
      { text: "Total the batch and write the total down." },
      {
        text: "Send the batch to a second person to approve before anyone releases it.",
        caution: "The person who prepared the batch must not also approve its release.",
      },
      { text: "Release the approved batch." },
      { text: "Save the payment report with the approved list." },
    ],
    source: GREEN_BOOK_10,
    evidenceToKeep: ["Approved supplier list", "Match report", "Release log"],
    // Detective, not a second approver: a business with one person on
    // payments has nobody to approve the batch. The last sentence points to
    // the bank-side setup until the library holds a procedure for it.
    ifYouCannotSeparate:
      "If one person prepares and releases payments: each week someone who does neither, for example the person who runs the business or a board officer, reads the bank's payment report and the cleared-check images, and the bank alerts that person to every new payee and every payment over a set amount. Ask your bank for payee alerts and Positive Pay with payee match.",
  },
  {
    id: "lib-payroll",
    title: "Run payroll",
    purpose:
      "Pays the right people the right amounts. Done when a second person has approved the run after comparing it with the last one.",
    trigger: "Each pay period, two working days before payday",
    cadence: "weekly",
    dutyIds: ["enter_payroll", "approve_payroll", "edit_payroll_master"],
    covers: /\bpayroll\b/i,
    prerequisites: ["Payroll provider sign-in", "Approved timesheets for the period"],
    steps: [
      { text: "Enter the approved hours for each person." },
      { text: "Compare the headcount with the last pay period." },
      { text: "Compare the total gross pay with the last pay period." },
      {
        text: "List each new person, leaver and pay-rate change with its signed paperwork.",
        caution:
          "Ghost employees and unapproved rate changes are common payroll frauds; stop and ask about any change without paperwork.",
      },
      { text: "Send the payroll summary and the list to the second person who approves payroll." },
      { text: "Submit the payroll only once the second person approves it." },
      { text: "Save the payroll report and the approval." },
    ],
    source: GREEN_BOOK_10,
    evidenceToKeep: ["Payroll register", "Change report", "Approval trail"],
    ifYouCannotSeparate:
      "Someone who does not run payroll reviews the change report each run and reconciles the headcount every quarter.",
  },
  {
    id: "lib-cash-deposit",
    title: "Make the daily cash deposit",
    purpose:
      "Gets the day's cash to the bank and shows any shortage the same day. Done when the bank's deposit matches the day's sales report.",
    trigger: "Every day at close",
    cadence: "daily",
    dutyIds: ["collect_cash", "prepare_deposit"],
    covers:
      /\b(?:daily (?:sales )?deposit|cash (?:handling|drawer|deposits?)|repair-order cash|deposits? & (?:bank )?reconcil)/i,
    prerequisites: ["The day's sales report", "Deposit slips and a deposit bag"],
    steps: [
      { text: "Count the drawer without looking at the expected total." },
      { text: "Ask a second person to count it again." },
      { text: "Compare the count with the day's sales report." },
      {
        text: "Record any over or short amount in the over-and-short log.",
        caution: "Never make up a shortage from the next day's cash or your own money.",
      },
      { text: "Fill in the deposit slip." },
      { text: "Seal the cash and slip in the deposit bag." },
      { text: "Take the bag to the bank the same or next business day." },
      { text: "Compare the bank's deposit amount with the slip when it appears online." },
    ],
    source: GREEN_BOOK_10,
    evidenceToKeep: [
      "Daily close report",
      "Deposit slip",
      "Variance log",
      ...RECEIPT_SETTLEMENT.evidence,
    ],
    ifYouCannotSeparate:
      "Someone who did not take the money ties out the deposits every week and reviews each variance.",
    // A nonprofit has no drawer or sales report: its cash is donations and
    // event receipts, counted against the donation log.
    wordingByIndustry: {
      nonprofit: {
        title: "Deposit donations and event receipts",
        purpose:
          "Gets donations and event receipts to the bank and shows any shortage the same day. Done when the bank's deposit matches the donation log and the event's receipts list.",
        trigger: "Each day donations arrive, and after each event",
        prerequisites: [
          "The donation log and the event's receipts list",
          "Deposit slips and a deposit bag",
        ],
        steps: [
          { text: "Count the cash and checks without looking at the expected total." },
          { text: "Ask a second person to count them again." },
          { text: "Compare the count with the donation log and the event's receipts list." },
          {
            text: "Record any over or short amount in the over-and-short log.",
            caution: "Never make up a shortage from the next day's money or your own.",
          },
          { text: "Fill in the deposit slip." },
          { text: "Seal the cash, checks and slip in the deposit bag." },
          { text: "Take the bag to the bank the same or next business day." },
          { text: "Compare the bank's deposit amount with the slip when it appears online." },
        ],
        evidenceToKeep: [
          "Donation log",
          "Deposit slip",
          "Variance log",
          ...RECEIPT_SETTLEMENT.evidence,
        ],
      },
    },
  },
  {
    id: "lib-mailed-checks",
    title: "Log mailed checks on arrival",
    purpose:
      "Makes a record of every check before anyone who posts or deposits it touches it, so a check that goes missing shows up against the log. Done when two people have logged each check and the log matches the bank deposit.",
    trigger: "Each day the mail arrives",
    cadence: "daily",
    dutyIds: ["collect_cash", "post_payments", "prepare_deposit"],
    covers: /\b(?:mail(?:ed)? (?:checks?|payments?|gifts?)|mail opening|gift processing)\b/i,
    prerequisites: ["A check log, on paper or in a spreadsheet", 'A "For deposit only" stamp'],
    steps: [
      { text: "Open the mail with a second person present." },
      { text: "Write each check's date, payer, check number and amount in the check log." },
      {
        text: 'Stamp the back of each check "For deposit only" as you log it.',
        caution: "Never set a check aside to log later.",
      },
      { text: "Ask the second person to initial each line of the check log." },
      { text: "Hand the checks to the person who prepares the deposit." },
      { text: "Send a copy of the check log to the person who reconciles the bank account." },
      {
        text: "Compare the check log with the bank deposit when it appears online.",
        caution: "Ask about any logged check missing from the deposit the same day.",
      },
    ],
    source: GREEN_BOOK_10,
    evidenceToKeep: ["Check log", "Deposit slip", "Bank deposit detail"],
    ifYouCannotSeparate:
      "If one person opens the mail alone: ask the bank about a lockbox, ask payers to pay electronically, and each month someone who does not open the mail compares the check log with the deposits.",
    wordingByIndustry: {
      nonprofit: {
        title: "Log mailed donation checks on arrival",
        purpose:
          "Makes a record of every donation check before anyone who enters or deposits it touches it, so a gift that goes missing shows up against the log. Done when two people have logged each check and the log matches the bank deposit and the donor database.",
        steps: [
          { text: "Open the mail with a second person present." },
          { text: "Write each check's date, donor, check number and amount in the check log." },
          {
            text: 'Stamp the back of each check "For deposit only" as you log it.',
            caution: "Never set a check aside to log later.",
          },
          { text: "Ask the second person to initial each line of the check log." },
          { text: "Hand the checks to the person who prepares the deposit." },
          {
            text: "Send a copy of the check log to the person who enters gifts in the donor database.",
          },
          {
            text: "Compare the check log with the bank deposit when it appears online.",
            caution: "Ask about any logged check missing from the deposit the same day.",
          },
          {
            text: "Compare the check log with the gifts entered in the donor database each month.",
          },
        ],
        evidenceToKeep: ["Check log", "Deposit slip", "Donor database gift report"],
      },
    },
  },
  {
    id: "lib-drawer-close",
    title: "Close out the cash drawer",
    purpose:
      "Shows any shortage at the end of each shift, while the person who ran the drawer is still there. Done when the count matches the register total or the difference is in the over-and-short log, and a second person has signed the count sheet.",
    trigger: "At the end of each shift, before the drawer leaves the register",
    cadence: "daily",
    // A nonprofit takes donations, not sales at a register; its cash is in
    // the deposit and mailed-check procedures.
    industries: [
      "dental",
      "retail",
      "restaurant",
      "professional_services",
      "construction",
      "automotive",
      "general",
    ],
    dutyIds: ["collect_cash"],
    covers: /\b(?:cash drawers?|drawer close|close out the drawer)\b/i,
    prerequisites: ["A blank count sheet", "Access to the register's end-of-shift total"],
    steps: [
      {
        text: "Count the cash, checks and card slips in the drawer.",
        caution:
          "Count before you print the register total, so the expected amount cannot steer the count.",
      },
      { text: "Write each amount on the count sheet." },
      { text: "Print the register's end-of-shift total." },
      { text: "Compare the count with the register total." },
      {
        text: "Record any over or short amount in the over-and-short log.",
        caution: "Never make up a shortage from the next shift's cash or your own money.",
      },
      { text: "Ask a second person to recount the cash and sign the count sheet." },
      { text: "Lock the cash and the count sheet in the safe until the deposit." },
    ],
    source: GREEN_BOOK_10,
    evidenceToKeep: ["Signed count sheets", "Register end-of-shift reports", "Over-and-short log"],
    ifYouCannotSeparate:
      "If one person runs and counts the drawer: count it with the next shift present, and each week someone who takes no cash compares the over-and-short log with the register reports.",
  },
  {
    id: "lib-refund-review",
    title: "Review refunds, voids and write-offs",
    purpose:
      "Finds refunds or write-offs that hide a diverted payment. Done when a second person who did not make them has checked each one.",
    trigger: "Every Monday, for the week before",
    cadence: "weekly",
    dutyIds: ["issue_refunds", "approve_writeoffs", "post_adjustments"],
    covers: /\b(?:refunds?|voids?|write-?offs?|adjustments?|markdowns?|comps?)\b/i,
    prerequisites: ["Access to the refunds, voids and adjustments report"],
    steps: [
      { text: "Run the refunds, voids and adjustments report for last week." },
      { text: "Read every refund, void and write-off on the report." },
      { text: "Check that each entry has a reason and an approval." },
      {
        text: "Ask the person who made any entry without a reason to explain it.",
        caution: "The reviewer must not be the person who made the refunds or adjustments.",
      },
      { text: "Sign and date the report." },
    ],
    source: GREEN_BOOK_10,
    evidenceToKeep: ["Refund register", "Void report", "Approval trail"],
    ifYouCannotSeparate:
      "A second person who issues no refunds reviews the monthly refund and void listing and initials the sample.",
  },
  {
    id: "lib-cycle-count",
    title: "Count part of the inventory",
    purpose:
      "Finds loss, theft and wrong quantities before they grow. Done when each counted item matches the system or a second person has approved its adjustment.",
    trigger: "Every week, a different section each time",
    cadence: "weekly",
    dutyIds: ["receive_goods"],
    covers: /\b(?:cycle counts?|inventory|parts count)\b/i,
    prerequisites: ["A count sheet for the section, printed without the quantities on hand"],
    steps: [
      { text: "Print the count sheet for this week's section without the quantities on hand." },
      { text: "Count each item on the sheet." },
      { text: "Compare each count with the quantity in the system." },
      { text: "Recount each item that differs." },
      {
        text: "Ask a second person to approve each adjustment before anyone enters it.",
        caution: "The person who counts must not also approve the adjustment.",
      },
      { text: "Enter the approved adjustments." },
    ],
    source: COMMON_PRACTICE,
    evidenceToKeep: ["Count sheets", "Adjustment report"],
    ifYouCannotSeparate:
      "Count everything at least once a year with a second person present who does not keep the stock.",
    // The lines of business whose stock turns fastest or costs most keep the
    // stricter counts the retired Operating blueprint set for them.
    ifYouCannotSeparateByIndustry: {
      retail:
        "Do a full count every quarter, with a second person present who does not keep the stock.",
      restaurant:
        "Count the food and drink every month, with a second person present who does not keep the stock.",
      construction:
        "Take an equipment and materials inventory every quarter, with a second person present who does not keep the stock.",
      automotive: "Someone outside the parts desk counts the parts every quarter.",
    },
  },
  {
    id: "lib-receiving",
    title: "Receive a delivery",
    purpose:
      "Pays only for goods that arrived. Done when you have entered the received quantities and sent them to accounts payable to match with the invoice.",
    trigger: "Whenever a delivery arrives",
    cadence: "ad-hoc",
    dutyIds: ["receive_goods", "order_supplies"],
    covers: /\breceiv(?:e|ing)\b/i,
    prerequisites: ["The purchase order for the delivery"],
    steps: [
      { text: "Count each item delivered before signing the delivery note." },
      { text: "Compare the count with the purchase order." },
      { text: "Note any short, extra or damaged item on the delivery note." },
      { text: "Enter the received quantities." },
      {
        text: "Send the receiving record to accounts payable to match with the invoice.",
        caution: "The person who ordered the goods must not be the only person who receives them.",
      },
    ],
    source: COMMON_PRACTICE,
    evidenceToKeep: ["Receiving log", "Delivery tickets"],
  },
  {
    id: "lib-leaver-access",
    title: "Remove a leaver's access",
    purpose:
      "Stops a former employee getting into systems, money or the building. Done when you have disabled every account and changed every shared code the person knew.",
    trigger: "On the person's last day, before they leave",
    cadence: "ad-hoc",
    dutyIds: ["manage_user_access", "pms_admin_roles"],
    covers:
      /\b(?:system admin\w*|software admin\w*|user access|access (?:rights|control)|pos admin)\b/i,
    prerequisites: ["Administrator access to each system", "The list of systems the person used"],
    steps: [
      { text: "List every system, card and key the person had." },
      { text: "Disable each of the person's accounts." },
      { text: "Remove the person from the bank's list of authorized users." },
      {
        text: "Change every shared password, door code and safe combination the person knew.",
        caution: "Write down where you keep each new code, never the code itself.",
      },
      { text: "Collect keys, access cards and company equipment." },
      { text: "Record the date you finished each item." },
    ],
    source:
      "NIST SP 800-53, control PS-4 (Personnel Termination): disable access and retrieve property when employment ends.",
    evidenceToKeep: [
      "Completed offboarding checklist",
      "Disabled-account list or screenshots",
      "Returned keys and cards log",
    ],
    ifYouCannotSeparate:
      "Twice a year, someone who is not a system administrator reviews the list of everyone's access.",
  },
  {
    id: "lib-backup-test",
    title: "Check the backups and test a restore",
    purpose:
      "Shows the business could get its records back after a failure or ransomware. Done when you have restored a file from backup and opened it.",
    trigger: "The first Monday of each quarter",
    cadence: "quarterly",
    dutyIds: ["manage_backups"],
    covers: /\b(?:backups?|restore|disaster recovery)\b/i,
    prerequisites: ["Access to the backup service or drive"],
    steps: [
      { text: "Open the backup service or drive." },
      { text: "Confirm the last backup finished within the past week." },
      { text: "Restore one recent file to a different folder." },
      {
        text: "Open the restored file to confirm it is complete.",
        caution: "Never restore over the working copy; restore to a different folder.",
      },
      { text: "Record the date, the file and the result." },
    ],
    source: "NIST SP 800-53, control CP-9 (System Backup), with a restore test to confirm it.",
  },
  {
    id: "lib-card-review",
    title: "Review the company card statement",
    purpose:
      "Finds personal or unauthorized card spending. Done when every charge has a receipt and a second person other than the cardholder has reviewed it.",
    trigger: "When the monthly card statement arrives",
    cadence: "monthly",
    dutyIds: ["review_card_statement", "hold_company_card", "approve_expenses"],
    covers:
      /\b(?:company cards?|credit cards?|card statements?|organi[sz]ation cards?|expense reports?)\b/i,
    prerequisites: ["The card statement", "The receipts for the month"],
    steps: [
      { text: "Match each charge on the statement to a receipt." },
      { text: "List each charge with no receipt or no business reason." },
      {
        text: "Ask the cardholder to explain each listed charge.",
        caution: "The reviewer must not be the cardholder.",
      },
      { text: "Sign and date the statement." },
    ],
    source: COMMON_PRACTICE,
    evidenceToKeep: ["Card statements", "Approval trail"],
    ifYouCannotSeparate: "A second person who holds no company card reviews every card statement.",
  },
  {
    id: "lib-payroll-bank-tie",
    title: "Tie the payroll register to the bank debit",
    purpose:
      "Catches money leaving as payroll that the register does not explain: a raise nobody approved, a person who does not work here, or pay sent under another name. Done when the bank's payroll debits equal the register's net pay and taxes and a second person has signed the comparison.",
    trigger: "After each payday, when the payroll debits appear in the bank's online transactions",
    cadence: "weekly",
    dutyIds: ["approve_payroll", "bank_reconcile"],
    covers: /\bpayroll\b/i,
    prerequisites: [
      "The payroll register for the pay period",
      "Read-only access to the bank's online transactions",
    ],
    steps: [
      { text: "Open the payroll register for the pay period." },
      { text: "Add up the net pay, the tax deposits and the provider's fee on the register." },
      { text: "Open the bank's online transactions for the days after payday." },
      { text: "Compare each payroll debit at the bank with the totals on the register." },
      {
        text: "List every debit that the register does not explain.",
        caution:
          "A payroll debit with no line on the register is money leaving under the name of payroll; stop and trace it the same day.",
      },
      { text: "Compare the number of people paid with the number of people who work here." },
      {
        text: "Check that each change to a bank account on the register has signed paperwork.",
        caution:
          "Pay going to a new account is how a leaver's pay or a second deposit reaches someone else; confirm every account change with the person.",
      },
      { text: "Sign and date the comparison." },
    ],
    source:
      "Common small-business practice, drawn from federal cases in which one person with payroll or direct-deposit rights moved money under other employees' names (U.S. Attorney's Office, W.D. Louisiana, 2019), raised their own pay (D. Virgin Islands; N.D. Indiana) or paid ghost employees through an outside payroll provider (D.C.), and nobody compared the payroll register with the bank debit. The U.S. Trustee Program's small-business guidance has the person in charge review every reconciliation an employee prepares; this comparison is the payroll half of that.",
    evidenceToKeep: ["Payroll register", "Bank payroll debits", "Signed comparison"],
    ifYouCannotSeparate:
      "If the person who runs payroll is the only one who can read the bank: give the person who runs the business read-only bank access and have them compare the payroll debits with the register total every payday, and ask the payroll provider to send its confirmation email to that person as well.",
  },
  {
    id: "lib-access-review",
    title: "Review who can do what in the books",
    purpose:
      "Keeps the power to add users, change roles and edit past entries with the person in charge, and finds edits nobody approved. Done when every user in the accounting system is a current person with the role their job needs, and a second person has read the audit log for the quarter.",
    trigger: "The first week of each quarter, and whenever someone joins, leaves or changes jobs",
    cadence: "quarterly",
    dutyIds: ["manage_user_access", "pms_admin_roles", "review_audit_logs"],
    covers: /\baccounting system\b|\bsystem admin\w*|\buser (?:roles|access)\b/i,
    prerequisites: [
      "Administrator access to the accounting system, or a printed user list from it",
      "The current staff list",
    ],
    steps: [
      { text: "Print the list of users and their roles from the accounting system." },
      { text: "Compare the list with the current staff list." },
      { text: "Remove every user who has left or no longer needs access." },
      {
        text: "Check that the primary administrator role belongs to the person who runs the business, not to the person who keeps the books.",
        caution:
          "The primary administrator can create users, change every role and edit bank rules; whoever holds it can hide what they do.",
      },
      { text: "Give the person who keeps the books a role that cannot manage users or payroll." },
      {
        text: "Invite the outside accountant as an accountant user rather than sharing a sign-in.",
      },
      { text: "Open the audit log for the quarter." },
      {
        text: "Read every deleted or voided transaction, every edited payee and every change to a bank rule or a user.",
        caution:
          "The audit log shows who changed what and when; a run of edits to past payments or payees is the trace a thief leaves.",
      },
      { text: "Ask the person who made each unexplained change to explain it." },
      { text: "Sign and date the user list and the audit-log notes." },
    ],
    source:
      "GAO Green Book, Principle 11: access rights match job need and management reviews them periodically. Intuit's guidance on user roles and the audit log in QuickBooks Online: only the primary admin can transfer that role, an in-house accountant role covers bookkeeping and reports but not payroll or user management, and the audit log keeps sign-ins, edits and deletions for two years, needs admin access and cannot be turned off. Federal cases (U.S. Attorney's Office, S.D. Illinois, 2017; D. Massachusetts, 2015) describe office managers who altered payees or coded stolen checks as expenses.",
    evidenceToKeep: ["User list with roles", "Audit-log review notes", "Sign-off"],
    ifYouCannotSeparate:
      "If the person who keeps the books is also the administrator: have the outside accountant sign in as an accountant user each quarter to print the user list and read the audit log, and have the person who runs the business hold the primary administrator sign-in even if they never use it.",
  },
  {
    id: "lib-journal-review",
    title: "Review manual journal entries",
    purpose:
      "Finds an entry that moves a loss, a theft or a personal expense into an account nobody reads. Done when a second person who posts no entries has read every manual journal entry for the month, with its support, and signed the list.",
    trigger: "After each month's close, before anyone signs the bank reconciliation",
    cadence: "monthly",
    // The bank reconciler is the natural reviewer, and the Penn guidance in
    // `source` pairs the two duties; a business where either is held sees it.
    dutyIds: ["post_journal_entries", "bank_reconcile"],
    covers: /\bjournal entr|\bgeneral ledger\b|\bmonth[- ]end close\b|\bmonthly close\b/i,
    prerequisites: [
      "The journal-entry report for the month",
      "The support for each entry: the invoice, statement or working that explains it",
    ],
    steps: [
      { text: "Run the report of manual journal entries for the month." },
      { text: "Read each entry's accounts, amount and description." },
      { text: "Match each entry to the invoice, statement or working that explains it." },
      { text: "List every entry with no support or with a description that does not say why." },
      {
        text: "List every entry that moves an amount out of cash, payroll or a customer's balance.",
        caution:
          "An entry that clears a cash difference, reduces a customer's balance or turns a payment into an expense is where someone hides a theft.",
      },
      {
        text: "Ask the person who posted each listed entry to explain it.",
        caution:
          "The reviewer must not be a person who posts journal entries or reconciles the bank.",
      },
      { text: "Sign and date the journal-entry report." },
    ],
    source: `${GREEN_BOOK_10} University of Pennsylvania internal-controls guidance lists reconciling bank accounts while booking the related general-ledger entries as a duty conflict, and has a supervisor initial and date each reconciliation. Federal cases (U.S. Attorney's Office, D. Massachusetts, 2015; S.D. Illinois, 2017) describe office managers who entered stolen checks as business expenses or altered payees in the books.`,
    evidenceToKeep: ["Journal-entry report", "Support for each entry", "Reviewer's sign-off"],
    ifYouCannotSeparate:
      "If the person who keeps the books is the only one who can read an entry: send the month's journal-entry report to the outside accountant with the bank reconciliation, and have the person who runs the business read every entry that touches cash or payroll.",
  },
  {
    id: "lib-new-vendor",
    title: "Set up and verify a new vendor before the first payment",
    purpose:
      "Stops payments to a vendor that does not exist, or that exists only on paper for an employee. Done when a second person has confirmed the vendor by a call to a number found independently, checked it against the vendor list and the staff list, and approved it.",
    trigger: "Whenever someone asks to add a vendor to the books or the payment system",
    cadence: "ad-hoc",
    dutyIds: ["create_vendor", "approve_vendor"],
    covers:
      /\b(?:vendor|supplier|subcontractor)s?\s*(?:&\s*\w+\s+)?(?:master|onboarding|set-?up|relationships?)\b|\bnew vendors?\b/i,
    prerequisites: [
      "The vendor's invoice, quote or contract",
      "The current vendor list and the staff list with addresses",
    ],
    steps: [
      {
        text: "Collect the vendor's legal name, address, phone number, tax identification number and bank details from its own invoice or contract.",
      },
      {
        text: "Search the vendor list for the same name, address, phone number or bank account.",
        caution:
          "A second record for an existing vendor is how a duplicate payment or a diverted payment starts.",
      },
      {
        text: "Compare the vendor's address and bank account with those of every employee.",
        caution:
          "A vendor whose address or bank account matches an employee's is a shell until proven otherwise.",
      },
      {
        text: "Look up the vendor's phone number yourself, from its website or a directory, not from the request.",
      },
      {
        text: "Call that number to confirm the vendor's name, address and bank details.",
        caution:
          "Never confirm by replying to the email or calling the number in the request; a criminal supplies both.",
      },
      { text: "Write down who you spoke to, the date and the number you called." },
      {
        text: "Send the record to a second person who sets up no vendors to approve.",
        caution: "The person who sets up vendors must not approve them or release their payments.",
      },
      { text: "Enter the vendor only once the approval is on file." },
    ],
    source:
      "Common accounts-payable control practice: the person who sets up a vendor does not approve it or release its payments, and someone confirms a new vendor's details by a call to a number found independently of the request. FBI guidance on business email compromise: look up the company's number yourself rather than use one the request supplies. A federal case (U.S. Attorney's Office, D. Minnesota) describes an operations director who made false vendor payments for years with nobody checking the vendors.",
    evidenceToKeep: ["New vendor form", "Call record", "Approval", "Approved vendor list"],
    ifYouCannotSeparate:
      "If one person sets up vendors and pays them: have the bank alert the person who runs the business to every new payee, and each month that person reads the list of vendors added, with the call record for each, before the month's payments go out.",
  },
  // By line of business.
  {
    id: "lib-controlled-count",
    title: "Count controlled drugs against the log",
    purpose:
      "Use this only where the office dispenses controlled drugs. Shows the practice can account for every one and finds a loss within the week. Done when each count matches the log and both counters have signed it.",
    trigger: "Every Friday at close, and on the biennial inventory date",
    cadence: "weekly",
    industries: ["dental"],
    dutyIds: [],
    covers: /\bcontrolled[- ](?:substances?|drugs?)\b/i,
    prerequisites: ["The controlled-substance log", "Access to the locked cabinet"],
    steps: [
      { text: "Open the locked cabinet with a second person present." },
      { text: "Count each controlled drug on hand with the second person watching." },
      { text: "Compare each count with the balance in the log." },
      {
        text: "Report any difference to the dentist in charge the same day.",
        caution:
          "The practice must report a theft or significant loss to the DEA in writing within one business day of discovery (21 CFR 1301.76(b)).",
      },
      { text: "Sign and date the log with the second person." },
    ],
    source:
      "21 CFR 1304.11 (a DEA registrant takes a complete controlled-substance inventory at least every two years) and 21 CFR 1301.76(b) (theft or loss reporting). Counting weekly is common practice, not a DEA rule.",
  },
  {
    id: "lib-trust-rec",
    title: "Reconcile the client trust account three ways",
    purpose:
      "Use this only when the firm holds client money. Shows each client's money is still there and nobody used it for another client or the firm. Done when the bank, the trust ledger and the client ledgers agree and a second person has signed.",
    trigger: "When the trust account's monthly statement arrives",
    cadence: "monthly",
    industries: ["professional_services"],
    dutyIds: ["bank_reconcile"],
    covers: /\btrust\b/i,
    prerequisites: ["The trust account's bank statement", "The trust ledger and client ledgers"],
    steps: [
      { text: "Download the trust account's bank statement for the month." },
      { text: "Adjust the bank balance for deposits in transit and uncleared checks." },
      { text: "Run the trust ledger balance for the statement date." },
      { text: "Total the balances of every client ledger for the same date." },
      {
        text: "Compare the three totals.",
        caution:
          "Never cover a difference with firm money or another client's funds; find the cause.",
      },
      {
        text: "List any client ledger with a negative balance.",
        caution:
          "A negative client balance means someone used another client's money; report it the same day.",
      },
      { text: "Give the reconciliation to a second person to review and sign." },
      { text: "Save the signed reconciliation with the statement." },
    ],
    source:
      "ABA Model Rule 1.15 (safekeeping property) and the ABA Model Rules on Client Trust Account Records, Rule 1, which calls for reconciliation at least quarterly and prefers monthly. State rules differ; follow your own state's.",
    evidenceToKeep: ["Three-way reconciliation", "Disbursement approvals"],
    ifYouCannotSeparate:
      "A partner who does not keep the books opens the trust account's bank statement each month.",
  },
  {
    id: "lib-tip-report",
    title: "Collect and record reported tips",
    purpose:
      "Gets each employee's tips into payroll so the business withholds and reports the right taxes. Done when you have entered every employee's reported tips for the period.",
    trigger: "At the end of each shift, and by the 10th of each month for the month before",
    cadence: "daily",
    industries: ["restaurant"],
    dutyIds: ["enter_payroll"],
    covers: /\btip/i,
    prerequisites: ["The point-of-sale tip report", "The written tip-pool rules"],
    steps: [
      { text: "Print each server's tip report at the end of the shift." },
      { text: "Ask each server to confirm the cash tips on their report." },
      { text: "Collect each server's signed report." },
      { text: "Compare the tip-pool payouts with the written tip-pool rules." },
      { text: "Enter the reported tips in payroll before the pay period closes." },
      {
        text: "Check by the 10th that every employee with $20 or more in cash tips last month has reported them.",
      },
    ],
    source:
      "IRS Publication 531 and Tax Topic 761: an employee who receives $20 or more in cash tips in a month reports them to the employer in writing by the 10th of the next month.",
    evidenceToKeep: ["Tip pool sheet", "POS tip report", "Payroll register"],
    ifYouCannotSeparate: "Reconcile the card tips with payroll every month.",
  },
  {
    id: "lib-lien-waiver",
    title: "Collect lien waivers before paying a subcontractor",
    purpose:
      "Use this only when the business pays a subcontractor or a supplier who can file a lien. Stops an unpaid subcontractor or supplier putting a lien on the client's property. Done when a waiver for each payment is on file with the job.",
    trigger: "Before each payment to a subcontractor or supplier",
    cadence: "ad-hoc",
    industries: ["construction"],
    dutyIds: ["release_payment"],
    covers: /\blien\b/i,
    prerequisites: ["Your state's lien waiver forms"],
    steps: [
      {
        text: "Ask the subcontractor for a conditional lien waiver for the amount of this payment.",
      },
      {
        text: "Check that the waiver names the job, the amount and the last date of work this payment covers.",
      },
      { text: "Check that the subcontractor's insurance certificate is current." },
      {
        text: "Release the payment only after the waiver is on file.",
        caution:
          "Never make a final payment without final waivers from the subcontractor and its suppliers.",
      },
      { text: "Collect the unconditional waiver once the payment clears." },
      { text: "File both waivers with the job." },
    ],
    source:
      "Common construction practice. Lien waiver forms and rules differ by state; use your state's forms.",
    evidenceToKeep: ["Pay applications", "Retainage schedule", "Waiver register"],
    ifYouCannotSeparate: "A second person reviews each pay application before it goes out.",
  },
  {
    id: "lib-restricted-gift",
    title: "Record a restricted gift or grant",
    purpose:
      "Spends each gift only as the donor allowed and shows it in the right net asset class. Done when you have recorded the gift with its restriction and released it only after the organization meets the donor's terms.",
    trigger: "Whenever a gift or grant arrives with a letter or agreement",
    cadence: "ad-hoc",
    industries: ["nonprofit"],
    dutyIds: [],
    covers: /\b(?:restricted|grants?)\b/i,
    prerequisites: ["The gift letter or grant agreement"],
    steps: [
      { text: "Read the gift letter or grant agreement for any limit on purpose or timing." },
      {
        text: "Record the gift as with donor restrictions when the donor limits its purpose or timing.",
        caution: "Never spend a restricted gift on a purpose the donor did not allow.",
      },
      { text: "Tag each payment from the gift with its restricted-fund code." },
      {
        text: "Move the amount to without donor restrictions once the organization meets the donor's purpose or time limit.",
      },
      { text: "Compare each restricted balance with the donor's terms every month." },
    ],
    source:
      "FASB ASU 2016-14 (ASC 958): an organization reports a gift with donor restrictions as net assets with donor restrictions and reclassifies it when the organization meets the restriction.",
    evidenceToKeep: ["Fund balance report", "Grant reports", "Board minutes"],
    ifYouCannotSeparate:
      "Every quarter, reconcile the restricted funds and report them to the board.",
  },
  {
    id: "lib-deal-jacket",
    title: "Audit deal jackets and title fees",
    purpose:
      "Use this only when the business sells vehicles. Shows each sold vehicle's paperwork is complete and each title fee collected reached the state. Done when you have checked and signed off every deal from last week.",
    trigger: "Every Monday, for the deals delivered the week before",
    cadence: "weekly",
    industries: ["automotive"],
    dutyIds: [],
    covers: /\b(?:deal jackets?|title)\b/i,
    prerequisites: ["The list of deals delivered last week", "The title fee remittance report"],
    steps: [
      { text: "List each deal delivered last week." },
      {
        text: "Check that each deal jacket holds the signed buyer's order, the title application and any lien payoff.",
      },
      {
        text: "Compare the title and registration fees collected with the fees sent to the state.",
      },
      {
        text: "List any fee collected but not sent.",
        caution:
          "Title fees collected belong to the state; never hold them or use them to run the business.",
      },
      { text: "Sign and date the audit log." },
    ],
    source: COMMON_PRACTICE,
    evidenceToKeep: ["Deal jacket checklist", "Remittance log", "Contracts-in-transit schedule"],
    ifYouCannotSeparate:
      "The dealer principal reviews the fees, payoffs and rebates on each deal every month.",
  },
  {
    id: "lib-platform-settlement",
    title: "Reconcile a delivery or marketplace payout",
    purpose:
      "Shows each delivery or marketplace payout equals its orders after fees and refunds. Done when the amount the platform paid matches the bank deposit and each difference has a cause.",
    trigger: "When a delivery or marketplace platform pays, and again at month end",
    cadence: "weekly",
    industries: ["retail", "restaurant"],
    dutyIds: ["prepare_deposit"],
    covers: /\b(?:delivery apps?|marketplace|platform payouts?)\b/i,
    prerequisites: ["The platform payout report", "The bank deposit for that payout"],
    steps: [
      { text: "Open the platform payout report for the period." },
      { text: "List the gross orders, the fees, the refunds and the amount paid." },
      { text: "Open the bank deposit for that payout." },
      { text: "Compare the amount paid with the bank deposit." },
      { text: "List each amount that differs." },
      {
        text: "Find the cause of each difference.",
        caution: "Never record the net deposit as the gross sales.",
      },
      { text: "Sign and date the comparison." },
    ],
    source:
      "Application control design: a platform payout is a settlement, not gross sales. Reconcile orders, fees, refunds and the deposit, and confirm the platform's payout report.",
    evidenceToKeep: ["Payout report", "Bank deposit", "Difference list"],
    ifYouCannotSeparate:
      "A second person who does not run the platform account compares each payout with the bank deposit every month.",
  },
  {
    id: "lib-certified-payroll",
    title: "Check certified payroll on a covered job",
    purpose:
      "Use this only when a contract requires certified payroll. Shows the hours and pay on that job match the payroll. Done when a second person signs the certified payroll for the week after the hours match the field records.",
    trigger: "Each pay week on a job that requires certified payroll",
    cadence: "weekly",
    industries: ["construction"],
    dutyIds: ["enter_payroll", "approve_payroll"],
    covers: /\bcertified payroll\b/i,
    prerequisites: ["The contract's certified-payroll requirement", "Field hours for the week"],
    steps: [
      { text: "Open the contract and confirm it requires certified payroll." },
      { text: "Collect each worker's hours on that job for the week." },
      { text: "Compare those hours with the payroll for the same week." },
      { text: "List each hour or rate that differs." },
      {
        text: "Correct each difference in the payroll.",
        caution: "Never sign certified payroll whose hours differ from the field records.",
      },
      { text: "Sign and date the certified payroll." },
      { text: "File the signed payroll with the job." },
    ],
    source:
      "U.S. Department of Labor, Davis-Bacon and Related Acts: a contractor on a covered federally funded or assisted construction contract submits weekly certified payroll (form WH-347). A job that is not covered skips this procedure. https://www.dol.gov/agencies/whd/government-contracts/construction",
    evidenceToKeep: ["Certified payroll", "Field hours", "Signed payroll"],
    ifYouCannotSeparate:
      "A second person who does not enter payroll compares the certified payroll with the field hours.",
  },
  {
    id: "lib-comp-void-review",
    title: "Review comps and voids by server and manager",
    purpose:
      "Finds sales voided or comped after the customer paid in cash, so that the cash can go missing. Done when a second person who makes no voids has read every void and comp from the day, by the person who made it, and signed the report.",
    trigger: "Every morning, for the day before",
    cadence: "daily",
    industries: ["restaurant"],
    dutyIds: ["approve_writeoffs", "post_adjustments"],
    covers: /\b(?:comps?|voids?|discounts?|over-?rings?|no[- ]sales?)\b/i,
    prerequisites: [
      "Access to the point-of-sale void, comp and discount reports",
      "The list of who may approve a void or comp",
    ],
    steps: [
      { text: "Run the voided items, voided payments and comps reports for yesterday." },
      {
        text: "Sort the voids and comps by the server who rang them and the manager who approved them.",
      },
      { text: "Check that each void or comp has a reason and a manager's approval." },
      {
        text: "List every void made after the customer paid.",
        caution:
          "Voids after a cash payment are how a manager keeps the cash; call the customer or match the receipt before accepting one.",
      },
      { text: "List any server or manager whose voids or comps run well above the rest." },
      {
        text: "Ask the person who made each unexplained void or comp to explain it.",
        caution: "The reviewer must not be a person who makes or approves voids.",
      },
      { text: "Sign and date the report." },
    ],
    source:
      "Point-of-sale control practice (for example Toast's exceptions reports and void rules): a void works only on the day of the sale, a later change is a refund, and the voided-items, voided-payments and no-sale reports list each one by employee. Police and court reports (Santa Rosa, California, 2025; Connecticut; Oklahoma; Oregon) describe managers who voided or discounted tickets after cash payment and kept the cash, found when an owner read the void report or detectives called the customers.",
    evidenceToKeep: [
      "Voided items report",
      "Voided payments report",
      "Comp report by employee",
      "Reviewer's sign-off",
    ],
    ifYouCannotSeparate:
      "If the one manager both approves voids and reviews them: set the point-of-sale system to require a manager code and a reason on every void and comp, and each week someone who works no shifts on the floor, for example the person who keeps the books, reads the void and comp report by employee.",
  },
  {
    id: "lib-pos-deposit-tie",
    title: "Tie the day's register sales to the bank deposit",
    purpose:
      "Shows that the cash the point-of-sale system says the restaurant took reached the bank. Done when each day's recorded cash deposit matches the bank's deposit for that day and every difference has a cause written next to it.",
    trigger: "Each morning for the day before, by someone who did not count or bank the cash",
    cadence: "daily",
    industries: ["restaurant"],
    dutyIds: ["bank_reconcile", "post_payments"],
    covers: /\bdaily sales deposit\b|\bsales deposit/i,
    prerequisites: [
      "Read-only access to the bank's online transactions",
      "The point-of-sale cash drawer history or deposit report",
    ],
    steps: [
      { text: "Open the point-of-sale deposit report for yesterday." },
      { text: "Open the bank's online transactions for the same day." },
      {
        text: "Compare the deposit the point-of-sale system recorded with the deposit the bank received.",
      },
      { text: "Compare the card sales total with the processor's deposit, allowing for its fees." },
      {
        text: "Write each difference on the tie-out sheet with its date and amount.",
        caution: "Never adjust the sales figure to match the bank; find out where the cash went.",
      },
      { text: "Ask the person who closed the drawers about each difference the same day." },
      { text: "Sign and date the tie-out sheet." },
    ],
    source:
      "Restaurant control checklists from CPA firms (Plante Moran, 2024; BTCPA): the person who runs the register or handles the cash does not reconcile the day's sales to the deposit. Toast's cash-deposit guide: the deposit is the last cash operation of the day, leaves the starting balances in the drawers, and appears in the drawer history report to check against the bank deposit slip.",
    evidenceToKeep: ["Point-of-sale deposit report", "Bank deposit detail", "Tie-out sheet"],
    ifYouCannotSeparate:
      "If the person who banks the cash is the only one who can check it: give the person who runs the business read-only bank access and have them compare each day's point-of-sale cash total with the bank's deposit once a week, and ask the bank for a deposit alert on that account.",
  },
  {
    id: "lib-delivery-check",
    title: "Check a food or drink delivery against the order and the invoice",
    purpose:
      "Pays only for what arrived, at the price agreed. Done when someone other than the person who ordered has counted the delivery and noted every shortage on the ticket, and the office has matched the ticket to the invoice before entering it for payment.",
    trigger: "Whenever a vendor delivers food, drink or supplies",
    cadence: "ad-hoc",
    industries: ["restaurant"],
    dutyIds: ["receive_goods", "order_supplies", "enter_invoices"],
    covers: /\bfood vendor ordering\b|\bvendor ordering\b|\bdeliver(?:y|ies)\b/i,
    prerequisites: [
      "The order or standing-order sheet for the vendor",
      "A scale for items sold by weight",
    ],
    steps: [
      { text: "Count or weigh each item on the delivery ticket before signing it." },
      { text: "Compare each count and weight with the order." },
      { text: "Check the quality and temperature of anything perishable." },
      {
        text: "Write every short, damaged or refused item on the delivery ticket before the driver leaves.",
      },
      { text: "Ask the vendor for a credit memo for each short or refused item." },
      { text: "Send the signed ticket to the office the same day." },
      {
        text: "Match the invoice to the signed ticket and the order before entering it.",
        caution:
          "The person who placed the order must not be the only person who signs for it or approves its invoice.",
      },
      { text: "Enter the invoice at the ticket's quantities, less any credit due." },
    ],
    source:
      "Restaurant control guidance from CPA firms (BTCPA's lender-audit checklist) and receiving-control practice: the person who orders does not also receive the goods and approve the payment, and the office matches order, delivery ticket and invoice before paying. Forensic accountants (FSR Magazine) note that vendors inflate bills for more or pricier items than delivered when nobody tracks daily deliveries, and that kickbacks hide behind spoilage write-offs.",
    evidenceToKeep: ["Signed delivery tickets", "Credit memos", "Matched invoices"],
    ifYouCannotSeparate:
      "If one person orders, receives and codes the bills: rotate who signs for deliveries week by week, and each month someone who places no orders picks five invoices and compares them with their delivery tickets and with the order.",
  },
  {
    id: "lib-pour-cost",
    title: "Count the bar and work out the pour cost",
    purpose:
      "Finds drinks poured but never rung in, and bottles that left the building. Done when two people have counted every bottle, the week's pour cost comes from the count rather than from purchases, and every variance has a cause.",
    trigger: "Every Monday before the bar opens, for the week before",
    cadence: "weekly",
    industries: ["restaurant"],
    dutyIds: ["receive_goods", "order_supplies"],
    covers: /\bliquor\b|\bbar (?:inventory|stock)\b|\bpour cost\b/i,
    prerequisites: [
      "A count sheet listing every bottle and keg, printed without last week's counts",
      "Last week's liquor purchases and point-of-sale drink sales",
    ],
    steps: [
      {
        text: "Count every bottle and keg on the count sheet, with a second person who does not work the bar.",
      },
      { text: "Enter the counts on the inventory sheet." },
      { text: "Add last week's purchases to last week's closing count." },
      { text: "Subtract this week's count from that total to get the drink the bar used." },
      { text: "Price the drink used at cost." },
      { text: "Divide that cost by the week's drink sales to get the pour cost." },
      { text: "Compare the drink used with the drinks the point-of-sale system rang up." },
      {
        text: "List every product whose count differs from what the sales explain.",
        caution:
          "Never adjust the count to match the sales; the gap between the drink the bar used and the drinks it rang up is the loss you are looking for.",
      },
      { text: "Ask the bar manager to explain each variance." },
      { text: "Sign the count sheet with the second person." },
    ],
    source:
      "Bar-management practice (for example Sculpture Hospitality's and Restroworks' pour-cost guides): pour cost comes from inventory movement, opening count plus purchases minus closing count, not from purchases alone, and variance is what the bar poured against what it rang up. Restaurant forensic guidance (FSR Magazine; Porte Brown) has staff independent of the storeroom take the counts and compares expected usage from sales with actual usage.",
    evidenceToKeep: ["Signed count sheets", "Pour-cost worksheet", "Variance list"],
    ifYouCannotSeparate:
      "If the bar manager is the only person who can count: have the person who runs the business or a cook count the bar with them once a month, and have someone who places no liquor orders compare each week's pour cost with the week before.",
  },
  {
    id: "lib-change-order",
    title: "Approve and bill a change order",
    purpose:
      "Keeps extra work from going unbilled, and keeps a project manager from pricing a change with a subcontractor for a kickback. Done when the client has signed the change order before the work starts, a second person has approved its price, and the contract value and the billing carry it.",
    trigger: "Whenever the scope, price or schedule of a job changes",
    cadence: "ad-hoc",
    industries: ["construction"],
    dutyIds: ["submit_claims", "approve_invoices"],
    covers: /\bchange[- ]orders?\b/i,
    prerequisites: [
      "The signed contract and its schedule of values",
      "The change-order log for the job",
    ],
    steps: [
      {
        text: "Write the change order with the scope, the price and the days added to the schedule.",
      },
      { text: "Attach the subcontractor's or supplier's quote for the extra work." },
      {
        text: "Give the change order to a second person who did not negotiate it to check the price against the contract rates.",
        caution:
          "The project manager who negotiated a change with a subcontractor must not be the person who approves it.",
      },
      { text: "Send the change order to the client for signature." },
      {
        text: "Start the extra work only once the client has signed.",
        caution: "Work done on a verbal change is the usual cause of a bill the client disputes.",
      },
      {
        text: "Enter the signed change order in the change-order log with its number and date.",
      },
      { text: "Add the amount to the contract value in the job cost system." },
      { text: "Add the change order as its own line on the next progress bill." },
      { text: "Update the estimated cost to complete for the job." },
    ],
    source:
      "Construction control practice (for example eSub's guide to construction fraud): obtain the client's signature on every change order before work begins and revise the contract value, and the person who originates a change does not approve it. Two federal cases (U.S. Attorney's Office, E.D. Missouri, 2013; D. Connecticut, 2022) involved a project manager and a subcontractor who inflated change orders for the project manager's benefit. Unapproved change orders are a common pay-application error and a cause of underbillings (Baker Tilly).",
    evidenceToKeep: ["Signed change orders", "Change-order log", "Second person's price approval"],
    ifYouCannotSeparate:
      "If one person negotiates, approves and bills change orders: have the person who runs the business sign every change order above a set amount before the work starts, and each month compare the change-order log with the billings and with the subcontractor invoices on the same job.",
  },
  {
    id: "lib-progress-bill",
    title: "Prepare the progress bill and track retainage",
    purpose:
      "Bills the client for the work in place each month and keeps track of the money the client holds back. Done when the bill matches the schedule of values, a second person has checked it, and the retainage schedule shows what each client still holds.",
    trigger: "On each job's billing date, usually the 25th of the month",
    cadence: "monthly",
    industries: ["construction"],
    dutyIds: ["submit_claims", "post_payments"],
    covers: /\bpay applications?\b|\bprogress bill(?:ing)?s?\b|\bretainage\b/i,
    prerequisites: [
      "The contract's schedule of values and retainage rate",
      "The superintendent's report of work in place and stored materials",
    ],
    steps: [
      {
        text: "Update the percent complete for each line of the schedule of values from the superintendent's report.",
      },
      { text: "Add the stored materials the contract allows you to bill." },
      {
        text: "Include only change orders the client has signed.",
        caution: "A change order without the client's signature does not belong on the bill.",
      },
      { text: "Compute the retainage at the contract rate on the work completed to date." },
      { text: "Subtract the retainage and the amounts billed before to get the amount due." },
      {
        text: "Check that the line totals on the schedule of values equal the total on the bill's front page.",
      },
      {
        text: "Give the bill to a second person who did not prepare it to check before it goes to the client.",
      },
      { text: "Send the bill to the client or the architect for certification." },
      { text: "Record the retainage the client holds on the retainage schedule for the job." },
      {
        text: "Update the retainage schedule each month with the amounts billed, released and still held.",
        caution:
          "Retainage is money the business has earned; follow it until the client releases it.",
      },
    ],
    source:
      "AIA pay-application practice: the schedule of values (G703) carries each line's work completed and stored materials, the application (G702) applies retainage and subtracts prior payments, and the architect or client certifies it before payment moves. Mismatched totals, miscalculated retainage and unapproved change orders are the usual errors that send a pay application back. Retainage the client holds is a receivable to track until release (New York Office of the State Comptroller, Accounting for retained percentages).",
    evidenceToKeep: [
      "Pay applications",
      "Schedule of values",
      "Retainage schedule",
      "Second person's check",
    ],
    ifYouCannotSeparate:
      "If one person prepares the bill and posts the client's payment: have the person who runs the business compare each month's bills with the superintendent's reports, and compare the retainage schedule with the contracts every quarter.",
  },
  {
    id: "lib-sub-payment",
    title: "Pay a subcontractor after the checks",
    purpose:
      "Pays a subcontractor only for work in place, under the subcontract, with the waivers on file. Done when someone other than the project manager has checked the invoice, the lien waiver is on file, the business has withheld the retainage and a second person has approved the payment.",
    trigger: "When a subcontractor's invoice or pay application arrives",
    cadence: "monthly",
    industries: ["construction"],
    dutyIds: ["approve_invoices", "release_payment"],
    covers: /\bsubcontractor/i,
    prerequisites: [
      "The subcontract and its schedule of values",
      "The project manager's record of work in place",
    ],
    steps: [
      { text: "Compare the invoice with the subcontract and its schedule of values." },
      {
        text: "Ask the project manager to confirm in writing the percent of work in place on each line.",
      },
      {
        text: "Give the invoice to a person who is not the project manager to check the amount against the subcontract and the work in place.",
        caution:
          "A project manager who approves a subcontractor's invoices alone can inflate them with the subcontractor for a kickback.",
      },
      { text: "Withhold the retainage at the rate in the subcontract." },
      { text: "Check that the conditional lien waiver for this amount is on file." },
      { text: "Check that the subcontractor's insurance certificate has not expired." },
      { text: "Send the invoice with the checks to a second person to approve the payment." },
      {
        text: "Pay by check or electronic transfer, never in cash.",
        caution: "A cash payment leaves nothing to match to a waiver or a job.",
      },
      {
        text: "File the approved invoice, the project manager's confirmation and the waiver with the job.",
      },
    ],
    source:
      "Construction CPA guidance (LBMC; Yeo & Yeo): have an employee other than the project manager review supplier and subcontractor invoices, and require two approvals on every check or electronic payment. Corpay's subcontractor-payment guide: waiver gating, retainage tracking and approval routing on each payment matter more than the payment method, and cash leaves no record to tie to a waiver. In the federal change-order cases (E.D. Missouri, 2013; D. Connecticut, 2022) the project manager who approved the subcontractor's invoices was the one the subcontractor paid.",
    evidenceToKeep: [
      "Subcontractor invoices",
      "Project manager's work-in-place confirmation",
      "Payment approvals",
    ],
    ifYouCannotSeparate:
      "If the project manager is the only person who knows what the subcontractor did: have the person who runs the business approve every subcontractor payment, walk the job before approving the larger ones, and compare the subcontractor's billings to date with the subcontract value each month.",
  },
  {
    id: "lib-job-cost-review",
    title: "Review the job-cost report against the estimate",
    purpose:
      "Catches costs charged to the wrong job, estimates that no longer hold and jobs billed behind their costs, before year end. Done when someone has compared every open job's cost with its estimate by cost code, approved each cost transfer in writing and explained each underbilling.",
    trigger: "After each month's close, before the 15th",
    cadence: "monthly",
    industries: ["construction"],
    dutyIds: ["post_journal_entries"],
    covers: /\bjob cost|\bestimating\b/i,
    prerequisites: [
      "The job-cost report by cost code for every open job",
      "The current estimate for each job, including signed change orders",
      "The list of cost transfers between jobs for the month",
    ],
    steps: [
      { text: "Run the job-cost report by cost code for every open job." },
      { text: "Compare the cost to date on each cost code with its estimate." },
      { text: "List every cost code whose cost to date exceeds its estimate." },
      { text: "List every cost transfer between jobs made during the month." },
      {
        text: "Ask for a written reason and an approval for each transfer.",
        caution:
          "A cost moved from a losing job to a winning one hides the loss and can hide a theft; approve each transfer in writing.",
      },
      {
        text: "Update the estimated cost to complete on each job where the costs say the estimate is wrong.",
      },
      { text: "List each job billed for less than its cost to date." },
      {
        text: "Write the reason next to each underbilled job.",
        caution:
          "An underbilling that lasts more than a month points to missed billing, an unapproved change order or an estimate that is too low.",
      },
      { text: "Give the report to the person who runs the business to read and sign." },
    ],
    source:
      "Construction control practice (eSub): compare job-cost estimates with actuals and require approval for cost adjustments or transfers between jobs. Construction CPA guidance (Baker Tilly; HBK; Construction Executive): the work-in-progress schedule, with each job's costs to date, estimated cost to complete, percent complete and over- or underbillings, is a monthly management tool, not a year-end schedule; persistent underbillings point to billing problems, unapproved change orders or an overstated profit estimate, and sureties and lenders read those lines.",
    evidenceToKeep: [
      "Job-cost report",
      "Cost transfer approvals",
      "Over- and underbilling schedule",
      "Sign-off",
    ],
    ifYouCannotSeparate:
      "If the person who enters job costs is the only one who reads the report: send the job-cost report and the list of transfers each month to the person who runs the business or the outside accountant, who compares each job with its estimate and asks about every transfer.",
  },
];

/** A recommended procedure as it fits this business: why it is shown, and what it would cover. */
export interface LibraryRow {
  recommendation: RecommendedProcedure;
  /** Register items it would cover here. */
  knowledgeIds: string[];
  /** People here who hold one of its duties. */
  heldBy: string[];
  /** Someone here holds one of its duties or its work is on the register. */
  fits: boolean;
}

/**
 * The business's own procedure that writes a recommendation, when it has
 * one: the procedure started from it (it carries the `libraryId`), or else,
 * when every register item the recommendation matches already has a
 * procedure, the one for the first of those items. `own` holds the
 * business's procedures for its line of business.
 */
export function writtenProcedure<P extends Pick<Procedure, "libraryId" | "knowledgeIds">>(
  recommendation: Pick<RecommendedProcedure, "id" | "covers">,
  own: readonly P[],
  knowledge: readonly Pick<KnowledgeItem, "id" | "name">[],
): P | undefined {
  const started = own.find((p) => p.libraryId === recommendation.id);
  if (started) return started;
  const matched = knowledge.filter((k) => recommendation.covers.test(k.name));
  if (matched.length === 0) return undefined;
  const coverFor = matched.map((k) => own.find((p) => p.knowledgeIds.includes(k.id)));
  return coverFor.every(Boolean) ? coverFor[0] : undefined;
}

/**
 * The recommended procedures for this line of business that are not already
 * written (writtenProcedure), each with what it would cover here. Ordered:
 * those covering register items, then those whose duty someone holds, then
 * the rest.
 */
export function libraryRows(
  tpl: Pick<IndustryTemplate, "people" | "knowledge" | "roleTemplates">,
  procedures: readonly Pick<Procedure, "libraryId" | "industry" | "knowledgeIds">[],
  industry: IndustryId,
): LibraryRow[] {
  const own = procedures.filter((p) => p.industry === industry);
  const written = new Set(own.flatMap((p) => p.knowledgeIds));
  const active = tpl.people.filter((p) => p.active);
  const rows: LibraryRow[] = [];
  for (const shared of RECOMMENDED_PROCEDURES) {
    if (shared.industries && !shared.industries.includes(industry)) continue;
    const recommendation = recommendationFor(shared, industry);
    if (writtenProcedure(recommendation, own, tpl.knowledge)) continue;
    const knowledgeIds = tpl.knowledge
      .filter((k) => recommendation.covers.test(k.name) && !written.has(k.id))
      .map((k) => k.id);
    const duties = new Set<string>(recommendation.dutyIds);
    const heldBy = active
      .filter((p) => personDuties(p, tpl.roleTemplates).some((d) => duties.has(d)))
      .map((p) => p.id);
    rows.push({
      recommendation,
      knowledgeIds,
      heldBy,
      fits: heldBy.length > 0 || knowledgeIds.length > 0,
    });
  }
  const rank = (r: LibraryRow) => (r.knowledgeIds.length ? 0 : r.heldBy.length ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b));
}

/**
 * A new procedure started from a recommendation: its purpose, trigger,
 * prerequisites and duties filled in, its steps marked as suggestions, linked
 * to the register items it covers here, with the first person who holds its
 * duty as the one who does it today. It keeps the recommendation's fallback
 * for this line of business, its evidence to keep and its source, so the
 * reviewer still has them after the start.
 */
export function procedureFromLibrary(
  row: LibraryRow,
  industry: IndustryId,
  today: string,
): Procedure {
  const r = row.recommendation;
  const fallback = ifYouCannotSeparateFor(r, industry);
  return newProcedure(
    {
      industry,
      title: r.title,
      libraryId: r.id,
      purpose: r.purpose,
      trigger: r.trigger,
      ...(fallback ? { fallback } : {}),
      ...(r.evidenceToKeep?.length ? { evidenceToKeep: [...r.evidenceToKeep] } : {}),
      source: r.source,
      cadence: r.cadence,
      prerequisites: [...r.prerequisites],
      ...(r.dutyIds.length ? { dutyIds: [...r.dutyIds] } : {}),
      knowledgeIds: [...row.knowledgeIds],
      ...(row.heldBy[0] ? { ownerPersonId: row.heldBy[0] } : {}),
      steps: r.steps.map((s) => ({
        ...newStep(s.text),
        ...(s.caution ? { caution: s.caution } : {}),
        suggested: true as const,
      })),
    },
    today,
  );
}
