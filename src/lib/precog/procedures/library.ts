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
  // Dental. The large federal cases are intercepted insurer checks; the
  // frequent small ones are skimmed co-pays hidden by an adjustment and card
  // refunds to an employee's own card. The dentist is the independent reader.
  {
    id: "lib-day-sheet-deposit",
    title: "Tie the day sheet to the deposit",
    purpose:
      "Shows that every payment posted in the practice software reached the bank, and that no adjustment hid a payment someone kept. Done when the day sheet, the deposit slip and the card batch agree and a person who posted nothing that day has signed them.",
    trigger: "At the end of each clinical day, before the deposit leaves the office",
    cadence: "daily",
    industries: ["dental"],
    dutyIds: ["post_payments", "prepare_deposit"],
    covers: /\bday sheets?\b|\bdaily deposit\b/i,
    prerequisites: [
      "The day sheet from the practice software",
      "The deposit slip and the card terminal's batch report",
    ],
    steps: [
      { text: "Print today's day sheet from the practice software." },
      {
        text: "Match each cash and check payment on the day sheet to the cash and checks in the deposit.",
      },
      { text: "Match each card payment on the day sheet to the card terminal's batch report." },
      {
        text: "List every payment on the day sheet with no cash, check or card line behind it, and every deposit line with no payment.",
        caution:
          "A payment posted with nothing behind it, or a deposit short of the day sheet, is the first sign of skimming; ask about it today.",
      },
      { text: "Read each adjustment on the day sheet and the reason written on the account." },
      { text: "Ask the person who posted any adjustment without a reason to explain it." },
      {
        text: "Give the day sheet, the deposit slip and the batch report to a person who posted nothing today to sign.",
      },
      { text: "Staple the bank's deposit receipt to the day sheet when it comes back." },
    ],
    source:
      "American Dental Association, Protecting Your Dental Office From Fraud and Embezzlement, as summarized in ADA News (March 2016): review every posted transaction on the day sheet and compare the check register with the daily deposit slip. American Academy of Pediatric Dentistry, Practice Management newsletter (September 2014): every adjustment carries a stated reason, and the doctor checks the adjustments on the day sheet at the end of each day.",
    evidenceToKeep: [
      "Signed day sheet",
      "Deposit slip and bank deposit receipt",
      "Card batch report",
    ],
    ifYouCannotSeparate:
      "If one person posts payments and makes the deposit: bank the money every day so each deposit matches one day sheet, and each week the dentist compares the deposits online with the day sheets and reads the adjustments.",
  },
  {
    id: "lib-eob-posting",
    title: "Post an insurance payment from the explanation of benefits",
    purpose:
      "Keeps the insurer's check out of the hands of the person who posts it, and posts only the write-off the insurer's statement allows. Done when the payment and the contractual write-off match the explanation of benefits and a paper check is in the check log.",
    trigger: "Whenever an insurer's check, electronic payment or explanation of benefits arrives",
    cadence: "ad-hoc",
    industries: ["dental"],
    dutyIds: ["post_payments", "post_adjustments"],
    covers: /\binsurance (?:denials?|payments?|claims?)\b|\bexplanations? of benefits\b/i,
    prerequisites: [
      "The explanation of benefits for the payment",
      "The check log, for a paper check",
    ],
    steps: [
      { text: "Confirm that a paper check is in the check log before you post anything." },
      { text: "Open the claim the explanation of benefits refers to." },
      { text: "Post the amount the insurer paid to that claim." },
      {
        text: "Post the contractual write-off as the difference between the fee and the amount the plan allows, with the insurer's reason.",
        caution:
          "Never write off a balance you billed to an insurer to make an account match; the AAPD warns that this is insurance fraud.",
      },
      {
        text: "Check whether a second plan already paid or will pay on the same claim before you post the write-off.",
        caution:
          "With two plans, a write-off posted after each payment gives the patient a credit nobody owes them.",
      },
      {
        text: "Send the patient a statement for any portion the explanation of benefits leaves to them.",
      },
      {
        text: "File the explanation of benefits with the day's posting, marked with the claim number.",
      },
      {
        text: "Give the week's explanations of benefits to a person who posts no payments to compare with the check log and the deposits.",
      },
    ],
    source:
      "American Dental Association, How to read your Explanation of Benefits statement (a write-off posted after each of two plans pays can give the patient a false credit) and its fraud guidance in ADA News (March 2016): look at every check and explanation of benefits, and keep patient payments and bank deposits in different hands. American Academy of Pediatric Dentistry, Practice Management newsletter (September 2014): adjusting off a balance billed to an insurer is insurance fraud.",
    evidenceToKeep: [
      "Explanation of benefits with the claim number",
      "Check log",
      "Weekly comparison sign-off",
    ],
    ifYouCannotSeparate:
      "If one person opens the mail, posts the insurer's payment and makes the deposit: ask each insurer to pay electronically into the practice's account, and each month the dentist compares the insurer payments posted in the practice software with the bank's deposits.",
  },
  {
    id: "lib-patient-refund",
    title: "Refund a patient's credit balance",
    purpose:
      "Pays back only money a patient really overpaid, to the patient and never to an employee's card. Done when the refund goes to the card or account that paid, the ledger printout and the dentist's approval sit behind it, and the month's merchant statement shows no other refund.",
    trigger:
      "Whenever a patient's ledger shows a credit balance, and on the monthly credit-balance review",
    cadence: "ad-hoc",
    industries: ["dental"],
    dutyIds: ["issue_refunds", "post_adjustments"],
    covers: /\bpatient refunds?\b|\bcredit balances?\b|\bmerchant statements?\b/i,
    prerequisites: [
      "The patient's ledger printout",
      "The merchant account statement for the month",
    ],
    steps: [
      { text: "Print the patient's ledger showing the credit balance." },
      {
        text: "Find the entry that created the credit: a duplicate payment, a second plan's payment or a wrong adjustment.",
      },
      {
        text: "Correct a wrong adjustment or posting instead of refunding it.",
        caution:
          "A credit that comes from a wrong write-off is an error to reverse, not money to pay out.",
      },
      { text: "Write the refund request with the ledger printout attached." },
      {
        text: "Ask the dentist to approve the refund against the ledger printout.",
        caution: "The person who approves the refund must not be the person who processes it.",
      },
      {
        text: "Send the refund to the card or account that made the payment.",
        caution:
          "Never refund to a different card or to cash; a refund to an employee's own card is the commonest small dental theft on record.",
      },
      { text: "File the approval, the ledger printout and the refund receipt together." },
      {
        text: "Give the month's merchant statement to the dentist to trace each refund on it to a patient's ledger.",
      },
    ],
    source:
      "American Academy of Pediatric Dentistry, Practice Management newsletter (September 2014): the doctor reviews the merchant account statement each month. Dental Economics, Keeping them out of the cookie jar: supporting documentation accompanies every refund request, and the signer compares each check against it. Baird Dental, via Dentaltown: false credit balances come from errors in secondary insurance, adjustments, payments or services, so someone other than the front desk runs the monthly credit-balance review.",
    evidenceToKeep: [
      "Refund request with ledger printout",
      "Dentist's approval",
      "Merchant statement with each refund traced",
    ],
    ifYouCannotSeparate:
      "If one person finds the credit and sends the refund: each month the dentist reads every refund on the merchant statement and the credit-balance report, and traces each refund to a patient's ledger and the card that paid.",
  },
  {
    id: "lib-audit-trail-review",
    title: "Review the practice software audit trail",
    purpose:
      "Finds deleted payments, altered entries and changed user rights that a day sheet never shows. Done when a person who posts nothing has read the month's audit trail and signed it.",
    trigger: "The first week of each month, for the month before",
    cadence: "monthly",
    industries: ["dental"],
    dutyIds: ["review_audit_logs", "pms_admin_roles"],
    covers: /\bpractice software\b|\baudit trails?\b/i,
    prerequisites: [
      "A sign-in with the permission to view the audit trail",
      "The list of users and their permission groups",
    ],
    steps: [
      {
        text: "Confirm that every person who uses the practice software has their own user account.",
      },
      { text: "Run the audit trail report for last month." },
      {
        text: "List every deleted payment, deleted account and edited adjustment, with the user who made it.",
      },
      {
        text: "Ask that user to show the paper or the ledger entry behind each one.",
        caution:
          "A deleted or reduced payment with a matching write-off is the classic concealment; take it to the dentist the same day.",
      },
      {
        text: "Compare the list of users who can delete or adjust with the list of people whose job needs it.",
      },
      {
        text: "Remove the delete and adjust permissions from any user whose job does not need them.",
      },
      { text: "Sign and date the audit trail report." },
    ],
    source:
      "Open Dental manual, Audit Trail: the log is complete only when every user has their own account, only users with the Audit Trail permission can view it, and nobody changes an entry. DentiMax, Prevent dental employee embezzlement: restrict the audit report to the highest administrative level, run and review it monthly, and look for deletions of payments, account balances or whole accounts.",
    evidenceToKeep: ["Signed audit trail report", "User permission list"],
    ifYouCannotSeparate:
      "If the person who posts payments also administers the practice software: give the dentist the only sign-in that can view the audit trail and change permissions, and the dentist reads the audit trail each month.",
  },
  // Automotive. The repair order is the control document: every payment in
  // and every part out ties to one, and deleted or open orders are the two
  // exception reports. No repair-industry association publishes a controls
  // standard, so these follow trade press, vendor help and the cases.
  {
    id: "lib-ro-exception-review",
    title: "Review deleted, voided and open repair orders",
    purpose:
      "Catches cash collected on a repair order that someone then deleted, and work paid for that stays open so the payment never shows. Done when each deleted or voided order from the week has a reason and an approver, and each open order older than the set age has an explanation.",
    trigger: "Every Monday, for the week before",
    cadence: "weekly",
    industries: ["automotive"],
    dutyIds: ["approve_writeoffs", "review_audit_logs"],
    covers: /\brepair[- ]orders?\b|\bDMS\b/i,
    prerequisites: [
      "The shop system's deleted and voided repair order report",
      "The open repair order list with each order's age",
    ],
    steps: [
      { text: "Run the deleted and voided repair order report for last week." },
      {
        text: "Read each deleted or voided order's customer, vehicle, amount and the user who removed it.",
      },
      { text: "Match each one to its reason and to the person who approved the deletion." },
      { text: "Check the parts bought for any deleted order against the part's purchase order." },
      {
        text: "Ask the service advisor about any deleted order with no reason, or with parts bought and no sale.",
        caution:
          "Cash collected and the order deleted is how a counter employee takes money in case after case; raise it the same day.",
      },
      { text: "Run the open repair order list sorted by age." },
      {
        text: "Ask the advisor on each order open longer than the set number of days whether the customer paid.",
        caution:
          "An order left open after the customer paid hides the payment; close it only against the receipt the customer holds.",
      },
      { text: "Sign and date both reports." },
    ],
    source:
      "WickedFile, Deleted Repair Orders Report: deleted orders can indicate errors, improper workflow, theft or manipulation, so check the part purchases and the advisor's activity behind each one. Greater New York Automobile Dealers Association fraud webinar: who reviews the open repair order list. FenderBender, a CPA's advice to review closed jobs against deposits. Precog found no repair-industry association standard for this, so it follows trade press, vendor help and the prosecuted cases.",
    evidenceToKeep: ["Signed deleted and voided order report", "Open order list with explanations"],
    ifYouCannotSeparate:
      "If the service advisor also closes the drawer and can delete orders: turn off the advisor's delete right in the shop system, and each week the person who runs the shop reads the deleted-order report and the open-order list.",
  },
  {
    id: "lib-core-returns",
    title: "Track core charges and vendor credits",
    purpose:
      "Gets back every core charge and return credit the shop paid for, before the vendor's return window closes. Done when each core and returned part on the tracker shows the credit memo that cleared it.",
    trigger: "Whenever a part with a core charge sells, and every Friday for the open list",
    cadence: "weekly",
    industries: ["automotive"],
    dutyIds: ["receive_goods", "enter_invoices"],
    covers: /\bcores?\b|\bparts inventory\b/i,
    prerequisites: [
      "The core and return tracker, in the shop system or a spreadsheet",
      "Each vendor's return window",
    ],
    steps: [
      {
        text: "Log each core charge on the tracker when the part sells: the invoice line, the amount and the return due date.",
      },
      { text: "Tag the old part with the repair order number when the technician pulls it." },
      { text: "Return the cores and unused parts to each vendor before its return window closes." },
      { text: "Write the return slip's date on the tracker." },
      {
        text: "Match each credit memo on the vendor's statement to a line on the tracker.",
        caution:
          "A core returned with no credit memo is money the vendor still holds; chase it before the next statement.",
      },
      { text: "Print the list of open cores and returns every Friday." },
      {
        text: "Give the open list to a person who neither orders nor returns parts to read and sign.",
      },
    ],
    source:
      "Tekmetric, Core Tracking, Returns and Reports: the customer's old part stays as the core, the parts desk returns it, and the vendor issues a credit invoice. Automate.com parts-department guidance: a weekly dirty-cores report, returned cores logged so credits are traceable, and one person accountable for the process. WickedFile, Vendor statement reconciliation for auto repair: a credit memo must post for every return and core. Return windows differ by supplier.",
    evidenceToKeep: ["Core and return tracker", "Return slips", "Vendor credit memos"],
    ifYouCannotSeparate:
      "If one person orders, receives and returns parts: each month someone who does none of that reads the vendor statement and ticks each core charge against its credit memo.",
  },
  {
    id: "lib-parts-vendor-statement",
    title: "Reconcile the parts vendor statement",
    purpose:
      "Pays the vendor only for parts that went on a repair order at the agreed price, with every return and core credited. Done when each line on the statement ties to a repair order, the price matches the matrix, and each credit due has posted.",
    trigger: "When each parts vendor's monthly statement arrives, before anyone pays it",
    cadence: "monthly",
    industries: ["automotive"],
    dutyIds: ["approve_invoices", "enter_invoices", "order_supplies"],
    covers: /\bparts (?:inventory|ordering|vendors?|suppliers?)\b|\bsupplier programs?\b/i,
    prerequisites: [
      "The vendor's statement and each invoice on it",
      "The parts matrix",
      "The core and return tracker",
    ],
    steps: [
      { text: "Check that each invoice line on the statement carries a repair order number." },
      { text: "Open that repair order and confirm the part appears on it." },
      {
        text: "List each part with no repair order, or on an order that does not show it.",
        caution:
          "A part with no repair order is one the shop paid for and cannot account for; find where it went before you pay.",
      },
      { text: "Compare the price billed on each line with the matrix price for that part." },
      { text: "Tick each credit memo on the statement against the core and return tracker." },
      { text: "Send the vendor a list of the credits due that the statement does not show." },
      {
        text: "Approve for payment only the lines that tie to a repair order at the matrix price.",
        caution:
          "The person who orders parts must not be the one who approves the statement for payment.",
      },
      { text: "Sign and date the reconciled statement." },
    ],
    source:
      "Tekmetric, Why auto repair shops match parts from repair orders to purchase orders: matching protects a shop from overages, slip-ups, theft and overcharges. WickedFile, Vendor statement reconciliation for auto repair: each part ties to a repair order, the billed price matches the quote or matrix, and a credit memo posts for every return and core.",
    evidenceToKeep: ["Reconciled vendor statement", "List of unmatched parts", "Credits-due list"],
    ifYouCannotSeparate:
      "If one person orders parts and approves the vendor bills: each month the person who runs the shop reads the statement with the repair order list open and traces ten lines of their choosing back to their orders.",
  },
  {
    id: "lib-sublet-invoice",
    title: "Pay a sublet invoice",
    purpose:
      "Pays an outside shop only for work that a repair order sent out, and shows the customer what the shop sent out. Done when the sublet invoice is a line of its own on the repair order, matches the vehicle, and appears on the customer's invoice.",
    trigger:
      "Whenever an invoice arrives from an outside shop that did work on a customer's vehicle",
    cadence: "ad-hoc",
    industries: ["automotive"],
    dutyIds: ["enter_invoices", "approve_invoices", "order_supplies"],
    covers: /\bsublet\b|\boutside (?:purchases?|repairs?|work)\b/i,
    prerequisites: ["The outside shop's invoice", "The shop's written rule for sublet pricing"],
    steps: [
      {
        text: "Find the repair order that sent the work out, by the vehicle identification number and the mileage.",
      },
      { text: "Check that the invoice names the outside shop, the vehicle and the work done." },
      {
        text: "Enter the invoice on that repair order as a sublet line, apart from the shop's own labor.",
      },
      { text: "Price the sublet line by the shop's written rule for markup or pass-through." },
      {
        text: "Show the sublet work on the customer's invoice with the outside shop's name.",
        caution:
          "Connecticut law puts sublet work on the customer's invoice with the outside shop's name and address (Conn. Gen. Stat. 14-65h); check your state.",
      },
      { text: "Staple the outside shop's invoice to the repair order." },
      {
        text: "Send the invoice to accounts payable only after it sits on a repair order.",
        caution: "The office pays a sublet invoice only when a repair order shows the work.",
      },
    ],
    source:
      "Connecticut General Statutes 14-65h and New Mexico Administrative Code 12.2.6: sublet work goes on the customer's invoice, with the outside shop named in Connecticut. Repair-shop bookkeeping guidance (Beancount, Wishup): a sublet line sits apart from in-house labor so markup and pass-through stay visible.",
    evidenceToKeep: [
      "Outside shop's invoice stapled to the repair order",
      "Customer invoice showing the sublet line",
    ],
    ifYouCannotSeparate:
      "If one person sends work out, enters the invoice and approves it: each month someone who does none of that compares the sublet expense with the sublet lines billed to customers and asks about any invoice with no repair order.",
  },
  // Retail. The frequent scheme is at the register: a sale voided or refunded
  // to the cashier's own card or a gift card, and cash moved out of the
  // drawer with nothing logged.
  {
    id: "lib-pos-exception-review",
    title: "Review voids, refunds and no-sales by cashier",
    purpose:
      "Finds the cashier who rings a sale, voids it and keeps the cash, or refunds to their own card. Done when a person who rang no sales has read the day's exceptions by cashier, checked each refund's tender against the original sale, and signed the report.",
    trigger: "Every morning, for the day before",
    cadence: "daily",
    industries: ["retail"],
    dutyIds: ["issue_refunds", "approve_writeoffs"],
    covers: /\bPOS\b|\bpoint[- ]of[- ]sale\b|\breturns policy\b/i,
    prerequisites: [
      "The point-of-sale exception report by cashier: voids, post-voids, refunds, no-sales and overrides",
      "The signed void and refund slips from the day",
    ],
    steps: [
      { text: "Run the exception report for yesterday, by cashier." },
      { text: "Count the voids, post-voids, refunds and no-sales for each cashier." },
      { text: "Match each post-void and refund to a slip the manager signed." },
      {
        text: "Check that each refund went to the tender that paid for the original sale.",
        caution:
          "A refund to a card that did not pay for the sale, or with no customer present, is the commonest small-store theft; stop it the same day.",
      },
      {
        text: "Compare each cashier's count of no-sales with the store's usual number for a shift.",
      },
      {
        text: "Ask the cashier about any void, refund or no-sale with no slip or no reason.",
        caution: "The reviewer must not be a cashier who rang sales that day.",
      },
      { text: "Sign and date the report." },
    ],
    source:
      "Salt Lake County Auditor, 2005 cash audit: supervisory review of each voided transaction, with approval confirmed by the supervisor's signature. Retail cash-handling audit practice (TAQtics checklist): refunds, voids and overrides approved at the right level, and the refund tender matches the original payment method unless someone documents an approved exception. Point-of-sale exception reporting flags excess voids, unusual refund patterns and no-sale drawer openings.",
    evidenceToKeep: ["Signed exception report", "Void and refund slips"],
    ifYouCannotSeparate:
      "If the person who rings sales also reviews the register: set the point of sale to need a second person's code for each void, refund and no-sale, and each week someone who rings no sales reads the exception report by cashier.",
  },
  {
    id: "lib-gift-cards",
    title: "Sell, activate and reconcile gift cards",
    purpose:
      "Stops gift cards loaded with a fake refund, or activated with no sale, from leaving in an employee's pocket. Done when every card activated in the month matches a sale, the count of blank cards matches, and the processor's balance equals the gift card liability in the books.",
    trigger: "Whenever a card sells or a customer redeems one, and on the last day of each month",
    cadence: "monthly",
    industries: ["retail"],
    dutyIds: ["collect_cash", "issue_refunds"],
    covers: /\bgift cards?\b/i,
    prerequisites: [
      "The gift card activation report from the point of sale or the card processor",
      "The count of blank cards in stock",
    ],
    steps: [
      {
        text: "Sell a gift card only through a sale rung at the register with the customer present.",
        caution:
          "Never activate a card without a paid sale behind it; a card activated with no sale is cash in another form.",
      },
      {
        text: "Refund to a gift card only with a manager's code and the customer at the counter.",
        caution:
          "A refund loaded onto a gift card the cashier keeps is the refund fraud police guides describe; the manager confirms the customer is there.",
      },
      { text: "Lock the blank cards away between sales." },
      {
        text: "Count the blank cards at the end of each day against yesterday's count and the day's activations.",
      },
      { text: "Run the activation report for the month." },
      { text: "Match each activation to a sale or to a refund slip with a manager's code." },
      {
        text: "Compare the processor's outstanding gift card balance with the liability in the books.",
      },
      {
        text: "Give the matched report and the count to a person who sells no gift cards to sign.",
      },
    ],
    source:
      "Common small-business control practice. The schemes it answers are on record: a cashier processes a fake refund and loads the amount onto a gift card (South Australia Police, Staff Theft Common Methods; press reports of retail prosecutions), and physical cards activated through false orders that someone then deletes (U.S. Attorney, Northern District of Georgia, Home Depot gift card case, as reported in 2025).",
    evidenceToKeep: [
      "Activation report matched to sales",
      "Blank card count sheet",
      "Processor balance comparison",
    ],
    ifYouCannotSeparate:
      "If one person sells, activates and refunds gift cards: each month someone who does none of that compares the processor's activation report with the sales and counts the blank cards.",
  },
  {
    id: "lib-cash-drops",
    title: "Record a cash drop or a paid-out",
    purpose:
      "Keeps the drawer small and makes every move of cash out of it a logged entry a second person can check. Done when each drop is in the safe log with its amount and time, each paid-out has a receipt and initials, and the register's expected cash reflects them.",
    trigger:
      "Whenever the drawer passes its cash limit, and whenever someone pays an expense from it",
    cadence: "ad-hoc",
    industries: ["retail"],
    dutyIds: ["collect_cash", "prepare_deposit"],
    covers: /\bcash (?:drops?|handling|drawers?)\b|\bdaily deposit\b/i,
    prerequisites: ["The safe drop log", "Paid-out slips", "The drawer's cash limit"],
    steps: [
      { text: "Count the cash above the drawer limit with the cashier watching." },
      {
        text: "Enter the drop in the point of sale with the amount and the time.",
        caution:
          "Never move cash to the safe without entering the drop; the expected drawer total only knows what you enter.",
      },
      {
        text: "Seal the cash in a drop bag marked with the amount, the register and your initials.",
      },
      { text: "Put the bag in the safe." },
      { text: "Write the amount, the time and the register in the safe log." },
      {
        text: "Pay an expense from the drawer only against a receipt.",
        caution:
          "Never pay out of the drawer without a receipt and a manager's initials; the paid-out reduces the cash the close expects.",
      },
      { text: "Enter the paid-out in the point of sale with the receipt's amount." },
      { text: "Ask the manager to initial the receipt." },
      { text: "Count the safe at close against the safe log." },
      {
        text: "Compare the drops and paid-outs on the register's close report with the safe log and the receipts.",
      },
    ],
    source:
      "Retail point-of-sale practice (PlumPOS glossary): a cash drop moves excess cash from the drawer to the safe and the system flags any gap against recorded sales, and a paid-out comes off the expected cash. Retail cash-handling audit practice (TAQtics checklist): drops and paid-outs logged with receipts and reviewed at close.",
    evidenceToKeep: ["Safe drop log", "Paid-out receipts with initials", "Register close report"],
    ifYouCannotSeparate:
      "If the same person drops cash and counts the safe: each week someone who handles no cash compares the safe log with the register's drop and paid-out report and with the deposits.",
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
