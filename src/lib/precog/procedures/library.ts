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
  // Nonprofits: churches, leagues and charities. Each follows the guidance
  // its source names; the fallback is written for a volunteer treasurer.
  {
    id: "lib-offering-count",
    title: "Count the offering or event cash with two counters",
    purpose:
      "Use this where cash and checks come in at a service, a game or an event. Shows every dollar given reached the bank, because two unrelated people counted it before anyone could take some. Done when both counters have signed the count sheet and the bank deposit equals it.",
    trigger: "After every service, game or event where cash or checks come in",
    cadence: "weekly",
    industries: ["nonprofit"],
    dutyIds: ["collect_cash", "prepare_deposit"],
    covers:
      /\b(?:offering|offertory|collection plate|plate (?:cash|count)|count team|event (?:cash|receipts|revenue)|concessions?)\b/i,
    prerequisites: [
      "A count sheet and a tamper-evident deposit bag",
      "A counter roster that rotates the pairs, so the same two people do not count every week",
    ],
    steps: [
      {
        text: "Take the offering or event cash straight to the counting room with the second counter.",
      },
      {
        text: "Count only with a second counter from another household who is neither the treasurer nor the financial secretary.",
      },
      { text: "Check the amount inside each envelope against the amount written on it." },
      { text: "Note each envelope difference on the count sheet." },
      { text: 'Stamp the back of each check "For deposit only".' },
      {
        text: "Ask the second counter to total the cash, coin and checks without seeing your figure.",
      },
      { text: "Compare the two totals and recount until they agree." },
      { text: "Sign the count sheet with the second counter." },
      {
        text: "Seal the cash, checks and deposit slip in a tamper-evident bag and write its number on the count sheet.",
        caution: "Never pay an expense or a reimbursement out of the offering; deposit it intact.",
      },
      {
        text: "Take the bag to the bank the same or next business day with a second person, or use the night drop.",
      },
      {
        text: "Give the count sheet to the person who records gifts, and a copy to the treasurer to match with the bank deposit.",
      },
    ],
    source:
      "Michigan Conference of the United Methodist Church, internal control checklist (Local Church Audit Guide, appendix B): at least two unrelated counters, neither the treasurer nor the financial secretary. Diocese of Salt Lake City and AG Financial offering-count guidance: tamper-evident bags, a count sheet both counters sign, and the offering deposited intact.",
    evidenceToKeep: ["Signed count sheet", "Tamper-evident bag log", "Bank deposit receipt"],
    ifYouCannotSeparate:
      "If only one person can count: count in view of a second adult, seal the money in a tamper-evident bag before leaving the room, and each month the treasurer or a board member compares every count sheet with the bank deposit of the same date.",
  },
  {
    id: "lib-giving-platform-payout",
    title: "Reconcile online-giving payouts to the bank",
    purpose:
      "Shows every gift given through the online-giving platform reached the organization's bank account and the donor's record. Done when the month's payout report equals the bank deposits, each gift is in the donor database, and nobody changed the payout account without approval.",
    trigger: "When the platform's monthly payout report is available, by the 10th of the month",
    cadence: "monthly",
    industries: ["nonprofit"],
    dutyIds: ["post_payments", "bank_reconcile"],
    covers:
      /\b(?:online giving|giving platform|digital (?:gifts|giving)|text-to-give|recurring giving|donation apps?)\b/i,
    prerequisites: [
      "Read-only access to the giving platform's payout and settings reports",
      "The bank statement for the month",
    ],
    steps: [
      { text: "Download the platform's payout report for the month." },
      { text: "Match each payout on the report to a deposit on the bank statement." },
      {
        text: "List every payout with no matching deposit, and every deposit from the platform with no payout on the report.",
      },
      {
        text: "Compare the gross gifts on the payout report with the gifts entered in the donor database for the month.",
      },
      {
        text: "Open the platform's change log and read every change to the payout bank account and to the users with admin access.",
        caution:
          "Stop and tell the treasurer the same day if the payout account changed without a written approval.",
      },
      {
        text: "Confirm each change to the payout account has a written approval from an officer who neither administers the platform nor does this reconciliation.",
      },
      { text: "Sign and date the comparison and file it with the bank reconciliation." },
    ],
    source:
      "GuideOne, Digital gifts: churches developing controls to avoid fraud, and LBMC, church finances best practices: a change to the payout bank account needs approval from a senior person who neither reconciles digital gifts nor administers the giving platform, with a monthly review of new users and bank-account changes. Archdiocese of Washington, policy for electronic giving and mobile payment platforms.",
    evidenceToKeep: [
      "Platform payout report",
      "Payout-to-bank comparison",
      "Payout account change approvals",
    ],
    ifYouCannotSeparate:
      "If the person who administers the platform also reconciles it: turn on the platform's email alert for every settings change and send it to the treasurer, and each quarter the treasurer signs in to the platform with read-only access and reads the payout account and the admin user list.",
  },
  {
    id: "lib-grant-draw",
    title: "Request and record a grant draw",
    purpose:
      "Draws grant money only for costs the grant allows and only when the organization can spend it promptly. Done when the request lists supported costs, an officer other than the preparer has approved it, and the receipt is in the books against the grant.",
    trigger:
      "When a grant's reporting calendar calls for a draw, or when tagged costs reach the amount the funder lets you request",
    cadence: "monthly",
    industries: ["nonprofit"],
    dutyIds: ["submit_claims", "post_payments"],
    covers:
      /\b(?:grant draws?|drawdowns?|reimbursement requests?|funder (?:relationships|reporting|draws?))\b/i,
    prerequisites: [
      "The grant agreement and its approved budget",
      "The ledger report of costs tagged to the grant",
    ],
    steps: [
      { text: "Run the ledger report of costs tagged to the grant since the last draw." },
      {
        text: "Remove any cost the grant budget does not allow, or that the funder already reimbursed.",
      },
      { text: "Attach the invoice, payroll record or receipt for each cost on the request." },
      { text: "Fill in the funder's draw or reimbursement form from the report." },
      {
        text: "Send the request and its support to the executive director or the treasurer to approve before it goes to the funder.",
        caution:
          "Draw only what the organization will spend within days; federal rules (2 CFR 200.305) keep an advance to the minimum needed.",
      },
      { text: "Submit the approved request to the funder." },
      {
        text: "Record the receipt against the grant when the money arrives.",
        caution:
          "Never post a grant receipt to general funds; tag it to the grant so the restricted balance stays right.",
      },
      { text: "File the request, its support and the approval with the grant." },
    ],
    source:
      "2 CFR 200.305(b) (Uniform Guidance): a federal recipient keeps written procedures that minimize the time between receiving an advance and paying it out, and otherwise draws by reimbursement. Robin Hood Foundation, Managing Restricted Funds toolkit: tag every cost to its grant and keep each draw supported.",
    evidenceToKeep: ["Draw request and its support", "Draw approval", "Grant ledger report"],
    ifYouCannotSeparate:
      "If one person prepares, approves and records draws: the treasurer reads every draw request before it goes out, and each quarter a board member compares the draws received with the costs tagged to each grant.",
  },
  {
    id: "lib-treasurer-report",
    title: "Prepare the treasurer's report for the board",
    purpose:
      "Gives the board what it needs to see money going astray: budget against actual, bank balances agreed to the reconciliation, restricted balances and any control exception. Done when the board has read the report and the minutes record it.",
    trigger: "Before each board meeting, and before the board reviews the Form 990 each year",
    cadence: "quarterly",
    industries: ["nonprofit"],
    dutyIds: ["bank_reconcile", "post_journal_entries"],
    covers:
      /\b(?:treasurer'?s? report|board (?:report|packet|oversight)|form 990|audit preparation)\b/i,
    prerequisites: [
      "The month's signed bank reconciliation",
      "The budget and the ledger for the period",
      "The restricted-fund balance report",
    ],
    steps: [
      { text: "Print the budget against actual for the period." },
      {
        text: "Write one line of explanation for each budget line that differs by more than the amount the board set.",
      },
      {
        text: "Copy each bank balance from the signed reconciliation, not from the books alone.",
        caution:
          "Never report a balance nobody has reconciled; a falsified monthly summary hid a four-year theft from one church's board.",
      },
      {
        text: "Add the restricted-fund balances with each fund's opening balance, additions, releases and closing balance.",
      },
      {
        text: "List every control exception from the period, for example a missing approval, a late reconciliation or a payout account change.",
      },
      { text: "Attach the bank statement's first page so a board member can compare the balance." },
      { text: "Send the report to the board before the meeting." },
      {
        text: "Ask the secretary to record in the minutes that the board received the report and any question it raised.",
      },
      {
        text: "Tell the board in writing of any weakness in control the outside accountant reported.",
      },
      {
        text: "Give the board the draft Form 990 to read before anyone files it, where the organization files one.",
      },
    ],
    source:
      "ECFA Seven Standards of Responsible Stewardship, Standards 2 and 3: an independent board that meets at least twice a year, reviews the annual financial statements and hears of any material weakness in internal control. IRS Form 990, Part VI, lines 8 and 11: contemporaneous minutes of board meetings, and the process by which the board reviewed the Form 990 before filing. Oregon Department of Justice, Financial Control Recommendations for Small Nonprofits: independent board oversight.",
    evidenceToKeep: ["Treasurer's report", "Board minutes", "Budget-against-actual report"],
    ifYouCannotSeparate:
      "If the person who keeps the books also writes the report: a board member who signs no checks opens the bank statement each month, compares its closing balance with the report, and initials the report before the meeting.",
  },
  {
    id: "lib-two-signer-checks",
    title: "Sign checks with two signers above the board's threshold",
    purpose:
      "Puts a second pair of eyes on every large payment before it leaves, because banks rarely enforce a two-signature rule on their own. Done when each check above the threshold carries two signatures with the bill attached, and nobody signed a blank check.",
    trigger: "Whenever a check above the amount the board set is ready to sign",
    cadence: "weekly",
    industries: ["nonprofit"],
    dutyIds: ["sign_checks", "release_payment"],
    covers:
      /\b(?:check signing|signing checks|two[- ]signature|dual[- ]signature|disbursements?|check requests?)\b/i,
    prerequisites: [
      "The board resolution that sets the two-signature threshold and names the signers",
      "The approved bill or reimbursement form for each check",
    ],
    steps: [
      {
        text: "Check that the bill or reimbursement form carries a written approval from someone other than the payee.",
      },
      { text: "Compare the payee, the amount and the invoice number on the check with the bill." },
      {
        text: "Sign the check only with the bill in front of you.",
        caution:
          "Never sign a blank check or a check to cash, and never sign one for a bill you have not seen.",
      },
      {
        text: "Pass the check and the bill to the second signer when the amount is above the board's threshold.",
      },
      { text: "Ask the second signer to repeat the comparison before signing." },
      { text: "Mark the bill paid with the check number and the date." },
      {
        text: "Hand the signed check to someone other than the person who prepared it to mail.",
        caution:
          "The check-swap scheme starts here: a signed check destroyed and replaced with one to the preparer. The mailer, not the preparer, holds the signed check.",
      },
      {
        text: "Ask a board member who signs no checks to read each month's cleared-check images against the approved bills.",
      },
    ],
    source:
      "Oregon Department of Justice, Financial Control Recommendations for Small Nonprofits: the person who receives and reconciles the bank statement issues and signs no checks, and someone independent of signing and bookkeeping reviews the cleared checks. Wild Apricot, Internal controls for nonprofits: the preparer never signs, and a second signature above a board-set amount. Virginia Bankers Association Legal Line, December 2016: banks generally do not enforce a two-signature requirement, so the organization's own review of cleared checks is the control.",
    evidenceToKeep: [
      "Signed check copies with their bills",
      "Board resolution naming signers and the threshold",
      "Monthly cleared-check review initials",
    ],
    ifYouCannotSeparate:
      "If only one person can sign: ask the bank for Positive Pay with payee match and for an alert on every check over the threshold, sent to a board member, and that board member reads the cleared-check images each month against the approved bills.",
  },
  // Professional services: law firms with trust accounts, medical and therapy
  // practices, small accounting and insurance offices.
  {
    id: "lib-trust-receipt",
    title: "Deposit client money into the trust account",
    purpose:
      "Use this only when the firm holds client money, for example a retainer, a settlement or funds for a client's costs. Keeps each client's money apart from the firm's from the day it arrives. Done when the money is in the trust account, not operating, and the journal and the client's ledger show it.",
    trigger:
      "Whenever a client or a third party pays money the firm has not yet earned, or money that belongs to someone else",
    cadence: "ad-hoc",
    industries: ["professional_services"],
    dutyIds: ["collect_cash", "post_payments", "prepare_deposit"],
    covers: /\b(?:retainers?|advance fees?|client funds?|escrow|iolta|settlement funds?)\b/i,
    prerequisites: [
      "The trust account's deposit slips",
      "The trust journal and the client's ledger",
    ],
    steps: [
      { text: "Ask the responsible lawyer or partner whether the firm has earned the money yet." },
      {
        text: "Deposit money the firm has not yet earned, and money held for others, into the trust account the same or next business day.",
        caution:
          "Never put client money in the operating account or hold it as cash; taking a fee before the firm earns it breaks the trust rule.",
      },
      { text: "Deposit the whole amount intact, with no expense or fee taken out first." },
      {
        text: "Record the receipt in the trust journal the same day, with the date, the source, the client and matter, the amount and its purpose.",
      },
      { text: "Record the same receipt on the client's own ledger." },
      { text: "Attach the deposit slip or the wire confirmation to the matter file." },
      {
        text: "Confirm the deposit appears on the trust account's bank statement when it arrives.",
      },
    ],
    source:
      "ABA Model Rule 1.15 (safekeeping property): a lawyer holds client and third-party funds in a separate trust account and keeps complete records, in the Model Rule for five years after the representation ends. California Rule 1.15 standards: a written journal per account and a written ledger per client. Florida Rule 5-1.2 and New York Rule 1.15 set their own records and retention. State rules differ; follow your own state's.",
    evidenceToKeep: [
      "Trust deposit slip or wire confirmation",
      "Trust journal entry",
      "Client ledger entry",
    ],
    ifYouCannotSeparate:
      "If one person receives, deposits and records client money: each month a lawyer or partner who does none of those reads the trust account's bank statement and compares every deposit with the trust journal and the client ledgers.",
  },
  {
    id: "lib-trust-disburse",
    title: "Disburse from the client trust account",
    purpose:
      "Pays out of trust only what a client's ledger holds, only to a named payee, and only with a lawyer's or partner's written approval. Done when the approved request, the check or transfer record and the client's ledger entry all match and no client ledger went negative.",
    trigger:
      "Whenever a client, a lawyer or a vendor asks for a payment from trust, including a transfer of earned fees to operating",
    cadence: "ad-hoc",
    industries: ["professional_services"],
    dutyIds: ["sign_checks", "release_payment", "initiate_ach"],
    covers:
      /\b(?:disburs\w*|fee transfers?|retainer account|trust (?:withdrawals?|payments?|checks?))\b/i,
    prerequisites: [
      "The client's current trust ledger balance",
      "A disbursement request form",
      "The firm's list of who may sign on the trust account",
    ],
    steps: [
      {
        text: "Fill in the request with the client and matter, the payee, the amount, the purpose and the client's current ledger balance.",
      },
      {
        text: "Compare the amount with the client's ledger balance.",
        caution:
          "Never pay out more than that client's ledger holds; a shortfall covered with another client's money is misappropriation, even by mistake.",
      },
      {
        text: "Attach the invoice the firm issued to the client to any request that moves earned fees to operating.",
        caution:
          "Only the responsible lawyer says when the firm has earned a fee; a staff member deciding that alone has cost lawyers their licenses.",
      },
      { text: "Wait out any client notice period your state rule sets before moving a fee." },
      {
        text: "Send the request and its support to the responsible lawyer or partner to approve in writing.",
      },
      {
        text: "Write the check or enter the transfer to the named payee only after the approval.",
        caution:
          "Never pay cash or write a trust check to cash; New York allows a transfer only with the entitled person's prior written approval.",
      },
      {
        text: "Ask an authorized signer to sign the check or release the transfer.",
        caution:
          "In New York only a lawyer admitted there may sign on the trust account; elsewhere the lawyer stays responsible for whoever signs.",
      },
      {
        text: "Record the disbursement in the trust journal and on the client's ledger the same day.",
      },
      {
        text: "File the approved request with the check copy or transfer confirmation in the matter.",
      },
    ],
    source:
      "ABA Model Rule 1.15 (safekeeping property). New York Rule 1.15(e): withdrawals from a trust account only to a named payee, never in cash, by check or by a transfer the entitled person approved in writing beforehand, and only a lawyer admitted in New York may sign. Florida Rule 5-1.2 and California Rule 1.15 set their own records and reconciliation rules. State rules differ; follow your own state's.",
    evidenceToKeep: [
      "Approved disbursement request",
      "Check copy or transfer confirmation",
      "Invoice behind each fee transfer",
      "Client ledger entry",
    ],
    ifYouCannotSeparate:
      "If one lawyer does everything in a solo office: keep a written request for every disbursement anyway, sign no check without the client's ledger open, and each month compare every cleared check and transfer on the trust statement with the requests before signing the three-way reconciliation.",
  },
  {
    id: "lib-matter-close-ledger",
    title: "Review a client's trust ledger before closing the matter",
    purpose:
      "Returns the client's remaining money, and leaves no money sitting in trust with no one responsible for it. Done when the client's ledger stands at zero or the remaining balance has a written reason, every entry on it has its support, and the closing date is on file.",
    trigger:
      "When a matter closes, and once a year for every client with a balance that has not moved in twelve months",
    cadence: "ad-hoc",
    industries: ["professional_services"],
    dutyIds: ["issue_refunds", "post_payments"],
    covers:
      /\b(?:matter clos\w+|closing (?:a |the )?matter|client ledgers?|unclaimed (?:funds|balances?)|dormant (?:funds|balances?))\b/i,
    prerequisites: [
      "The client's trust ledger for the whole matter",
      "The matter file with every disbursement request and invoice",
    ],
    steps: [
      { text: "Print the client's trust ledger from the first receipt to today." },
      { text: "Match each disbursement on the ledger to its approved request in the matter file." },
      { text: "Match each fee transfer on the ledger to the invoice behind it." },
      {
        text: "List every entry with no support, and ask the responsible lawyer about each one the same day.",
      },
      { text: "Compare the closing balance with what the client is due back." },
      {
        text: "Return the balance to the client by check to the client's name, with a statement of every receipt and payment on the matter.",
        caution:
          "Never move a leftover balance to operating or to another client's ledger; money nobody claims goes where your state's unclaimed-funds rule sends it.",
      },
      { text: "Record the closing date on the ledger so the retention period starts." },
      {
        text: "File the ledger and the statement in the matter for your state's retention period.",
      },
      { text: "Ask the responsible lawyer to sign the closed ledger." },
    ],
    source:
      "ABA Model Rule 1.15: complete records of client funds, kept in the Model Rule for five years after the representation ends; states set their own period and start date, for example Florida six years and New York seven. Florida Rule 5-1.2 also calls for an annual list of each client's unexpended trust balance, and Texas Ethics Opinion 602 addresses unclaimed trust funds. State rules differ; follow your own state's.",
    evidenceToKeep: [
      "Closed client ledger, signed",
      "Final statement to the client",
      "Refund check copy",
    ],
    ifYouCannotSeparate:
      "If the person who keeps the ledgers also issues the refunds: the responsible lawyer reads every closed ledger before signing the refund check, and once a year reads the list of every client balance that has not moved in twelve months.",
  },
  {
    id: "lib-remittance-posting",
    title: "Post insurance remittances and tie them to the deposit",
    purpose:
      "Use this only where the practice bills insurers. Shows every insurer payment reached the bank and every adjustment on the remittance has a reason. Done when each remittance's trace number matches a bank deposit and someone who did not post it has signed the match.",
    trigger:
      "When an electronic remittance file or a paper remittance arrives, and each week to match them to deposits",
    cadence: "weekly",
    industries: ["professional_services"],
    dutyIds: ["post_payments", "post_adjustments"],
    covers:
      /\b(?:insurance (?:remittances?|payments?|posting)|remittances?|payment posting|explanation of benefits)\b/i,
    prerequisites: [
      "Access to the remittance files from the clearinghouse or the insurer's portal",
      "The practice-management system's posting screen",
      "Read-only access to the bank's deposit detail",
    ],
    steps: [
      {
        text: "Log each paper remittance check in the check log before anyone posts it, with a second person present.",
      },
      {
        text: "Post each payment from the electronic remittance file, line by line, to the patient account it names.",
      },
      {
        text: "Post each contractual adjustment and each insurer-level adjustment with the reason code the remittance gives.",
        caution:
          "Never write off a balance the remittance did not adjust; an unexplained write-off is where a diverted payment hides.",
      },
      { text: "Write the remittance's trace number on the posting batch report." },
      {
        text: "Ask someone who did not post the batch to match each trace number to a deposit on the bank's deposit detail.",
        caution:
          "Match on the trace number, not the amount: one deposit covers many claims, and insurer-level adjustments make the totals differ.",
      },
      {
        text: "List every deposit with no posted remittance and every posted remittance with no deposit.",
      },
      { text: "Find the cause of each unmatched item within the week." },
      { text: "Sign and date the match report with the second person." },
      {
        text: "Give the month's adjustment and write-off report by user to the practitioner or partner in charge to read and sign.",
      },
    ],
    source:
      "MGMA, Internal controls to catch embezzlement in physician practices: no one person creates, approves, processes and conceals a transaction; rotate mail opening and payment posting, and have someone else match remittances to deposits. Matching each remittance to its deposit by the trace number on the electronic remittance advice (the 835 file) is common practice-management guidance, not a rule.",
    evidenceToKeep: [
      "Remittance check log",
      "Posting batch reports with trace numbers",
      "Remittance-to-deposit match report",
      "Signed monthly adjustment report by user",
    ],
    ifYouCannotSeparate:
      "If one person opens the remittances, posts them and deposits: have insurers pay by electronic transfer straight to the bank, and each month the practitioner or partner in charge compares the month's posted insurer payments with the bank's insurer deposits and reads the write-off report by user.",
  },
  {
    id: "lib-client-refund",
    title: "Refund a client or patient overpayment",
    purpose:
      "Returns money only where a real credit balance exists, and only to whoever paid it, so a refund cannot carry a diverted payment out of the firm. Done when a second person has approved the refund against the ledger and the money went back to the card or account that paid.",
    trigger:
      "Whenever a client or patient account shows a credit balance, or someone asks for money back",
    cadence: "ad-hoc",
    industries: ["professional_services"],
    dutyIds: ["issue_refunds", "post_adjustments"],
    covers: /\b(?:refunds?|credit balances?|overpayments?|return premiums?)\b/i,
    prerequisites: [
      "The account's ledger showing the credit balance and the payment that created it",
      "A refund request form",
    ],
    steps: [
      { text: "Open the account's ledger and find the payment that created the credit balance." },
      {
        text: "Check that the credit comes from a real overpayment, not from an adjustment or a write-off someone entered.",
        caution:
          "Stop if no payment stands behind the credit; a false credit posted and then refunded is the classic way to take money from a ledger.",
      },
      {
        text: "Fill in the refund request with the account, the payer, the amount, the original payment and the reason.",
      },
      {
        text: "Send the request to a second person who issues no refunds and enters no adjustments to approve.",
      },
      {
        text: "Refund only to the card or bank account that made the original payment, or by check to the payer's name.",
        caution: "Never refund to a different card, a different account or cash, whoever asks.",
      },
      { text: "Post the refund on the account's ledger the same day." },
      { text: "File the approved request with the refund confirmation." },
    ],
    source:
      "MGMA, Internal controls to catch embezzlement in physician practices: no one person creates, approves, processes and conceals a transaction. Common small-business control practice: a second person approves each refund against the ledger, and a refund goes only to the card or account that paid.",
    evidenceToKeep: [
      "Approved refund request",
      "Refund confirmation",
      "Account ledger showing the credit and the refund",
    ],
    ifYouCannotSeparate:
      "If one person posts payments and issues refunds: send every refund only to the card or account that paid, and each month the practitioner or partner in charge reads the refund list by user against the ledgers and initials it.",
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
