import type { IndustryId } from "../industry";
import { personDuties } from "../sod/assignments";
import type { EntitlementId } from "../sod/conflict-rules";
import type { IndustryTemplate } from "../templates";
import type { ProcessCadence } from "../types";
import { newProcedure, newStep } from "./lifecycle";
import type { Procedure } from "./types";

/**
 * Procedures a small business should have written, each with suggested steps
 * that follow recognised control practice. They are a starting point: every
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
}

const COMMON_PRACTICE = "Common small-business control practice.";
const GREEN_BOOK_10 =
  "GAO Standards for Internal Control in the Federal Government (the Green Book), Principle 10: control activities, including segregation of duties and review.";

export const RECOMMENDED_PROCEDURES: readonly RecommendedProcedure[] = [
  {
    id: "lib-bank-rec",
    title: "Reconcile the bank account",
    purpose:
      "Catches missing deposits, duplicate or unauthorised payments, and bank errors. Done when every line on the statement matches the books and a second person has signed the reconciliation.",
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
  },
  {
    id: "lib-vendor-bank-change",
    title: "Change a vendor's bank details",
    purpose:
      "Stops payments going to a criminal who pretends to be a vendor. Done when a call to a number already on file confirms the change and a second person approves it.",
    trigger: "Whenever a vendor asks to change where they are paid",
    cadence: "ad-hoc",
    dutyIds: ["create_vendor", "approve_vendor"],
    covers:
      /\b(?:vendor|supplier|subcontractor)s?\s*(?:&\s*\w+\s+)?(?:master|onboarding|set-?up|relationships?)\b/i,
    prerequisites: ["The vendor's phone number from an earlier invoice or contract"],
    steps: [
      { text: "Stop: make no change from the email, letter or call that asked for it." },
      {
        text: "Call the vendor on the phone number already on file.",
        caution:
          "Never use a phone number, link or contact given in the request itself; criminals supply their own.",
      },
      { text: "Confirm the new bank details with the person who answers." },
      { text: "Write down who confirmed, the date and the number you called." },
      { text: "Ask a second person to approve the change before it is saved." },
      { text: "Save the new bank details in the vendor record." },
      { text: "Confirm with the vendor that the first payment to the new account arrived." },
    ],
    source:
      "FBI Internet Crime Complaint Center (IC3) public service announcements on business email compromise: verify every change of payment account by a second channel, calling a number already known, never one given in the request.",
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
        text: "Remove any bill that has already been paid.",
        caution:
          "Check the vendor, amount and invoice number together; a duplicate bill can differ in one of them.",
      },
      { text: "Total the batch and write the total down." },
      {
        text: "Send the batch to a second person to approve before it is released.",
        caution: "The person who prepared the batch must not also approve its release.",
      },
      { text: "Release the approved batch." },
      { text: "Save the payment report with the approved list." },
    ],
    source: GREEN_BOOK_10,
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
    prerequisites: ["Payroll provider login", "Approved timesheets for the period"],
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
  },
  {
    id: "lib-refund-review",
    title: "Review refunds, voids and write-offs",
    purpose:
      "Finds refunds or write-offs that hide a diverted payment. Done when a second person who did not make them has checked each one over the limit.",
    trigger: "Every Monday, for the week before",
    cadence: "weekly",
    dutyIds: ["issue_refunds", "approve_writeoffs", "post_adjustments"],
    covers: /\b(?:refunds?|voids?|write-?offs?|adjustments?|markdowns?|comps?)\b/i,
    prerequisites: ["Access to the refunds, voids and adjustments report"],
    steps: [
      { text: "Run the refunds, voids and adjustments report for last week." },
      { text: "Mark each entry over the approval limit." },
      { text: "Check that each marked entry has a reason and an approval." },
      {
        text: "Ask the person who made any entry without a reason to explain it.",
        caution: "The reviewer must not be the person who made the refunds or adjustments.",
      },
      { text: "Sign and date the report." },
    ],
    source: GREEN_BOOK_10,
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
        text: "Ask a second person to approve each adjustment before it is entered.",
        caution: "The person who counts must not also approve the adjustment.",
      },
      { text: "Enter the approved adjustments." },
    ],
    source: COMMON_PRACTICE,
  },
  {
    id: "lib-receiving",
    title: "Receive a delivery",
    purpose:
      "Pays only for goods that arrived. Done when the received quantities are entered and sent to accounts payable to match with the invoice.",
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
        caution: "The person who ordered the goods should not be the only one who receives them.",
      },
    ],
    source: COMMON_PRACTICE,
  },
  {
    id: "lib-leaver-access",
    title: "Remove a leaver's access",
    purpose:
      "Stops a former employee getting into systems, money or the building. Done when every account is disabled and every shared code they knew is changed.",
    trigger: "On the person's last day, before they leave",
    cadence: "ad-hoc",
    dutyIds: ["manage_user_access", "pms_admin_roles"],
    covers:
      /\b(?:system admin\w*|software admin\w*|user access|access (?:rights|control)|pos admin)\b/i,
    prerequisites: ["Administrator access to each system", "The list of systems the person used"],
    steps: [
      { text: "List every system, card and key the person had." },
      { text: "Disable each of the person's accounts." },
      { text: "Remove the person from the bank's list of authorised users." },
      {
        text: "Change every shared password, door code and safe combination the person knew.",
        caution: "Write down where each new code is kept, never the code itself.",
      },
      { text: "Collect keys, access cards and company equipment." },
      { text: "Record the date each item was done." },
    ],
    source:
      "NIST SP 800-53, control PS-4 (Personnel Termination): disable access and retrieve property when employment ends.",
  },
  {
    id: "lib-backup-test",
    title: "Check the backups and test a restore",
    purpose:
      "Shows the business could get its records back after a failure or ransomware. Done when a file has been restored from backup and opened.",
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
      "Finds personal or unauthorised card spending. Done when every charge has a receipt and a second person other than the cardholder has reviewed it.",
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
  },
  // By line of business.
  {
    id: "lib-controlled-count",
    title: "Count controlled drugs against the log",
    purpose:
      "Shows every controlled drug is accounted for and finds a loss the day it happens. Done when each count matches the log and both counters have signed it.",
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
          "A theft or significant loss must be reported to the DEA in writing within one business day of discovery (21 CFR 1301.76(b)).",
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
      "Shows each client's money is still there and none was used for another client or the firm. Done when the bank, the trust ledger and the client ledgers agree and a second person has signed.",
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
          "A negative client balance means another client's money was used; report it the same day.",
      },
      { text: "Give the reconciliation to a second person to review and sign." },
      { text: "Save the signed reconciliation with the statement." },
    ],
    source:
      "ABA Model Rule 1.15 (safekeeping property) and the ABA Model Rules on Client Trust Account Records, Rule 1, which calls for reconciliation at least quarterly and prefers monthly. State rules differ; follow your own state's.",
  },
  {
    id: "lib-tip-report",
    title: "Collect and record reported tips",
    purpose:
      "Gets each employee's tips into payroll so the business withholds and reports the right taxes. Done when every employee's reported tips are entered for the period.",
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
  },
  {
    id: "lib-lien-waiver",
    title: "Collect lien waivers before paying a subcontractor",
    purpose:
      "Stops a subcontractor or supplier who was not paid putting a lien on the client's property. Done when a waiver for each payment is on file with the job.",
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
        text: "Check that the waiver names the job, the amount and the date work is paid through.",
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
  },
  {
    id: "lib-restricted-gift",
    title: "Record a restricted gift or grant",
    purpose:
      "Spends each gift only as the donor allowed and shows it in the right net asset class. Done when the gift is recorded with its restriction and released only once the restriction is met.",
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
        text: "Move the amount to without donor restrictions once the donor's purpose or time is met.",
      },
      { text: "Compare each restricted balance with the donor's terms every month." },
    ],
    source:
      "FASB ASU 2016-14 (ASC 958): gifts with donor restrictions are reported as net assets with donor restrictions and reclassified when the restriction is met.",
  },
  {
    id: "lib-deal-jacket",
    title: "Audit deal jackets and title fees",
    purpose:
      "Shows each sold vehicle's paperwork is complete and each title fee collected reached the state. Done when every deal from last week is checked and signed off.",
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
 * The recommended procedures for this line of business that are not already
 * written, each with what it would cover here. A recommendation counts as
 * written when a procedure was started from it (it carries the
 * `libraryId`), or when every register item it matches already has a
 * procedure. Ordered: those covering register items, then those whose duty
 * someone holds, then the rest.
 */
export function libraryRows(
  tpl: Pick<IndustryTemplate, "people" | "knowledge" | "roleTemplates">,
  procedures: readonly Pick<Procedure, "libraryId" | "industry" | "knowledgeIds">[],
  industry: IndustryId,
): LibraryRow[] {
  const own = procedures.filter((p) => p.industry === industry);
  const started = new Set(own.map((p) => p.libraryId).filter(Boolean));
  const written = new Set(own.flatMap((p) => p.knowledgeIds));
  const active = tpl.people.filter((p) => p.active);
  const rows: LibraryRow[] = [];
  for (const recommendation of RECOMMENDED_PROCEDURES) {
    if (recommendation.industries && !recommendation.industries.includes(industry)) continue;
    if (started.has(recommendation.id)) continue;
    const matched = tpl.knowledge.filter((k) => recommendation.covers.test(k.name));
    const knowledgeIds = matched.filter((k) => !written.has(k.id)).map((k) => k.id);
    if (matched.length > 0 && knowledgeIds.length === 0) continue;
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
 * duty as the one who does it today.
 */
export function procedureFromLibrary(
  row: LibraryRow,
  industry: IndustryId,
  today: string,
): Procedure {
  const r = row.recommendation;
  return newProcedure(
    {
      industry,
      title: r.title,
      libraryId: r.id,
      purpose: r.purpose,
      trigger: r.trigger,
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
