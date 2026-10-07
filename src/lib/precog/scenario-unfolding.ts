export interface ScenarioUnfolding {
  /** How it unfolds, in order: 3 or 4 short steps. */
  steps: readonly string[];
  /** What an owner can notice early: 3 or 4 signs. */
  warningSigns: readonly string[];
}

export const SCENARIO_UNFOLDING: Readonly<Record<string, ScenarioUnfolding>> = {
  "sc-front-desk-leaves": {
    steps: [
      "One person handles every insurance denial appeal and keeps the only working knowledge.",
      "They leave before a stand-in learns how to challenge denials.",
      "Open appeals wait while the team tries to reconstruct the work.",
      "Unanswered claims reveal that billing depends on one person.",
    ],
    warningSigns: [
      "Appeal questions keep returning to the same person.",
      "No active teammate can challenge a denial without help.",
      "Open appeal files have no ready stand-in.",
      "Billing pauses when the sole expert is unavailable.",
    ],
  },
  "sc-cash-sod-failure": {
    steps: [
      "The person who receives customer payments also records them and reconciles the bank.",
      "They divert a receipt or route money through an account outside the owner's view.",
      "They alter the books so the bank record appears to agree.",
      "A separate review or later owner check exposes the gap.",
    ],
    warningSigns: [
      "Customer deposits differ from invoices or point-of-sale records.",
      "An account takes customer payments but appears on no owner-reviewed statement.",
      "One person posts receipts and marks the bank check complete.",
      "No one outside that role reviews the reconciliation.",
    ],
  },
  "sc-writeoff-abuse": {
    steps: [
      "A staff member posts a large adjustment against a customer balance.",
      "The entry reduces reported revenue without another person's approval.",
      "The adjustment blends into routine billing records and remains unreviewed.",
      "A reconciliation or owner review finds the unexplained balance gap.",
    ],
    warningSigns: [
      "Large adjustments post under one login.",
      "Write-offs cluster around the same account or reporting period.",
      "Balances shrink without matching credits, refunds, or notes.",
      "The person posting adjustments also handles payment records.",
    ],
  },
  "sc-vendor-fraud": {
    steps: [
      "The person who pays bills creates a vendor they control.",
      "They submit invoices for services the business does not receive.",
      "They approve payment and change the ledger so the charges look ordinary.",
      "An independent check finds no work or delivery behind the invoices.",
    ],
    warningSigns: [
      "A new supplier has no clear link to delivered work.",
      "Invoices describe services no project record confirms.",
      "Vendor setup, payment, and record changes sit with one person.",
      "No one outside finance matches invoices to evidence of delivery.",
    ],
  },
  "sc-payroll-ghost": {
    steps: [
      "The person who runs payroll adds a new name or keeps someone who has left on the list.",
      "They enter hours for that person and point the pay at an account they control.",
      "The extra pay goes out with the normal pay run, so the total looks ordinary.",
      "Someone compares the people paid with the people who work there and finds the stranger.",
    ],
    warningSigns: [
      "More people are paid than work the schedule.",
      "Someone who has left still appears in a pay run.",
      "Two employees share a bank account or a home address.",
      "Nobody but the person who runs payroll reads the payroll register.",
    ],
  },
  "sc-drug-diversion": {
    steps: [
      "The person who handles controlled medication also keeps the log and counts.",
      "They remove medication and change the record or vial to hide the shortage.",
      "The count appears to match because the same person records both sides.",
      "A patient, inspection, or colleague brings the missing medication to light.",
    ],
    warningSigns: [
      "One person stocks medication, keeps the log, and signs the count.",
      "Vials have broken seals, changed contents, or mismatched labels.",
      "Counts match without a second person checking the medication.",
      "Patients or colleagues raise concerns about missing or changed medication.",
    ],
  },
  "sc-key-person-leaves": {
    steps: [
      "One person runs a critical daily routine and holds the only working knowledge of it.",
      "They leave before a stand-in learns the routine end to end.",
      "The work stalls or runs with mistakes while the team pieces it together.",
      "Delays and errors show how much depended on one person's knowledge.",
    ],
    warningSigns: [
      "No active teammate can run the routine alone.",
      "Questions about it keep returning to the same person.",
      "The steps are not written down anywhere a stand-in can find them.",
      "The work pauses whenever that person is away.",
    ],
  },
  "sc-trust-misappropriation": {
    steps: [
      "One person handles trust deposits, client payments, and the trust account reconciliation.",
      "They take money assigned to one client while the ledger keeps showing it there.",
      "A later client's deposit replaces the missing balance in the shared account.",
      "An independent three-way reconciliation exposes the client funds that are short.",
    ],
    warningSigns: [
      "The person sending trust money also reconciles the trust bank account.",
      "One client's ledger stays balanced only after another client's deposit arrives.",
      "No independent reviewer compares the bank, client ledgers, and trust balance.",
      "The reconciliation has no review from someone outside the process.",
    ],
  },
  "sc-salestax-unremitted": {
    steps: [
      "The person prepares the sales tax return from point-of-sale totals.",
      "They understate taxable sales or leave the tax payment unsent.",
      "They reconcile the bank without an independent check, hiding the gap.",
      "A state notice exposes the unpaid or underreported tax.",
    ],
    warningSigns: [
      "Reported sales do not match point-of-sale totals.",
      "Tax payments lack a matching cleared bank transaction.",
      "One person prepares, pays, and reconciles sales tax.",
      "State notices arrive about unpaid tax, penalties, or interest.",
    ],
  },
  "sc-tip-pool-manipulation": {
    steps: [
      "One person gathers point-of-sale tip totals and calculates the pool.",
      "They change the shares or hold back card tips before payroll.",
      "The same person sends the payouts and records the altered amounts.",
      "Staff compare their pay with point-of-sale totals and find the difference.",
    ],
    warningSigns: [
      "Tip totals by shift differ from the amounts on pay slips.",
      "An employee's share changes without a clear schedule rule.",
      "Card tips appear in point-of-sale records but not in payroll.",
      "The person calculating shares also sends the payouts.",
    ],
  },
  "sc-fictitious-sub": {
    steps: [
      "A person creates a subcontractor and directs its payments to an account they control.",
      "They submit bills for work that never happens or exceeds the job's needs.",
      "They code the invoices to a busy job so the extra cost looks ordinary.",
      "Someone compares the bill with job records and finds no matching work.",
    ],
    warningSigns: [
      "A subcontractor has no matching contract or approved work scope.",
      "Invoices lack work logs, delivery notes, or signed field records.",
      "Vendor setup and payment approval sit with one person.",
      "Job costs rise without matching progress in the field.",
    ],
  },
  "sc-change-order-kickback": {
    steps: [
      "A manager steers extra work to a favored subcontractor.",
      "The subcontractor bills more than the added work supports.",
      "The manager approves payment and receives part of the excess.",
      "An independent review compares prices and invoices with completed work.",
    ],
    warningSigns: [
      "Change orders cluster around one subcontractor.",
      "Invoice amounts rise faster than the approved work.",
      "One person negotiates changes and approves payment requests.",
      "Completed work does not match billed quantities or prices.",
    ],
  },
  "sc-material-theft": {
    steps: [
      "A person orders materials against an open job.",
      "They sign for delivery and record the stock, so the paperwork agrees.",
      "They take the materials to another site or resell them.",
      "A physical count or job review finds materials missing.",
    ],
    warningSigns: [
      "Purchase orders exceed the materials a job needs.",
      "The same person orders, receives, and records the stock.",
      "Job costs rise without matching use in the field.",
      "Physical stock does not match the inventory record.",
    ],
  },
  "sc-field-time-padding": {
    steps: [
      "Field timesheets reach payroll without a check against daily reports.",
      "Someone adds extra hours or keeps a departed worker on payroll.",
      "The inflated hours or changed bank details pass with the normal pay run.",
      "A comparison of field reports and payroll reveals the mismatch.",
    ],
    warningSigns: [
      "Paid hours exceed daily reports or crew logs.",
      "A former worker remains on the active payroll.",
      "An employee's bank details change shortly before payday.",
      "Timesheets reach payroll without an independent comparison.",
    ],
  },
  "sc-ro-cash-skim": {
    steps: [
      "A customer pays cash at the service counter.",
      "The person keeps the cash and edits the repair order or payment record.",
      "The ticket closes as a void, discount, or payment that never happened.",
      "A review compares completed repairs with the register and deposit.",
    ],
    warningSigns: [
      "Closed repair orders show voids or discounts after work is complete.",
      "Cash receipts do not match completed repair tickets.",
      "One login records payments and edits repair orders.",
      "A ticket shows a card payment with no matching processor record.",
    ],
  },
  "sc-wire-je-cover": {
    steps: [
      "A person sends a wire to an account they control.",
      "They post a journal entry to an expense, vehicle, or schedule.",
      "The books close because the ledger includes the cover entry.",
      "An independent bank review matches outgoing wires to approved payees.",
    ],
    warningSigns: [
      "Manual entries cluster around outgoing wires.",
      "Bank payees do not match supplier names in the ledger.",
      "One person releases payments and posts closing entries.",
      "Transactions clear without an invoice or approval to support them.",
    ],
  },
  "sc-parts-resale": {
    steps: [
      "The parts desk orders stock the shop does not need.",
      "The same person signs for delivery and records it in inventory.",
      "They remove the parts and sell them outside the shop.",
      "A physical count or sales review finds items missing from the shelves.",
    ],
    warningSigns: [
      "Orders do not match repair tickets or planned work.",
      "The same person orders, receives, and records the parts.",
      "Inventory records show items no one can locate.",
      "Sales outside the shop have no matching service ticket.",
    ],
  },
  "sc-deal-fee-skim": {
    steps: [
      "A person records a vehicle deal and handles its title paperwork.",
      "They keep a customer fee or redirect a manufacturer rebate.",
      "They complete the deal jacket so the missing money is not obvious.",
      "A separate check of receipts, titles, and credits finds the gap.",
    ],
    warningSigns: [
      "Fee receipts do not match the amount sent with title paperwork.",
      "Manufacturer rebates land in an account the dealership does not own.",
      "Deal jackets look complete but lack matching remittance records.",
      "One person posts deals, files titles, and claims incentives.",
    ],
  },
  "sc-skimmed-donations": {
    steps: [
      "One person opens donation mail or counts event cash.",
      "They keep a gift before it enters the donor or deposit record.",
      "They record the gift so the donor still receives a thank-you.",
      "A deposit comparison or donor check reveals the missing contribution.",
    ],
    warningSigns: [
      "Acknowledgements exceed gifts recorded in bank deposits.",
      "Mail, event cash, and gift records sit with the same person.",
      "Donor records show gifts that do not appear in the bank.",
      "No one independently compares event counts with the deposit.",
    ],
  },
  "sc-restricted-diverted": {
    steps: [
      "A grant or restricted gift enters the operating account without its own fund code.",
      "The person paying bills uses the pooled balance for rent, payroll, or another shortfall.",
      "The books do not show which funds remain available for the grant.",
      "A grant report or independent account check finds money already spent.",
    ],
    warningSigns: [
      "Restricted deposits have no fund code or separate balance.",
      "Rent or payroll clears against grant funds without a matching approval.",
      "The grant ledger does not match spending allowed by the funder.",
      "Reports promise funds the bank balance cannot cover.",
    ],
  },
  "sc-card-abuse": {
    steps: [
      "A cardholder makes personal purchases or cash advances on a business card.",
      "They code each charge as a program or business expense.",
      "The cardholder approves their own statement, or nobody reviews it.",
      "An independent receipt and purpose check reveals the personal charges.",
    ],
    warningSigns: [
      "Card statements reach only the person who spends.",
      "Receipts are missing or do not match program activity.",
      "Cash advances have no named business purpose.",
      "Personal merchants recur among ordinary supplier charges.",
    ],
  },
};

export function scenarioUnfolding(id: string): ScenarioUnfolding | null {
  return SCENARIO_UNFOLDING[id] ?? null;
}
