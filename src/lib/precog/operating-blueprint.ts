import type { IndustryId } from "./industry";

/**
 * The operating blueprint: for each money process, what a sound version of
 * it looks like at three levels, who owns and who checks it, and the
 * evidence that shows it ran. Seven processes are the same in every line
 * of business and are worded with that industry's terms; three more belong
 * to the industry alone.
 */
export type PracticeProcessDomain =
  "revenue" | "cash" | "purchasing" | "payroll" | "operations" | "technology" | "governance";

interface PracticeProcessBlueprint {
  id: string;
  name: string;
  domain: PracticeProcessDomain;
  objective: string;
  primaryOwner: string;
  independentReviewer: string;
  standard: string[];
  leading: string[];
  optimal: string[];
  fallback: string[];
  evidence: string[];
  cadence: string;
}

/** The words that differ between lines of business inside the shared processes. */
interface Vocabulary {
  /** Who pays the business. */
  customer: string;
  customers: string;
  /** The system of record for sales and receivables. */
  system: string;
  /** What is issued to be paid. */
  bill: string;
  bills: string;
  /** Who runs the front of the business day to day. */
  frontLead: string;
  /** Who keeps the books. */
  books: string;
  /** Who signs off. */
  approver: string;
}

const VOCAB: Record<IndustryId, Vocabulary> = {
  dental: {
    customer: "patient",
    customers: "patients",
    system: "practice management system",
    bill: "claim",
    bills: "claims",
    frontLead: "Front desk lead",
    books: "Office manager",
    approver: "Owner dentist",
  },
  retail: {
    customer: "customer",
    customers: "customers",
    system: "point-of-sale system",
    bill: "invoice",
    bills: "invoices",
    frontLead: "Store manager",
    books: "Bookkeeper",
    approver: "Owner",
  },
  professional_services: {
    customer: "client",
    customers: "clients",
    system: "billing system",
    bill: "invoice",
    bills: "invoices",
    frontLead: "Office manager",
    books: "Bookkeeper",
    approver: "Managing partner",
  },
  restaurant: {
    customer: "guest",
    customers: "guests",
    system: "point-of-sale system",
    bill: "check",
    bills: "checks",
    frontLead: "General manager",
    books: "Bookkeeper",
    approver: "Owner",
  },
  construction: {
    customer: "customer",
    customers: "customers",
    system: "job-costing system",
    bill: "progress bill",
    bills: "progress bills",
    frontLead: "Project manager",
    books: "Office manager",
    approver: "Owner",
  },
  automotive: {
    customer: "customer",
    customers: "customers",
    system: "dealer management system",
    bill: "repair order",
    bills: "repair orders",
    frontLead: "Service manager",
    books: "Office manager",
    approver: "Dealer principal",
  },
  nonprofit: {
    customer: "donor",
    customers: "donors and funders",
    system: "donor database",
    bill: "pledge or grant invoice",
    bills: "pledges and grant invoices",
    frontLead: "Program director",
    books: "Finance manager",
    approver: "Executive director and treasurer",
  },
  general: {
    customer: "customer",
    customers: "customers",
    system: "accounting system",
    bill: "invoice",
    bills: "invoices",
    frontLead: "Operations lead",
    books: "Bookkeeper",
    approver: "Owner",
  },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sharedBlueprints(v: Vocabulary): PracticeProcessBlueprint[] {
  return [
    {
      id: "billing-ar",
      name: `${cap(v.bills)}, credits and receivables`,
      domain: "revenue",
      objective: `Every sale produces a ${v.bill}, someone follows up every unpaid ${v.bill}, and every credit has a reason.`,
      primaryOwner: v.books,
      independentReviewer: v.approver,
      standard: [
        `Reconcile sales to ${v.bills} issued`,
        "Work the aging by priority",
        "Reason-code every adjustment and write-off",
      ],
      leading: [
        "Exception queue for unbilled work and stalled items",
        "Adjustment approval thresholds",
        "Aging trend by cause",
      ],
      optimal: [
        `Automated ${v.system} to bank reconciliation`,
        "Sampled review of credits by user",
      ],
      fallback: ["Weekly aging review", "Monthly adjustment and write-off sample"],
      evidence: [`${cap(v.bill)} reconciliation`, "Aging report", "Adjustment register"],
      cadence: "Weekly; monthly review",
    },
    {
      id: "cash-receipts",
      name: "Cash, card and deposits",
      domain: "cash",
      objective: `Money taken from ${v.customers} equals money recorded and money banked.`,
      primaryOwner: v.frontLead,
      independentReviewer: v.books,
      standard: [
        `Deposit equals the ${v.system}'s receipts for the day`,
        "Card batches tie to the processor statement",
        "Someone other than the taker counts and deposits",
      ],
      leading: [
        `Automated bank-to-${v.system} reconciliation`,
        "Same-day variance follow-up",
        "Deposit timing tracked",
      ],
      optimal: ["Daily exception alerts", "Variance trend by day and person"],
      fallback: ["Weekly deposit tie-out", "Owner review of variances"],
      evidence: ["Daily close report", "Deposit slip", "Variance log"],
      cadence: "Daily; weekly tie-out",
    },
    {
      id: "refunds-writeoffs",
      name: "Refunds, voids and write-offs",
      domain: "revenue",
      objective: "Money given back or forgiven is real, approved, and traceable.",
      primaryOwner: v.books,
      independentReviewer: v.approver,
      standard: [
        "Approval above a set amount",
        "Refund goes to the original payer and method",
        "Void and write-off reasons recorded",
      ],
      leading: [
        `Refunds by user, ${v.customer}, method and frequency reviewed`,
        "Repeat payee or address detection",
      ],
      optimal: ["Automated outlier flags", "Sampled call-backs to the payer"],
      fallback: ["Monthly refund and void listing", "Owner initials on the sample"],
      evidence: ["Refund register", "Void report", "Approval trail"],
      cadence: "Weekly; monthly sample",
    },
    {
      id: "procure-pay",
      name: "Suppliers, bills and payments",
      domain: "purchasing",
      objective:
        "Real suppliers, real goods, approved bills, released by someone who did not enter them.",
      primaryOwner: v.books,
      independentReviewer: v.approver,
      standard: [
        "New suppliers approved by a second person",
        "Bill matched to order and receipt",
        "Payment released by someone other than the preparer",
      ],
      leading: [
        "Bank detail changes verified by call-back",
        "Dual release above a threshold",
        "Vendor master change report",
      ],
      optimal: ["Positive pay or ACH filters", "Duplicate payment detection"],
      fallback: ["Monthly vendor master review", "Owner signs checks above the threshold"],
      evidence: ["Approved supplier list", "Match report", "Release log"],
      cadence: "Per payment run; monthly review",
    },
    {
      id: "payroll",
      name: "Payroll and pay changes",
      domain: "payroll",
      objective: "Payroll pays only real people, at approved rates, into their own accounts.",
      primaryOwner: v.books,
      independentReviewer: v.approver,
      standard: [
        "Pay rate and bank detail changes approved",
        "Headcount on the roster agrees to payroll",
        "People who left removed before the next run",
      ],
      leading: ["External payroll provider plus owner release", "Change report reviewed each run"],
      optimal: ["Automated register-to-payroll comparison", "Ghost employee tests"],
      fallback: ["Quarterly headcount reconciliation", "Owner reviews the change report"],
      evidence: ["Payroll register", "Change report", "Approval trail"],
      cadence: "Per pay run; quarterly reconciliation",
    },
    {
      id: "access-change",
      name: "System access and changes",
      domain: "technology",
      objective: `Access to the ${v.system}, the bank and payroll matches the job, and changes leave a trail.`,
      primaryOwner: v.books,
      independentReviewer: v.approver,
      standard: [
        "Named sign-ins, no shared accounts",
        "Access removed on the last day",
        "Admin rights held by as few people as possible",
      ],
      leading: [
        "Quarterly access review against the Duty map",
        "Audit log review for sensitive changes",
      ],
      optimal: ["Automated access reconciliation from exports", "Alerts on admin role changes"],
      fallback: ["Semi-annual access listing reviewed by the owner"],
      evidence: ["User list export", "Access review sign-off", "Audit log sample"],
      cadence: "On every hire and every person leaving; quarterly review",
    },
    {
      id: "close-report",
      name: "Month-end close and reporting",
      domain: "governance",
      objective: "The owner sees true numbers, on time, from someone who did not make them.",
      primaryOwner: v.books,
      independentReviewer: v.approver,
      standard: [
        "Bank reconciliation reviewed by someone who does not post",
        "Manual journal entries listed and explained",
        "Owner opens the bank statement",
      ],
      leading: ["Close checklist with sign-offs", "Variance commentary against budget"],
      optimal: ["Outside accountant reviews the close quarterly", "Trend dashboards"],
      fallback: ["Owner compares bank statement to the books monthly"],
      evidence: ["Reconciliation sign-off", "Journal entry listing", "Close checklist"],
      cadence: "Monthly",
    },
  ];
}

const INDUSTRY_BLUEPRINTS: Record<IndustryId, PracticeProcessBlueprint[]> = {
  dental: [
    {
      id: "patient-intake",
      name: "Patient intake, scheduling and eligibility",
      domain: "operations",
      objective: "Accurate patient, coverage, consent, and appointment data before care.",
      primaryOwner: "Front desk lead",
      independentReviewer: "Office manager",
      standard: [
        "Verify identity and coverage",
        "Document consent and estimates",
        "Review no-shows and overrides",
      ],
      leading: [
        "Automated eligibility checks",
        "Same-day exception queue",
        "Role-based schedule overrides",
      ],
      optimal: [
        "Daily exception dashboard with owner trends",
        "Measured access, utilization, and no-show causes",
      ],
      fallback: [
        "Weekly sample of registrations and overrides",
        "Owner review of unresolved eligibility exceptions",
      ],
      evidence: ["Eligibility result", "Consent", "Override report"],
      cadence: "Daily; monthly trend review",
    },
    {
      id: "clinical-documentation",
      name: "Clinical documentation, coding and charge capture",
      domain: "operations",
      objective: "Complete, supported, timely records and charges for services performed.",
      primaryOwner: "Treating provider",
      independentReviewer: "Clinical lead or billing specialist",
      standard: [
        "Provider closes notes",
        "Codes trace to documentation",
        "Late changes retain an audit trail",
      ],
      leading: [
        "Pre-bill missing-note edits",
        "Targeted coding QA",
        "Exception analytics by procedure",
      ],
      optimal: ["Automated documentation-to-charge reconciliation", "Risk-based coding samples"],
      fallback: ["Weekly unsigned-note list", "Monthly sample by provider and high-risk code"],
      evidence: ["Closed note report", "Coding sample", "Late-entry log"],
      cadence: "Daily; monthly QA",
    },
    {
      id: "insurance-adjustments",
      name: "Insurance adjustments and patient balances",
      domain: "revenue",
      objective:
        "Contractual adjustments are what the carrier allows, not a place to hide a payment kept.",
      primaryOwner: "Billing specialist",
      independentReviewer: "Owner dentist",
      standard: [
        "Adjustment equals the carrier's explanation of benefits",
        "Patient balance changes reason-coded",
      ],
      leading: [
        "Adjustment report by user compared to carrier remits",
        "Zero-balance accounts sampled",
      ],
      optimal: ["Automated remit posting", "Outlier adjustments flagged"],
      fallback: ["Monthly adjustment listing initialed by the owner"],
      evidence: ["Adjustment register", "Remit match", "Sample sign-off"],
      cadence: "Per remit; monthly review",
    },
  ],
  retail: [
    {
      id: "register-returns",
      name: "Register sales, returns and discounts",
      domain: "operations",
      objective: "Every sale rings, every return has a receipt, every discount has a reason.",
      primaryOwner: "Store manager",
      independentReviewer: "Owner",
      standard: [
        "Named POS sign-ins",
        "Return requires the original receipt or manager code",
        "Discount and no-sale reasons recorded",
      ],
      leading: [
        "Void, return and no-sale report by cashier reviewed weekly",
        "Manager code use logged",
      ],
      optimal: ["Exception analytics by cashier and hour", "Camera-to-transaction sampling"],
      fallback: ["Weekly review of returns and voids by the owner"],
      evidence: ["Return log", "Void report", "Discount report"],
      cadence: "Daily close; weekly review",
    },
    {
      id: "inventory-shrink",
      name: "Receiving, inventory and shrink",
      domain: "purchasing",
      objective:
        "Everything the store paid for arrived, someone counts what is on the shelf, and someone explains any shrink.",
      primaryOwner: "Inventory lead",
      independentReviewer: "Store manager",
      standard: [
        "Receipts counted against the order by someone who did not order",
        "Cycle counts on high-value lines",
        "Adjustments approved",
      ],
      leading: ["Shrink by category tracked", "Adjustment report by user reviewed"],
      optimal: ["Perpetual inventory with exception alerts", "Sampled blind counts"],
      fallback: ["Quarterly full count with the owner present"],
      evidence: ["Receiving log", "Count sheets", "Adjustment report"],
      cadence: "Per delivery; monthly counts",
    },
    {
      id: "gift-cards-loyalty",
      name: "Gift cards, store credit and loyalty",
      domain: "revenue",
      objective:
        "The store issues stored value only for money received, and a customer can redeem it only once.",
      primaryOwner: "Store manager",
      independentReviewer: "Bookkeeper",
      standard: [
        "Issuance tied to a tendered sale",
        "Liability reconciled monthly",
        "Manual credits approved",
      ],
      leading: ["Issuance and redemption by user reviewed", "Dormant balance activity flagged"],
      optimal: ["Automated liability reconciliation", "Outlier redemption alerts"],
      fallback: ["Monthly listing of manual credits reviewed by the owner"],
      evidence: ["Liability reconciliation", "Manual credit report"],
      cadence: "Monthly",
    },
  ],
  professional_services: [
    {
      id: "time-billing",
      name: "Time capture, rates and invoicing",
      domain: "revenue",
      objective:
        "The firm records all work done, bills it at the agreed rate, and writes it down only for a stated reason.",
      primaryOwner: "Billing coordinator",
      independentReviewer: "Managing partner",
      standard: [
        "Time entered within the week",
        "Rate changes approved",
        "Write-downs reason-coded and approved",
      ],
      leading: [
        "Unbilled work-in-progress aged and reviewed",
        "Write-down report by matter and person",
      ],
      optimal: ["Automated WIP-to-invoice reconciliation", "Realization trend by partner"],
      fallback: ["Monthly WIP review by the partners"],
      evidence: ["WIP report", "Write-down register", "Rate approval"],
      cadence: "Weekly; monthly review",
    },
    {
      id: "client-trust",
      name: "Client trust and retainer accounts",
      domain: "cash",
      objective:
        "Money held for clients stays theirs; the firm reconciles it three ways and moves it only with authority.",
      primaryOwner: "Bookkeeper",
      independentReviewer: "Managing partner",
      standard: [
        "Trust account reconciled monthly to the bank and to each client ledger",
        "Disbursements approved by a partner",
        "No fees paid from trust before earned",
      ],
      leading: [
        "Three-way reconciliation reviewed by a partner",
        "Exception list of negative client balances",
      ],
      optimal: ["Automated three-way reconciliation", "Outside review annually"],
      fallback: ["Partner opens the trust bank statement monthly"],
      evidence: ["Three-way reconciliation", "Disbursement approvals"],
      cadence: "Monthly",
    },
    {
      id: "engagement-acceptance",
      name: "Engagement acceptance and expenses",
      domain: "governance",
      objective:
        "The firm takes on work knowingly, and every expense it bills to a client is real.",
      primaryOwner: "Managing partner",
      independentReviewer: "Second partner",
      standard: [
        "Engagement letter before work",
        "Expense receipts attached",
        "Client expense markups disclosed",
      ],
      leading: ["Expense report by person reviewed", "Conflict check recorded"],
      optimal: ["Automated expense capture", "Sampled client expense audit"],
      fallback: ["Quarterly expense review by a partner"],
      evidence: ["Engagement letters", "Expense reports"],
      cadence: "Per engagement; quarterly review",
    },
  ],
  restaurant: [
    {
      id: "comps-voids",
      name: "Comps, voids and discounts",
      domain: "operations",
      objective: "Someone with authority approves and counts all food and drink given away.",
      primaryOwner: "General manager",
      independentReviewer: "Owner",
      standard: [
        "Manager approval for comps and voids",
        "Reasons recorded at the terminal",
        "Named sign-ins on every server",
      ],
      leading: [
        "Comp and void report by server and manager reviewed daily",
        "Pattern review by shift",
      ],
      optimal: ["Exception analytics against sales mix", "Camera sampling of voided checks"],
      fallback: ["Weekly comp and void listing reviewed by the owner"],
      evidence: ["Comp report", "Void report", "Manager approval log"],
      cadence: "Daily close; weekly review",
    },
    {
      id: "tips-payroll",
      name: "Tips, tip pooling and payroll",
      domain: "payroll",
      objective:
        "Tips reach the people who earned them, and the restaurant reports them as the law requires.",
      primaryOwner: "General manager",
      independentReviewer: "Bookkeeper",
      standard: [
        "Tip pool rules written and posted",
        "Tip-out calculated from the POS report",
        "Tips reported through payroll",
      ],
      leading: ["Tip report reconciled to card tips each shift", "Employee sign-off on the pool"],
      optimal: [
        "Automated tip allocation",
        "Quarterly review against the IRS 8% tip-allocation rule (Form 8027, establishments with more than 10 employees)",
      ],
      fallback: ["Monthly reconciliation of card tips to payroll"],
      evidence: ["Tip pool sheet", "POS tip report", "Payroll register"],
      cadence: "Per shift; monthly reconciliation",
    },
    {
      id: "food-liquor-inventory",
      name: "Food and liquor purchasing and inventory",
      domain: "purchasing",
      objective:
        "Everything the restaurant ordered arrived, the kitchen and bar used what arrived, and someone explains the pour cost.",
      primaryOwner: "Kitchen manager or bar manager",
      independentReviewer: "General manager",
      standard: [
        "Deliveries checked against the order by someone who did not order",
        "Weekly counts of liquor and high-cost items",
        "Waste logged",
      ],
      leading: ["Food and pour cost tracked weekly", "Variance by item reviewed"],
      optimal: ["Perpetual inventory with variance alerts", "Blind counts sampled"],
      fallback: ["Monthly count with the owner present"],
      evidence: ["Receiving log", "Count sheets", "Cost report"],
      cadence: "Per delivery; weekly counts",
    },
  ],
  construction: [
    {
      id: "job-costing",
      name: "Job costing and change orders",
      domain: "operations",
      objective:
        "Every cost lands on the right job, and every change has an agreed price and a signature before the work starts.",
      primaryOwner: "Project manager",
      independentReviewer: "Owner",
      standard: [
        "Costs coded to a job at entry",
        "Change orders signed by the customer before work",
        "Budget-to-actual reviewed monthly",
      ],
      leading: ["Cost-to-complete estimates updated", "Unapproved change order list reviewed"],
      optimal: ["Field time and materials captured at source", "Margin fade alerts"],
      fallback: ["Monthly job margin review by the owner"],
      evidence: ["Job cost report", "Signed change orders"],
      cadence: "Weekly coding; monthly review",
    },
    {
      id: "progress-billing",
      name: "Progress billing, retainage and lien waivers",
      domain: "revenue",
      objective:
        "Billing follows the work completed, and the business releases money owed to subcontractors only on proof.",
      primaryOwner: "Office manager",
      independentReviewer: "Owner",
      standard: [
        "Pay applications tie to the schedule of values",
        "Retainage tracked by job",
        "Lien waivers before subcontractor payment",
      ],
      leading: ["Over- and under-billing analyzed monthly", "Waiver register reconciled"],
      optimal: ["Automated schedule-of-values billing", "Retainage release approval workflow"],
      fallback: ["Owner reviews each pay application before it goes out"],
      evidence: ["Pay applications", "Retainage schedule", "Waiver register"],
      cadence: "Per billing cycle",
    },
    {
      id: "equipment-materials",
      name: "Equipment, materials and yard",
      domain: "purchasing",
      objective: "Materials bought reach the job, and equipment is where the records say.",
      primaryOwner: "Yard or warehouse lead",
      independentReviewer: "Project manager",
      standard: [
        "Deliveries signed for on site",
        "Equipment log by job",
        "Fuel card use reconciled",
      ],
      leading: ["Materials variance by job reviewed", "GPS or telematics on major equipment"],
      optimal: ["Automated fuel and equipment reconciliation", "Sampled site counts"],
      fallback: ["Quarterly equipment inventory"],
      evidence: ["Delivery tickets", "Equipment log", "Fuel reconciliation"],
      cadence: "Per delivery; quarterly inventory",
    },
  ],
  automotive: [
    {
      id: "repair-orders",
      name: "Repair orders, service cash and warranty claims",
      domain: "operations",
      objective:
        "The dealership prices, closes and collects every repair order on the record, and claims every warranty dollar it earns.",
      primaryOwner: "Service manager",
      independentReviewer: "Dealer principal",
      standard: [
        "Repair orders closed the day the vehicle leaves",
        "Cash and check payments matched to the deposit daily by someone who takes none",
        "Warranty claims filed inside the manufacturer's window",
      ],
      leading: [
        "Edited, voided and discounted repair orders reviewed by user monthly",
        "Goodwill above a set amount approved by the dealer principal",
      ],
      optimal: [
        "DMS cash report reconciled to the bank automatically",
        "Claim denials and chargebacks trended by cause",
      ],
      fallback: ["Owner reads the repair-order cash report against the deposits each month"],
      evidence: ["Closed repair orders", "Cash-to-deposit match", "Claim submission log"],
      cadence: "Daily close; monthly review",
    },
    {
      id: "parts-inventory",
      name: "Parts ordering, receiving and counter sales",
      domain: "purchasing",
      objective:
        "Parts bought reach a repair order or a shelf, and the shelf agrees with the books.",
      primaryOwner: "Parts manager",
      independentReviewer: "Service manager",
      standard: [
        "Deliveries signed for by someone other than the person who ordered",
        "Counter sales rung through the DMS with a receipt",
        "Cores and returns credited inside the supplier's window",
      ],
      leading: [
        "Purchases compared with parts sold or installed, by category",
        "Obsolescence reviewed quarterly",
      ],
      optimal: [
        "Perpetual inventory with cycle counts",
        "Supplier electronic invoicing matched automatically",
      ],
      fallback: ["Quarterly count by someone outside the parts desk"],
      evidence: ["Receiving log", "Count sheets", "Purchases-to-sales comparison"],
      cadence: "Per delivery; quarterly count",
    },
    {
      id: "vehicle-deals-title",
      name: "Vehicle deals, F&I and title work",
      domain: "revenue",
      objective:
        "Every deal funds as written, every fee collected reaches the state, and every rebate reaches the dealership.",
      primaryOwner: "Sales and F&I manager",
      independentReviewer: "Office manager",
      standard: [
        "Down payments receipted by the cashier, not the F&I office",
        "Deal jackets audited against the DMS before posting",
        "Title and registration fees remitted and logged by deal",
      ],
      leading: [
        "Contracts in transit aged weekly",
        "Rebate and incentive claims reconciled to receipts",
      ],
      optimal: [
        "Electronic titling with the state",
        "Deal audit exceptions trended by salesperson",
      ],
      fallback: ["Dealer principal reviews fees, payoffs and rebates by deal each month"],
      evidence: ["Deal jacket checklist", "Remittance log", "Contracts-in-transit schedule"],
      cadence: "Per deal; weekly schedule review",
    },
  ],
  nonprofit: [
    {
      id: "donations-pledges",
      name: "Donations, pledges and receipting",
      domain: "revenue",
      objective: "Different people record, receipt, and bank each gift.",
      primaryOwner: "Development lead",
      independentReviewer: "Finance manager",
      standard: [
        "Mail opened and logged by two people",
        "Receipts issued from the donor database",
        "Deposit equals the gift log",
      ],
      leading: ["Gift log to bank to database reconciliation monthly", "Pledge aging reviewed"],
      optimal: ["Online giving posted automatically", "Sampled donor confirmations"],
      fallback: ["Treasurer reviews the gift log against the bank statement"],
      evidence: ["Gift log", "Receipt register", "Reconciliation"],
      cadence: "Per deposit; monthly reconciliation",
    },
    {
      id: "restricted-funds",
      name: "Grants, restricted funds and compliance",
      domain: "governance",
      objective:
        "The organization spends restricted money on what the donor gave it for, and the funder can see it.",
      primaryOwner: "Finance manager",
      independentReviewer: "Executive director and treasurer",
      standard: [
        "Restricted balances tracked by fund",
        "Expenses coded to grants at entry",
        "Reports filed on the funder's schedule",
      ],
      leading: ["Release-from-restriction schedule reviewed", "Grant budget-to-actual monthly"],
      optimal: ["Fund accounting with drawdown controls", "Board finance committee review"],
      fallback: ["Quarterly restricted fund reconciliation to the board"],
      evidence: ["Fund balance report", "Grant reports", "Board minutes"],
      cadence: "Monthly; per funder deadline",
    },
    {
      id: "program-expense-allocation",
      name: "Program expenses, credit cards and reimbursements",
      domain: "purchasing",
      objective: "Spending serves the mission, and someone other than the spender approves it.",
      primaryOwner: "Program director",
      independentReviewer: "Finance manager",
      standard: [
        "Card statements reviewed with receipts",
        "Reimbursements approved by a supervisor",
        "Executive director's spending approved by the board chair",
      ],
      leading: ["Spending by cardholder reviewed monthly", "Allocation method documented"],
      optimal: ["Expense management system with approval routing", "Sampled receipt audit"],
      fallback: ["Treasurer reviews the executive director's expenses quarterly"],
      evidence: ["Card statements", "Approval trail", "Allocation worksheet"],
      cadence: "Monthly",
    },
  ],
  general: [
    {
      id: "sales-orders",
      name: "Quotes, orders and delivery",
      domain: "operations",
      objective: "The business delivers and bills exactly what it sold.",
      primaryOwner: "Operations lead",
      independentReviewer: "Owner",
      standard: [
        "Order matches the quote",
        "Delivery confirmed before billing",
        "Price changes approved",
      ],
      leading: ["Unbilled deliveries reviewed weekly", "Margin by order tracked"],
      optimal: ["Order-to-invoice reconciliation automated", "Outlier discounts flagged"],
      fallback: ["Monthly review of open orders by the owner"],
      evidence: ["Order log", "Delivery confirmations"],
      cadence: "Weekly",
    },
    {
      id: "inventory-assets",
      name: "Inventory and equipment",
      domain: "purchasing",
      objective: "What the business paid for is on hand and counted.",
      primaryOwner: "Operations lead",
      independentReviewer: "Bookkeeper",
      standard: ["Receipts checked against orders", "Periodic counts", "Adjustments approved"],
      leading: ["Variance by item reviewed", "Asset register maintained"],
      optimal: ["Perpetual inventory with alerts", "Blind counts sampled"],
      fallback: ["Annual count with the owner present"],
      evidence: ["Count sheets", "Adjustment report", "Asset register"],
      cadence: "Per delivery; periodic counts",
    },
    {
      id: "credit-cards-expenses",
      name: "Company cards and expense claims",
      domain: "purchasing",
      objective: "Card and expense spending is business spending, seen by someone else.",
      primaryOwner: "Bookkeeper",
      independentReviewer: "Owner",
      standard: [
        "Statements reviewed with receipts",
        "Claims approved by someone other than the claimant",
        "Card limits set per person",
      ],
      leading: ["Spending by cardholder reviewed monthly", "Merchant category exceptions flagged"],
      optimal: ["Expense system with approval routing", "Sampled receipt audit"],
      fallback: ["Owner reviews every card statement"],
      evidence: ["Card statements", "Approval trail"],
      cadence: "Monthly",
    },
  ],
};

/** The blueprint for one line of business: its own processes first, then the shared ones in its words. */
export function blueprintsForIndustry(industry: IndustryId): PracticeProcessBlueprint[] {
  return [...INDUSTRY_BLUEPRINTS[industry], ...sharedBlueprints(VOCAB[industry])];
}
