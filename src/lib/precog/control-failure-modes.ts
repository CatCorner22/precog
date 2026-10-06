/** Everyday ways a control stops working while it still looks in place: 2 or 3 per control. */
export const CONTROL_FAILURE_MODES: Readonly<Record<string, readonly string[]>> = {
  "c-cash": [
    "The person handling cash prepares the deposit record before anyone compares it with bank activity.",
    "Customer cash reaches the bank without a separate check of the deposit against the register.",
    "A deposit difference is noted but never traced back to the cash drawer.",
  ],
  "c-sod-cash": [
    "The person who posts customer payments prepares the bank reconciliation too.",
    "The reconciliation uses a receipt list prepared by the person whose work it checks.",
    "Unmatched payments stay open after review because nobody checks how they were resolved.",
  ],
  "c-sod-billing": [
    "The staff member who submits a claim also writes off its unpaid balance.",
    "The reviewer checks adjustment totals without opening the customer accounts behind them.",
    "A questionable write-off is noted but never returned for another review.",
  ],
  "c-sod-ap": [
    "The person who releases bills also creates vendors and approves their invoices.",
    "A vendor change receives approval from the person who requested it.",
    "A vendor's bank details change by email and nobody calls the vendor to confirm.",
  ],
  "c-sod-ar": [
    "The person entering a receivable write-off also records its approval.",
    "An approver checks a total instead of the customer balance and credit support.",
    "A questionable write-off stays in the records after its exception goes unanswered.",
  ],
  "c-ap": [
    "Payment uses a packing slip copy that the supplier prepared instead of a separate receipt check.",
    "The match checks invoice totals but never confirms the listed goods arrived.",
    "An urgent invoice enters the pay run while its delivery record is missing.",
  ],
  "c-ar": [
    "The aging review uses a report that hides older balances under a summary row.",
    "The owner signs an aging report without opening the customer accounts.",
    "Long-overdue balances return each month without a recorded next step.",
  ],
  "c-payroll": [
    "The owner approves payroll totals without checking the changes behind them.",
    "A late correction enters the pay run before the owner reviews it.",
    "Payroll approval happens after transmission, when the money is already sent.",
  ],
  "c-claims": [
    "The denial list arrives late, so newly aging claims miss the weekly review.",
    "The reviewer closes an appeal based only on a note from the person who filed it.",
    "An open denial remains flagged without a named next step.",
  ],
  "c-schedule": [
    "The daily check uses a schedule copy saved before the latest changes.",
    "The person who changes the schedule confirms their own edits.",
    "A missed review stays unreported until someone asks about the schedule.",
  ],
  "c-clinical": [
    "The chart closes with required fields blank because the reviewer checks only its status.",
    "Charts left open at day's end are closed in a batch the next week without review.",
    "A late chart is marked complete without checking each required element.",
  ],
  "c-controlled": [
    "The counter copies the amount from the log instead of counting the stock.",
    "The person administering medication performs the count when the separate counter is away.",
    "A count difference is written down but its investigation never reaches a conclusion.",
  ],
  "c-inventory": [
    "The delivery count comes from the receiver's notes instead of a separate count.",
    "Stock changes are checked against the same count used to enter them.",
    "A mismatch is recorded but left unresolved before the next cycle count.",
  ],
  "c-trust-rec": [
    "The reconciliation uses client totals copied from the same journal it is meant to test.",
    "The preparer signs as reviewer when the partner who did not prepare it is away.",
    "A difference rolls into the next month without tracing which client balance changed.",
  ],
  "c-trust-disb": [
    "A payment goes out before its matter balance and partner approval are checked.",
    "An urgent disbursement moves before the partner reads the client ledger.",
    "A shortfall is noticed but nobody follows up before another trust payment leaves.",
  ],
  "c-salestax": [
    "The return is checked against a sales summary instead of the point-of-sale report.",
    "The preparer reads the state's payment confirmation and reports it as owner-reviewed.",
    "A difference in taxable sales remains open when the return is filed.",
  ],
  "c-tip-pool": [
    "The payout is compared with tip totals but not with the staff hours behind each share.",
    "A manager approves a pool share while also receiving money from that pool.",
    "A changed split passes review without a check against the written policy.",
  ],
  "c-change-orders": [
    "The project manager who negotiated a change also approves its price.",
    "Work starts before another person prices the change against the contract.",
    "Written approval arrives after payment, but nobody questions its late timing.",
  ],
  "c-sub-verify": [
    "The reviewer accepts a supplier packet without matching its details to public records.",
    "The person who pays a bill also completes the new supplier check.",
    "A missing license or insurance record is waived when the first payment is urgent.",
  ],
  "c-lien-waivers": [
    "The office releases payment with a waiver that covers a different payment.",
    "The conditional waiver is signed but never matched to the amount being paid.",
    "Another payment goes out while the last unconditional waiver remains missing.",
  ],
  "c-field-time": [
    "The superintendent approves total crew hours without matching them to daily reports.",
    "Payroll includes hours for a worker absent from the job roster.",
    "A late timesheet enters payroll because nobody returns it for another check.",
  ],
  "c-materials": [
    "The person who orders materials also signs for their arrival at the job.",
    "Material charges are moved to another job, so no single job looks over its estimate.",
    "A delivery note is accepted without counting the materials at the site.",
  ],
  "c-ro-cash": [
    "The cashier prepares the deposit list used to confirm repair-order receipts.",
    "The reviewer checks repair orders but leaves parts-ticket payments out of the match.",
    "A deposit difference is noted but never traced back to a ticket.",
  ],
  "c-dms-edits": [
    "The monthly report is filtered so voided or deleted transactions no longer appear.",
    "The reviewer reads change totals without sorting edits by the user who made them.",
    "An unusual edit is flagged, but nobody asks the person who made it why.",
  ],
  "c-parts-count": [
    "The stock count is performed by someone who also orders the parts.",
    "The comparison ignores sold or installed items when explaining missing stock.",
    "A discrepancy is adjusted in the system before anyone recounts the shelf.",
  ],
  "c-deal-audit": [
    "The second person checks the deal jacket summary but not its matching system record.",
    "A fee total is accepted without tracing what the dealership sent to the state.",
    "A missing rebate record passes because the deal jacket looks complete.",
  ],
  "c-warranty": [
    "A claim is approved from its invoice without matching labor and parts to the repair order.",
    "The service manager approves a goodwill write-off that the manager granted.",
    "A goodwill exception passes without checking whether it needs separate approval.",
  ],
  "c-sublet": [
    "A sublet invoice is paid with a repair number that does not show the outside work.",
    "A card charge is coded from a receipt with no repair-order reference.",
    "The person adding a repair reference also marks the charge ready for payment.",
  ],
  "c-je-review": [
    "A journal entry is approved from its description without the supporting record.",
    "The reviewer also posts some of the entries they are meant to read.",
    "An entry with missing support carries into the next close without follow-up.",
  ],
  "c-gift-log": [
    "Both mail openers also enter the gifts into the donor records.",
    "A cash gift is logged from one counter's note without a second count.",
    "The completed gift log stays with the person who records the donations.",
  ],
  "c-restricted": [
    "A restricted payment is coded to general expenses before its fund limit is checked.",
    "The quarterly review uses totals prepared by the person who coded the spending.",
    "A questioned expense stays charged to the fund without a documented follow-up.",
  ],
  "c-cards": [
    "The cardholder matches their own charges to receipts.",
    "The reviewer checks receipt amounts but not the program or fund purpose.",
    "The treasurer accepts the executive director's statement without opening its receipts.",
  ],
  "c-board-review": [
    "The treasurer receives a statement passed along by the person who reconciles it.",
    "The review checks the closing balance but not cleared checks or transfers.",
    "A transfer with no clear purpose is noted but never questioned.",
  ],
};

export const GENERIC_CONTROL_FAILURE_MODES: readonly string[] = [
  "The reviewer signs off without opening the records behind it.",
  "The person whose work it checks ends up doing the check.",
  "It is skipped in a busy week, and nobody notices the gap.",
];

export function controlFailureModes(controlId: string): readonly string[] {
  return CONTROL_FAILURE_MODES[controlId] ?? GENERIC_CONTROL_FAILURE_MODES;
}
