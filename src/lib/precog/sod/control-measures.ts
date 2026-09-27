import type { IndustryId } from "../industry";
import type { EntitlementId } from "./conflict-rules";
import { guidanceWords, type GuidanceWords } from "./power-guidance";

interface DutyControlMeasures {
  directive: string[];
  preventive: string[];
  detective: string[];
  corrective: string[];
}

/** The control-action catalog for a line of business, in its own words. */
export function controlMeasures(industry: IndustryId): Record<EntitlementId, DutyControlMeasures> {
  let catalog = BY_INDUSTRY.get(industry);
  if (!catalog) {
    catalog = measuresFor(guidanceWords(industry));
    BY_INDUSTRY.set(industry, catalog);
  }
  return catalog;
}

const BY_INDUSTRY = new Map<IndustryId, Record<EntitlementId, DutyControlMeasures>>();

function measures(
  directive: string[],
  preventive: string[],
  detective: string[],
  corrective: string[],
): DutyControlMeasures {
  return { directive, preventive, detective, corrective };
}

/** "The owner" as the subject that opens a sentence. */
function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Practical control-action catalog for every modeled duty, in the business's
 * own words (see GuidanceWords). Each list includes alternatives so a smaller
 * business can select a proportionate design rather than treating one
 * implementation as mandatory.
 */
function measuresFor(w: GuidanceWords): Record<EntitlementId, DutyControlMeasures> {
  return {
    collect_cash: measures(
      [
        "Write down how cash is taken and how the drawer is closed",
        "Train everyone who takes payment on receipts, shortages, and whom to tell",
      ],
      [
        "Use named drawers and sequential receipts",
        "Take card payments where you can, and have two people count the cash when two are on shift",
      ],
      [
        `Compare each day's takings with the ${w.system} and card-processor totals`,
        "Count drawers by surprise and track overs and shorts by person",
      ],
      [
        "Look into every difference and write down what you found",
        "Restrict drawer access and retrain or reassign after repeated exceptions",
      ],
    ),
    post_payments: measures(
      [
        "Write down how payments are recorded and which reason codes are allowed",
        "Keep the remittance slips and batch reports for every deposit",
      ],
      [
        "Let only named users record payments, and lock closed months",
        `Import ${w.paymentFile} instead of keying payments by hand`,
      ],
      [
        "Match each day's recorded payments to receipts and remittance slips",
        "Review reversed, unapplied, and backdated payments",
      ],
      [
        "Fix a payment recorded to the wrong account by reversing it, never by deleting it",
        `Take unexplained differences to ${w.overseer} and tighten the recording rules`,
      ],
    ),
    prepare_deposit: measures(
      [
        "Deposit the same day, and record who held the money at each step",
        `Decide what proves a deposit was made, and tell ${w.overseer} about any late one`,
      ],
      [
        "Use sealed deposit bags and have two people count",
        "Scan checks for remote deposit or use an armored pickup instead",
      ],
      [
        "Match each bank-stamped deposit to the day's closing report",
        "Watch for missing, late, split, and altered deposits",
      ],
      [
        "Trace every shortage and have someone outside the deposit sign off",
        "Change who carries the deposit after repeated problems",
      ],
    ),
    bank_reconcile: measures(
      [
        "Reconcile the bank by the 15th of the next month, by someone who does not post",
        "Set how long a reconciling item may stay open and who approves clearing it",
      ],
      [
        "Give the reconciler read-only bank access",
        "Lock closed months and keep the statements where nobody can edit them",
      ],
      [
        "Review outstanding items, transfers, and unusual payees",
        `Have ${w.overseer} or the outside accountant initial each reconciliation`,
      ],
      [
        "Clear old items and correct the errors you can support",
        `Take unexplained differences to ${w.overseer} and suspend the access involved`,
      ],
    ),
    approve_writeoffs: measures(
      [
        "Write down who may approve a write-off, up to what amount, and for which reasons",
        `List the write-offs nobody may approve and the ones only ${w.overseer} approves`,
      ],
      [
        "Require an approval in the system, with amount limits",
        `Require ${w.writeoffSupport} before approval`,
      ],
      [
        "Review write-offs by person, reason, and month",
        "Check a sample of approvals against their documents and contracts",
      ],
      [
        "Reverse unsupported write-offs and recover balances",
        "Lower the limit or remove the approval right after a breach",
      ],
    ),
    post_adjustments: measures(
      [
        "Require a recorded approval before a write-off posts",
        "Use set reason codes, each with the document it needs",
      ],
      [
        "Keep posting apart from approving and from sending refunds",
        "Limit who can post, the amounts, the dates, and the reason codes",
      ],
      [
        "Review daily adjustment and reversal reports",
        "Compare credits, refunds, and write-offs for unusual patterns",
      ],
      [
        "Reverse unsupported entries so their history stays visible",
        `Take patterns to ${w.overseer} and narrow who can post`,
      ],
    ),
    submit_claims: measures(
      [
        `Set what each of your ${w.bills} must include and how soon it goes out`,
        "Train staff on how to correct and resend a bill",
      ],
      [
        `Use required fields and system checks before ${w.bills} go out`,
        "Limit who can correct, cancel, or override a bill already sent",
      ],
      [
        "Review rejected, disputed, resent, and overdue bills each month",
        `Check a sample of bills against the work records and the ${w.priceList}`,
      ],
      [
        "Correct bills, refund overpayments, and disclose errors when the law requires",
        "Fix the training, templates, or access behind repeated errors",
      ],
    ),
    create_vendor: measures(
      [
        "Write down how a supplier is added and how a change to its details is checked",
        "Collect each supplier's tax form, owners, and bank details, and have staff declare any tie to it",
      ],
      [
        "Call the supplier back on a number you already had before changing its bank details, and check for duplicates",
        "Keep supplier setup apart from approval and payment",
      ],
      [
        "Review the supplier-change log, and compare supplier addresses with staff addresses",
        "Watch for unused, duplicate, and one-time suppliers",
      ],
      [
        "Block a suspect supplier and undo any change nobody approved",
        "Check its details again and look into the payments made to it",
      ],
    ),
    approve_vendor: measures(
      [
        "Decide what to check before approving a supplier, and have staff declare any tie to one",
        "Set who approves each kind of supplier, and up to what spend",
      ],
      [
        "Approve a supplier only once its details are checked",
        "Require a second approval for a supplier tied to staff or otherwise high-risk",
      ],
      [
        "Once a year, confirm each active supplier is real and still used",
        "Review approvals made without the tax form, bank details, or owners on file",
      ],
      [
        "Suspend or close suppliers you cannot support",
        "Recover improper payments and tighten what an approval needs",
      ],
    ),
    approve_invoices: measures(
      [
        "Write down who approves bills and up to what amount",
        "Require the bill, the order and the proof of receipt before approval",
      ],
      [
        "Approve each bill before it enters a payment run",
        "Keep bill approval with someone who enters no bills and releases no payments",
      ],
      [
        "Compare paid bills with supplier statements each month",
        "Review bills paid without a recorded approval",
      ],
      [
        "Hold payment on any bill found without approval until it is approved",
        "Recover and report any bill paid on false support",
      ],
    ),
    release_payment: measures(
      [
        "Set payment limits, payment days, and the support a payment needs",
        `List the payments nobody may send, and take any exception to ${w.overseer}`,
      ],
      [
        "Use the bank's dual release, and positive pay (the bank pays only checks you listed)",
        "Keep release apart from supplier setup, bill entry, and setting up electronic payments",
      ],
      [
        "Check released payments against the approved payment list",
        "Watch for new payees, round amounts, rushed payments, and duplicates",
      ],
      [
        "Recall or stop an unauthorized payment the same day",
        "Shut off any login that may be stolen and trace every step of the payment",
      ],
    ),
    edit_payroll_master: measures(
      [
        "Require a signed form for every new hire, rate change, and deposit-account change",
        "Name who may change employee records and who may not",
      ],
      [
        "Restrict employee-record changes to a role that does not run payroll",
        "Have the payroll service confirm bank-account changes with the employee directly",
      ],
      [
        `${cap(w.overseer)} reads the payroll change report every cycle against the signed forms`,
        "Compare the people paid against the people scheduled and the list of people who have left",
      ],
      [
        "Reverse unauthorized changes and recover any pay they produced",
        "Remove the access that allowed the change and record the review",
      ],
    ),
    post_journal_entries: measures(
      [
        "Define which entries need support and a second reviewer",
        "Prohibit entries that adjust cash or receivables without a stated reason",
      ],
      [
        "Restrict manual entries to a role that does not reconcile the bank",
        "Require support attached before an entry can post",
      ],
      [
        `${cap(w.overseer)} or the outside accountant reads the manual-entry log each month`,
        "Question every entry that changes cash, receivables, or a suspense account",
      ],
      [
        "Reverse unsupported entries and trace what they concealed",
        "Have someone independent review any entry that adjusted cash",
      ],
    ),
    enter_payroll: measures(
      [
        "Write down the pay calendar, what goes into each run, and what supports an exception",
        "List the earnings, deductions, and overrides allowed",
      ],
      [
        "Import approved time records and limit manual overrides",
        "Keep payroll entry apart from changing employee records and from approval",
      ],
      [
        "Compare each run's input with the last run and the hiring records",
        "Review manual checks, overrides, and unusual hours",
      ],
      [
        "Correct errors in a recorded extra run or in the next run",
        "Recover overpayments and fix the cause of repeated input errors",
      ],
    ),
    approve_payroll: measures(
      [
        "Read the payroll register and the changes from the last run before release",
        "Set approval deadlines and stand-in approvers",
      ],
      [
        "Have someone who does not run payroll give the final approval, within a bank limit",
        "Require a separate approval for any extra or bonus run",
      ],
      [
        "Compare approved totals with the bank's payroll debits and the books",
        "Review changes in headcount, take-home pay, and bank accounts",
      ],
      [
        "Stop or recall a wrong payroll before it settles",
        "Record what was recovered, what was corrected, and whose access changed",
      ],
    ),
    pms_admin_roles: measures(
      [
        "Give each login only what the job needs, and write down how administrator work is done",
        "Record every access change with who asked, who approved, and when it ends, emergency access included",
      ],
      [
        "Use named administrator logins with two-step sign-in, separate from daily logins",
        "Let nobody approve their own access, and make extra rights expire",
      ],
      [
        "Review role changes, administrator activity, and unused administrator logins",
        `${cap(w.overseer)} confirms the user list each quarter`,
      ],
      [
        "Remove extra access and change any password that may be known",
        "Look into changes nobody approved and put back the approved settings",
      ],
    ),
    issue_refunds: measures(
      [
        "Write down when a refund is allowed, up to what amount, and what support it needs",
        "Refund only to the card or account that paid, and record any exception",
      ],
      [
        "Keep creating the credit, approving it, and sending the refund in different hands",
        "Set refund limits in the system and require two approvals above the amount you set",
      ],
      [
        `Review refunds by employee, ${w.payer}, payment method, and how often`,
        "Match refunds to credits, bank activity, and approvals",
      ],
      [
        "Cancel or recover unsupported refunds",
        "Narrow who can refund, and look into the adjustments linked to the refund",
      ],
    ),
    change_fee_schedule: measures(
      [
        "Name who owns prices, when a change takes effect, and who approves it",
        `Work out ${w.priceImpact} before approving a change`,
      ],
      [
        "Record every price change as a request, and limit who can change settings",
        "Test a change on a copy first, or have a second person check it",
      ],
      [
        `Compare the ${w.priceList} before and after, and the charges it changed`,
        "Review price overrides and unexpected changes in charges or payments",
      ],
      [
        "Roll back incorrect rates and correct the accounts they affected",
        `Tell the ${w.affected} and staff the change affected, and test more carefully next time`,
      ],
    ),
    edit_patient_master: measures(
      [
        `Write down how ${w.masterRecord} may be changed`,
        "Train staff to open only the records they need and to verify who is asking",
      ],
      [
        "Require a source document for every identity or bank change",
        "Check for duplicates and limit bulk or high-risk edits",
      ],
      [
        `Review the ${w.system} change log for identity and bank changes`,
        "Watch for duplicates, merges, and changes made just before a refund",
      ],
      [
        "Restore the verified details and merge duplicate records",
        "Work out whose data was affected and notify them as the law and your policy require",
      ],
    ),
    manage_user_access: measures(
      [
        "Keep a checklist for when someone joins, changes job, or leaves, and require two-step sign-in",
        "Decide who approves administrator and emergency access",
      ],
      [
        "Create logins from the hiring record, and keep administrator logins separate",
        `Extra rights need ${w.overseer}'s approval and expire on their own`,
      ],
      [
        `${cap(w.overseer)} confirms the user list and each user's rights every quarter`,
        "Alert on new administrator rights, logins unused for 90 days, and logins not removed after someone leaves",
      ],
      [
        "Shut off access that should not exist and change the passwords involved",
        "Look into everything done under access nobody approved",
      ],
    ),
    export_bulk_data: measures(
      [
        "Write down why data may be exported, to whom, how long it is kept, and how it is deleted",
        "Export only the data the purpose needs, with a privacy approval",
      ],
      [
        "Limit who can export, and send exports only to approved, encrypted places",
        "Cap the rows, hide the fields not needed, or share through a link that expires",
      ],
      [
        "Log and alert on large, after-hours, or unusual exports",
        "Match each export to its approved request and to a confirmation it was deleted",
      ],
      [
        "Cancel the links and limit the spread of anything sent by mistake",
        "Work out whose data was affected, notify them as required, and narrow export access",
      ],
    ),
    order_supplies: measures(
      [
        "Set spending limits, approved suppliers and items, and who owns each budget",
        "Have buyers declare any tie to a supplier, and get competing quotes above your quote threshold",
      ],
      [
        "Use approved requests, purchase orders, and spending limits",
        "Keep ordering, receiving, and paying in different hands",
      ],
      [
        "Review orders from unapproved suppliers, orders split to stay under a limit, rushed orders, and orders sent to a home address",
        "Compare purchases to budgets, inventory, and usage",
      ],
      [
        "Cancel or return unauthorized orders",
        "Recover losses and change the buyer's limits or the supplier",
      ],
    ),
    receive_goods: measures(
      [
        "Write down how deliveries are checked, recorded, and disputed",
        "Have a named person record each delivery the day it arrives",
      ],
      [
        "Separate receipt confirmation from ordering",
        "Use packing slips, counts, photos, or the user's confirmation",
      ],
      [
        "Match receipts to orders and invoices",
        "Review missing, partial, duplicate, and late-recorded receipts",
      ],
      [
        "Reject, return, or dispute deficient deliveries",
        "Correct receipt records and investigate repeated mismatches",
      ],
    ),
    enter_invoices: measures(
      [
        "Write down what a bill needs before entry, how it is coded, and how duplicates are caught",
        "Match each bill to its purchase order and receipt, or record who approved the exception",
      ],
      [
        "Use duplicate checks, and pick suppliers from the approved list only",
        "Keep bill entry apart from payment release",
      ],
      [
        "Review duplicates, round-dollar bills, credits, and overrides",
        "Check a sample of bills against orders, receipts, and supplier statements",
      ],
      [
        "Reverse unsupported entries and request credits",
        "Block a suspect bill or supplier and fix the cause of entry errors",
      ],
    ),
    initiate_ach: measures(
      [
        "Write down which electronic payments are allowed, their limits, and the bank's cutoff times",
        `Act only on payment instructions you have confirmed, and take exceptions to ${w.overseer}`,
      ],
      [
        "Have someone else release what you set up, and require two-step sign-in",
        "Use saved payee templates, an approved-payee list, payment limits, and a second signer",
      ],
      [
        "Alert on new payees, changed templates, and unusual transfers",
        "Match each payment set up to its approval and the bank's confirmation",
      ],
      [
        "Call the bank at once to recall a transfer",
        "Lock the login, keep the records, and find out how it was misused",
      ],
    ),
    sign_checks: measures(
      [
        "Set who may sign, up to what amount, and the support a check needs",
        "Prohibit blank, pre-signed, and payable-to-cash checks",
      ],
      [
        "Lock up blank checks, and keep writing a check apart from signing it",
        "Require two signatures, or use positive pay (the bank pays only checks you listed)",
      ],
      [
        "Review check numbers in sequence, cleared-check images, voids, and payee changes",
        "Have someone who does not sign match cleared checks to the register",
      ],
      [
        "Stop payment and replace any check stock that went missing",
        "Recover any unauthorized payment and change who may sign",
      ],
    ),
    review_audit_logs: measures(
      [
        "Decide which logs are read, how often, by whom, and whom to tell",
        "List the high-risk events to look for and how long logs are kept",
      ],
      [
        "Keep logs where nobody can edit them, and keep the reviewer apart from the administrator",
        "Send copies or alerts to a system the administrator does not control",
      ],
      [
        "Review administrator, access, export, and settings changes",
        "Follow each exception until it is closed, and check that no log is missing",
      ],
      [
        "Lock suspicious logins and keep the records",
        "Close logging gaps and adjust alerts after an incident",
      ],
    ),
    manage_backups: measures(
      [
        "Decide how fast you must recover, what is backed up, how long copies are kept, and how often you test",
        "Name who restores the data and whom a failed backup alerts",
      ],
      [
        "Keep an encrypted copy nobody can change or delete, offline or under a separate login",
        "Require two-step sign-in for the backup system, and give each login only what it needs",
      ],
      [
        "Check that every backup ran, covered everything, is recent, and has room",
        "Test a full restore and record the result",
      ],
      [
        "Rerun failed backups and restore clean data",
        "Find out why a backup failed, change the passwords, and fix the backup plan",
      ],
    ),
    hold_company_card: measures(
      [
        "Write down what the card may buy, who holds one, and the receipt rule for every charge",
        "Prohibit cash advances, gift cards, and personal use on any company card",
      ],
      [
        "Turn off cash advances at the issuer and set a low limit per card",
        "Issue one named card per holder; never a shared card or a card in the business's name alone",
      ],
      [
        `${cap(w.overseer)} reads every statement line by line each month, against the receipts`,
        "Alert on gift-card, marketplace, and after-hours charges",
      ],
      [
        "Recover personal charges and cancel the card after a breach",
        "Restrict holders and lower limits after repeated exceptions",
      ],
    ),
    review_card_statement: measures(
      [
        "Assign statement review to someone who holds no card on the account",
        "Require a receipt and a stated purpose before a line is coded",
      ],
      [
        "Send the statement to the reviewer directly, not through a cardholder",
        "Lock coding of the statement to the reviewer's login",
      ],
      [
        `${cap(w.overseer)} reads the coded statement and questions any line without a receipt`,
        "Compare card spending by holder month over month",
      ],
      [
        "Recode misposted lines and recover any personal charge found",
        "Move the review when the reviewer is found to hold a card",
      ],
    ),
    approve_expenses: measures(
      [
        "Set the receipt threshold, the approval chain, and who approves the approver",
        "Prohibit anyone approving their own claim or card statement",
      ],
      [
        "Pay reimbursements as their own line, never through payroll",
        "Require the receipt attached before a claim can be approved",
      ],
      [
        `${cap(w.overseer)} reads reimbursements by person each month and questions the pattern`,
        "Compare claims against travel and schedules for the period",
      ],
      [
        "Recover unsupported reimbursements and record the review",
        "Remove approval authority after a self-approval is found",
      ],
    ),
    view_reports_only: measures(
      [
        "Write down which reports each person may see, what for, and how to keep them private",
        "Train report readers to keep and share only what they need",
      ],
      [
        "Use read-only logins, hide fields not needed, and limit downloads",
        "Send scheduled reports instead of giving live access",
      ],
      [
        "Review who can see reports, what they download and share, and unused logins",
        "Once a year, confirm each reader still needs the reports",
      ],
      [
        "Remove access nobody needs and get back copies shared by mistake",
        "Look into any report shared where it should not be, and narrow what it shows",
      ],
    ),
  };
}
