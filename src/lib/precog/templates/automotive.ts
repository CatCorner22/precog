import type { ControlItem, ScenarioTemplate } from "../types";
import type { IndustrySample } from "./types";
import {
  baseFinancialControls,
  baseFraudScenarios,
  SAMPLE_SAFEGUARDS,
  SCENARIO_FIGURES,
} from "./shared-controls";

/**
 * An independent dealership with a service department, or a repair shop, of
 * 5 to 40 people: a small office running the dealer management system (DMS),
 * a service desk writing repair orders and taking payment, a parts counter,
 * a sales floor with an F&I office, and technicians paid on flat rate.
 *
 * The controls and scenarios below follow schemes documented in dealership
 * prosecutions and in the ACFE's occupational-fraud taxonomy: customer cash
 * on repair orders kept and the DMS entries edited to match, money wired out
 * of the dealership and balanced with journal entries, parts ordered to stock
 * and sold on the side, and title fees or rebates collected and never
 * remitted. The case library holds dealership cases for the first two (see
 * evidence/cases.ts: Burlington and Granger) and a parts-desk case for the
 * third (Evansville).
 */
const automotiveControls: ControlItem[] = [
  {
    id: "c-ro-cash",
    name: "Repair-order cash to deposit match",
    description:
      "Someone who takes no payments and posts none matches each day's cash and check payments on repair orders and parts tickets to the same day's deposit.",
    duties: ["custody", "reconciliation"],
    segregated: false,
    compensatingControls: ["Owner compares repair-order cash totals with the deposits monthly"],
    residualRiskAccepted: false,
  },
  {
    id: "c-dms-edits",
    name: "DMS edited and deleted transaction review",
    description:
      "Each month, someone who cannot edit transactions reads the dealer management system's list of edited, voided and deleted transactions, by user.",
    duties: ["recording", "review"],
    segregated: false,
    compensatingControls: ["Monthly edited-transaction report by user, read by the owner"],
    residualRiskAccepted: false,
  },
  {
    id: "c-parts-count",
    name: "Independent parts count",
    description:
      "Someone who neither orders nor receives parts counts the stock each quarter and compares the count with what the dealership bought and what it sold or installed.",
    duties: ["custody", "review"],
    segregated: false,
    compensatingControls: ["Quarterly count by someone outside the parts desk"],
    residualRiskAccepted: false,
  },
  {
    id: "c-deal-audit",
    name: "Deal jacket and title-fee audit",
    description:
      "A second person checks every deal jacket against the DMS: down payment and trade, lender payoff, rebates and incentives, and the title and registration fees collected against what the dealership remitted to the state.",
    duties: ["authorization", "review"],
    segregated: false,
    compensatingControls: [
      "Owner reviews rebates, payoffs and title-fee remittances by deal each month",
    ],
    residualRiskAccepted: false,
  },
  {
    id: "c-warranty",
    name: "Warranty and goodwill claim review",
    description:
      "Warranty claims match the labor and parts on the repair order, and someone other than the service manager who granted them approves goodwill write-offs above a set amount.",
    duties: ["authorization", "review"],
    segregated: false,
    compensatingControls: ["Goodwill write-offs above a set amount need the owner's approval"],
    residualRiskAccepted: false,
  },
  {
    id: "c-sublet",
    name: "Sublet and outside-purchase approval",
    description:
      "Every sublet invoice and every card purchase for the shop carries a repair-order number, and the office pays or codes it only when that repair order shows the work or the part.",
    duties: ["authorization", "review"],
    segregated: true,
    compensatingControls: [],
    residualRiskAccepted: false,
  },
  {
    id: "c-je-review",
    name: "Manual journal entry review",
    description:
      "Every manual journal entry carries its support, and the owner or an outside accountant who posts none of them reads the month's entries.",
    duties: ["review"],
    segregated: false,
    compensatingControls: ["Outside accountant reviews manual entries each quarter"],
    residualRiskAccepted: false,
  },
];

/*
 * The scenario timelines and loss figures are the same illustrative model
 * inputs the shared scenarios use for the closest scheme (the cash scenario
 * for skimming, vendor fraud for payment schemes, the write-off scenario for
 * non-cash theft). They are assumptions for the model, not measurements.
 */
const automotiveScenarios: ScenarioTemplate[] = [
  {
    id: "sc-ro-cash-skim",
    title: "Customer cash on repair orders kept and the entries edited",
    description:
      "The person who takes cash at the service counter can also edit the repair order and the payment record in the DMS, so they can keep a cash payment and close the ticket with a void, a discount or a card payment that never happened.",
    controlId: "c-ro-cash",
    sodRuleIds: ["rule-collect-post", "rule-collect-adjust"],
    ...SCENARIO_FIGURES.cash,
    cascadeLayers: ["control", "process", "surface", "continuity"],
    mitigations: [
      {
        id: "m-auto-1",
        label: "Someone who takes no payments matches repair-order cash to the deposit daily",
        effort: "low",
        riskReduction: 0.5,
        costAnnual: 0,
      },
      {
        id: "m-auto-2",
        label: "Monthly list of edited and deleted DMS transactions by user, read by the owner",
        effort: "low",
        riskReduction: 0.45,
        costAnnual: 0,
      },
    ],
  },
  {
    id: "sc-wire-je-cover",
    title: "Money wired out and the books balanced with journal entries",
    description:
      "The person who releases payments also posts manual journal entries in the DMS, so they can book a wire to their own account to a vehicle, an expense or a schedule, and the month still closes.",
    controlId: "c-je-review",
    sodRuleIds: ["rule-release-je", "rule-je-rec"],
    ...SCENARIO_FIGURES.vendor,
    cascadeLayers: ["control", "source", "process", "continuity"],
    mitigations: [
      {
        id: "m-auto-3",
        label: "Owner opens the bank statement first and questions every payee they do not know",
        effort: "low",
        riskReduction: 0.5,
        costAnnual: 0,
      },
      {
        id: "m-auto-4",
        label: "Outside accountant reviews every manual journal entry with its support",
        effort: "medium",
        riskReduction: 0.6,
        costAnnual: 2400,
      },
    ],
  },
  {
    id: "sc-parts-resale",
    title: "Parts ordered to stock and sold on the side",
    description:
      "The parts desk orders, signs for and logs the stock. The desk orders and pays for parts the shop never needed, then sells them online or over the counter for cash, and the paperwork agrees with itself because one person wrote all of it.",
    controlId: "c-parts-count",
    sodRuleIds: ["rule-order-receive"],
    knowledgeId: "k2",
    ...SCENARIO_FIGURES.writeoff,
    cascadeLayers: ["control", "process", "surface", "continuity"],
    mitigations: [
      {
        id: "m-auto-5",
        label: "Quarterly count by someone outside the parts desk, against purchase invoices",
        effort: "low",
        riskReduction: 0.5,
        costAnnual: 0,
      },
      {
        id: "m-auto-6",
        label: "Parts purchased compared with parts sold or installed, by category, each quarter",
        effort: "low",
        riskReduction: 0.35,
        costAnnual: 0,
      },
    ],
  },
  {
    id: "sc-deal-fee-skim",
    title: "Title fees and rebates collected but never remitted",
    description:
      "The person who posts the deal also handles the title work and the incentive claims, so fees collected from the customer never reach the state, or a manufacturer rebate goes to an account the dealership does not own, and the deal jacket reads as complete.",
    controlId: "c-deal-audit",
    sodRuleIds: ["rule-cash-void"],
    knowledgeId: "k3",
    ...SCENARIO_FIGURES.vendor,
    cascadeLayers: ["control", "process", "surface", "continuity"],
    mitigations: [
      {
        id: "m-auto-7",
        label: "Second person audits each deal jacket against the DMS: fees, payoffs and rebates",
        effort: "low",
        riskReduction: 0.5,
        costAnnual: 0,
      },
      {
        id: "m-auto-8",
        label: "Owner reads the title-fee remittance log against the month's deals",
        effort: "low",
        riskReduction: 0.4,
        costAnnual: 0,
      },
    ],
  },
];

export const automotiveTemplate: IndustrySample = {
  id: "automotive",
  people: [
    {
      id: "p1",
      name: "Frank Delacroix",
      role: "Owner / Dealer Principal",
      active: true,
      tenureYears: 22,
    },
    { id: "p2", name: "Linda Marsh", role: "Office Manager", active: true, tenureYears: 14 },
    { id: "p3", name: "Tony Reyes", role: "Service Manager", active: true, tenureYears: 9 },
    { id: "p4", name: "Keisha Bell", role: "Service Advisor", active: true, tenureYears: 4 },
    { id: "p5", name: "Marco Bianchi", role: "Parts Manager", active: true, tenureYears: 6 },
    { id: "p6", name: "Dwayne Foster", role: "Sales & F&I Manager", active: true, tenureYears: 7 },
    { id: "p7", name: "Sofia Almeida", role: "Title Clerk", active: true, tenureYears: 3 },
    { id: "p8", name: "Greg Olsen", role: "Lead Technician", active: true, tenureYears: 11 },
    { id: "p9", name: "Nadia Hussain", role: "Cashier", active: true, tenureYears: 2 },
  ],
  knowledge: [
    {
      id: "k1",
      name: "Repair-order pricing, labor times & warranty labor operations",
      description:
        "Flat-rate labor times, menu pricing, which operations the manufacturer pays and at what rate.",
      criticality: "critical",
      category: "process",
      linkedProcessIds: ["proc-service", "proc-claims"],
    },
    {
      id: "k2",
      name: "Parts inventory, cores, returns & supplier programs",
      description:
        "Stocking levels, core charges, return windows, and the supplier and manufacturer programs that earn credits.",
      criticality: "critical",
      category: "process",
      linkedProcessIds: ["proc-parts"],
    },
    {
      id: "k3",
      name: "Deal jackets, title & registration filing",
      description:
        "What a complete deal jacket holds, the state's title and registration filing, and the fee schedule.",
      criticality: "critical",
      category: "compliance",
      linkedProcessIds: ["proc-sales", "proc-title"],
    },
    {
      id: "k4",
      name: "DMS accounting schedules & month-end close",
      description:
        "The dealer management system's schedules (vehicle inventory, receivables, floor plan), how they clear, and the close.",
      criticality: "critical",
      category: "system",
      linkedProcessIds: ["proc-cash", "proc-ap"],
    },
    {
      id: "k5",
      name: "Warranty & goodwill claim submission and chargebacks",
      description:
        "Manufacturer claim rules, filing deadlines, documentation the auditor asks for, and how to contest chargebacks.",
      criticality: "critical",
      category: "compliance",
      linkedProcessIds: ["proc-claims"],
    },
    {
      id: "k6",
      name: "Floor plan, lender payoffs & incentive programs",
      description:
        "Floor-plan curtailments and audits, lender payoff procedures, and the month's manufacturer incentives.",
      criticality: "important",
      category: "vendor",
      linkedProcessIds: ["proc-sales", "proc-cash"],
    },
    {
      id: "k7",
      name: "Technician flat-rate pay & dispatch",
      description:
        "How the shop flags hours to technicians, the dispatch order, and the pay plans behind each technician's check.",
      criticality: "important",
      category: "process",
      linkedProcessIds: ["proc-payroll", "proc-service"],
    },
  ],
  relations: [
    { personId: "p3", knowledgeId: "k1", level: "expert" },
    { personId: "p4", knowledgeId: "k1", level: "proficient" },
    { personId: "p5", knowledgeId: "k2", level: "expert" },
    { personId: "p7", knowledgeId: "k3", level: "expert" },
    { personId: "p6", knowledgeId: "k3", level: "proficient" },
    { personId: "p2", knowledgeId: "k4", level: "expert" },
    { personId: "p3", knowledgeId: "k5", level: "expert" },
    { personId: "p1", knowledgeId: "k6", level: "expert" },
    { personId: "p6", knowledgeId: "k6", level: "proficient" },
    { personId: "p2", knowledgeId: "k6", level: "basic" },
    { personId: "p3", knowledgeId: "k7", level: "expert" },
    { personId: "p8", knowledgeId: "k7", level: "proficient" },
  ],
  processes: [
    {
      id: "proc-service",
      name: "Service write-up & repair orders",
      layer: "process",
      description:
        "Customer write-up, estimate and approval, technician dispatch, repair order closing and payment at the counter.",
      dependencies: [],
      controlIds: ["c-ro-cash", "c-dms-edits"],
      stage: 0,
      ownerPersonIds: ["p4", "p3"],
      inputs: ["Customer concern and vehicle", "Labor time guide", "Parts availability"],
      outputs: ["Closed repair orders", "Customer payments", "Technician flagged hours"],
      risks: [
        {
          id: "r-svc-1",
          title: "Service advisor takes payment and edits the repair order",
          kind: "fraud",
          severity: 5,
          likelihood: 3,
          note: "An insider covers cash kept at the counter with a discount, a void or a card payment on the ticket that never happened.",
          linkedControlId: "c-ro-cash",
          linkedScenarioId: "sc-ro-cash-skim",
        },
        {
          id: "r-svc-2",
          title: "Labor times and pricing live with the service manager",
          kind: "continuity",
          severity: 4,
          likelihood: 3,
          note: "Repair orders go out mispriced, and advisors claim warranty labor at the wrong operation, when the service manager is out.",
          linkedKnowledgeId: "k1",
        },
      ],
      ideas: [
        {
          id: "i-svc-1",
          title: "Daily repair-order cash report matched to the deposit by the cashier",
          category: "control",
          effort: "low",
          impact: "high",
          note: "The person who prepares the deposit signs the DMS cash report by advisor, and the two totals agree before the bag leaves.",
          status: "planned",
        },
        {
          id: "i-svc-2",
          title: "Menu pricing and labor times documented in the DMS",
          category: "training",
          effort: "medium",
          impact: "medium",
          note: "Standard operations carry their time and price so an advisor covering the desk quotes the same job the same way.",
          status: "exploring",
        },
      ],
      wastes: [
        {
          id: "w-svc-1",
          kind: "muda_waiting",
          label: "Vehicles waiting on customer approval for additional work",
          note: "Advisors phone estimates rather than send them, so cars sit on the lift while the advisor chases a call back.",
        },
      ],
    },
    {
      id: "proc-sales",
      name: "Vehicle sales, deposits & F&I",
      layer: "process",
      description:
        "Deal structure, down payments and trades, lender approval, F&I products, delivery.",
      dependencies: [],
      controlIds: ["c-deal-audit"],
      stage: 0,
      ownerPersonIds: ["p6", "p1"],
      inputs: [
        "Vehicle inventory and floor plan",
        "Customer credit application",
        "Lender programs",
      ],
      outputs: ["Signed deal jackets", "Down payments and trades", "Funded contracts"],
      risks: [
        {
          id: "r-sales-1",
          title: "F&I manager takes deposits and approves what the deal writes off",
          kind: "fraud",
          severity: 4,
          likelihood: 3,
          note: "An insider covers a down payment kept in the office with a discount or an adjustment on the deal that nobody else approves.",
          linkedControlId: "c-deal-audit",
          linkedScenarioId: "sc-deal-fee-skim",
        },
        {
          id: "r-sales-2",
          title: "Floor plan and lender payoffs understood by two people",
          kind: "continuity",
          severity: 3,
          likelihood: 3,
          note: "A curtailment missed or a payoff sent late costs interest and the lender's confidence.",
          linkedKnowledgeId: "k6",
        },
      ],
      ideas: [
        {
          id: "i-sales-1",
          title: "Receipt from the cashier for every down payment before the lender funds the deal",
          category: "control",
          effort: "low",
          impact: "high",
          note: "Deposits go to the cashier, not the F&I office; the deal jacket holds the receipt number.",
          status: "planned",
        },
        {
          id: "i-sales-2",
          title: "Weekly floor-plan reconciliation read by the owner",
          category: "control",
          effort: "low",
          impact: "medium",
          note: "Units on the lot, units on the floor plan and payoffs due, on one page.",
          status: "exploring",
        },
      ],
      wastes: [
        {
          id: "w-sales-1",
          kind: "muda_rework",
          label: "Deals rewritten after the lender declines the structure",
          note: "The office prints contracts before anyone reads the lender's conditions, so the customer signs twice.",
        },
      ],
    },
    {
      id: "proc-parts",
      name: "Parts ordering, receiving & counter sales",
      layer: "process",
      description:
        "Stock and special orders, receiving and binning, cores and returns, counter and wholesale sales.",
      dependencies: ["proc-service"],
      controlIds: ["c-parts-count"],
      stage: 1,
      ownerPersonIds: ["p5"],
      inputs: ["Repair-order parts requests", "Stocking levels", "Supplier invoices"],
      outputs: ["Parts on repair orders", "Counter sales", "Core and return credits"],
      risks: [
        {
          id: "r-parts-1",
          title: "Parts manager orders, receives and logs the stock alone",
          kind: "fraud",
          severity: 4,
          likelihood: 3,
          note: "An insider buys parts the shop never needed with the dealership's money and sells them elsewhere, and every record agrees because one person wrote them all.",
          linkedControlId: "c-parts-count",
          linkedScenarioId: "sc-parts-resale",
          linkedKnowledgeId: "k2",
        },
        {
          id: "r-parts-2",
          title: "Cores and returns never credited",
          kind: "revenue",
          severity: 3,
          likelihood: 4,
          note: "Core charges and returnable stock sit past the supplier's window, and the dealership loses the credit.",
        },
      ],
      ideas: [
        {
          id: "i-parts-1",
          title: "Service manager signs for deliveries; parts logs them",
          category: "control",
          effort: "low",
          impact: "high",
          note: "The person who ordered is not the person who confirms what arrived.",
          status: "planned",
        },
        {
          id: "i-parts-2",
          title: "Quarterly count against purchases and sales",
          category: "control",
          effort: "medium",
          impact: "high",
          note: "Someone outside the parts desk counts, and the office compares the count with what the dealership bought and what left on repair orders.",
          status: "exploring",
        },
      ],
      wastes: [
        {
          id: "w-parts-1",
          kind: "muda_motion",
          label: "Technicians walking to the counter for parts not pulled",
          note: "The parts desk pulls parts for approved repair orders when asked instead of staging them, so the lift waits.",
        },
      ],
    },
    {
      id: "proc-claims",
      name: "Warranty & goodwill claims",
      layer: "process",
      description:
        "Manufacturer warranty claims from closed repair orders, goodwill decisions, chargebacks and appeals.",
      dependencies: ["proc-service"],
      controlIds: ["c-warranty", "c-sod-billing"],
      stage: 2,
      ownerPersonIds: ["p3"],
      inputs: ["Closed warranty repair orders", "Manufacturer claim rules", "Goodwill requests"],
      outputs: ["Submitted claims", "Goodwill write-offs", "Chargeback appeals"],
      risks: [
        {
          id: "r-clm-1",
          title: "Service manager grants and writes off goodwill alone",
          kind: "fraud",
          severity: 4,
          likelihood: 3,
          note: "A repair given away to a friend, or a cash payment kept, reads as goodwill nobody else approved.",
          linkedControlId: "c-warranty",
          linkedScenarioId: "sc-writeoff-abuse",
        },
        {
          id: "r-clm-2",
          title: "Claim rules and deadlines only one person knows",
          kind: "continuity",
          severity: 4,
          likelihood: 3,
          note: "The manufacturer denies claims filed late or without the documentation the auditor wants, and chargebacks go unanswered.",
          linkedKnowledgeId: "k5",
          linkedScenarioId: "sc-key-person-leaves",
        },
      ],
      ideas: [
        {
          id: "i-clm-1",
          title: "Goodwill above a set amount approved by the owner",
          category: "control",
          effort: "low",
          impact: "high",
          note: "The goodwill report by advisor and by customer goes to the owner monthly, with each write-off's reason.",
          status: "planned",
        },
        {
          id: "i-clm-2",
          title: "Warranty claim checklist kept in the DMS",
          category: "training",
          effort: "low",
          impact: "medium",
          note: "Required photos, parts retention and the filing window per manufacturer, written where a stand-in can find them.",
          status: "backlog",
        },
      ],
      wastes: [
        {
          id: "w-clm-1",
          kind: "muda_rework",
          label: "Claims returned for missing punch times or photos",
          note: "Technicians close warranty lines without the documentation the claim needs, and someone has to resubmit the claim.",
        },
      ],
    },
    {
      id: "proc-title",
      name: "Title, registration & fee remittance",
      layer: "process",
      description:
        "Deal posting, lender funding, title and registration filing, and remitting the fees collected to the state.",
      dependencies: ["proc-sales"],
      controlIds: ["c-deal-audit"],
      stage: 2,
      ownerPersonIds: ["p7"],
      inputs: ["Signed deal jackets", "Lender funding notices", "State fee schedule"],
      outputs: ["Posted deals", "Filed titles and registrations", "Fee remittances"],
      risks: [
        {
          id: "r-title-1",
          title: "Fees collected on the deal and remitted by the same person",
          kind: "fraud",
          severity: 4,
          likelihood: 2,
          note: "An insider can hold title and registration fees taken from the customer, or remit less than the full amount, and the customer's plates arrive late with no one asking why.",
          linkedControlId: "c-deal-audit",
          linkedScenarioId: "sc-deal-fee-skim",
        },
        {
          id: "r-title-2",
          title: "Deals posted with adjustments nobody reviews",
          kind: "control",
          severity: 3,
          likelihood: 3,
          note: "The title clerk adjusts a deal that funds for less than its written amount at posting, and the difference is a line only the title clerk sees.",
          linkedKnowledgeId: "k3",
        },
      ],
      ideas: [
        {
          id: "i-title-1",
          title: "Remittance log compared with the month's deals",
          category: "control",
          effort: "low",
          impact: "high",
          note: "Every deal's fees collected sit beside the state's confirmation of what the dealership paid.",
          status: "planned",
        },
        {
          id: "i-title-2",
          title: "Electronic titling with the state where offered",
          category: "tech",
          effort: "medium",
          impact: "medium",
          note: "Fees move from the dealership's account directly, with a record the office did not write.",
          status: "backlog",
        },
      ],
      wastes: [
        {
          id: "w-title-1",
          kind: "muda_waiting",
          label: "Deal jackets waiting for a missing signature or stipulation",
          note: "The office cannot post or fund a deal until sales brings back the paper the lender asked for.",
        },
      ],
    },
    {
      id: "proc-ar",
      name: "Customer, warranty & lender receivables",
      layer: "process",
      description:
        "Open repair-order balances, warranty receivables from the manufacturer, contracts in transit, write-offs.",
      dependencies: ["proc-claims", "proc-title"],
      controlIds: ["c-ar", "c-sod-ar"],
      stage: 3,
      ownerPersonIds: ["p2", "p7"],
      inputs: ["Open repair orders", "Submitted claims", "Contracts in transit"],
      outputs: ["Collected balances", "Cleared schedules"],
      risks: [
        {
          id: "r-ar-1",
          title: "Customer balances written off without the owner",
          kind: "fraud",
          severity: 4,
          likelihood: 2,
          note: "An insider hides a payment they kept by writing the balance off as a dispute or a goodwill adjustment.",
          linkedScenarioId: "sc-writeoff-abuse",
        },
        {
          id: "r-ar-2",
          title: "Contracts in transit ageing past the lender's funding window",
          kind: "revenue",
          severity: 3,
          likelihood: 3,
          note: "Deals that never fund sit on the schedule for weeks, and the vehicle has already left.",
          linkedKnowledgeId: "k4",
        },
      ],
      ideas: [
        {
          id: "i-ar-1",
          title: "Owner reads the schedules and the write-off list monthly",
          category: "control",
          effort: "low",
          impact: "high",
          note: "Every write-off carries a reason and the owner's initials; every schedule item over 30 days has a name beside it.",
          status: "planned",
        },
      ],
      wastes: [
        {
          id: "w-ar-1",
          kind: "muda_waiting",
          label: "Warranty receivables waiting on resubmitted claims",
          note: "The warranty clerk reworks denied claims one at a time instead of from a weekly list.",
        },
      ],
    },
    {
      id: "proc-cash",
      name: "Cashier, deposits & bank reconciliation",
      layer: "process",
      description:
        "Cashier receipts across service, parts and sales, daily deposit, bank and floor-plan reconciliation, journal entries.",
      dependencies: ["proc-service", "proc-sales"],
      controlIds: ["c-cash", "c-sod-cash", "c-je-review"],
      stage: 3,
      ownerPersonIds: ["p2", "p9"],
      inputs: ["Counter and cashier receipts", "Bank and lender statements", "DMS cash reports"],
      outputs: ["Deposits", "Reconciled bank and floor-plan accounts", "Month-end close"],
      risks: [
        {
          id: "r-cash-1",
          title: "Office manager deposits, posts, reconciles and posts journal entries",
          kind: "fraud",
          severity: 5,
          likelihood: 3,
          note: "The office manager books a wire to their own account to a schedule and reconciles it with the same hands, and the books balance by construction.",
          linkedControlId: "c-sod-cash",
          linkedScenarioId: "sc-wire-je-cover",
        },
        {
          id: "r-cash-2",
          title: "Owner sees the DMS dashboard, not the bank statement",
          kind: "control",
          severity: 4,
          likelihood: 4,
          note: "A healthy month on the dashboard hides transfers nobody outside the office reads.",
        },
      ],
      ideas: [
        {
          id: "i-cash-1",
          title: "Bank statements go to the owner first",
          category: "control",
          effort: "low",
          impact: "high",
          note: "The owner reads cleared checks and wires before the office reconciles.",
          status: "planned",
        },
        {
          id: "i-cash-2",
          title: "Outside accountant reviews manual journal entries quarterly",
          category: "control",
          effort: "medium",
          impact: "high",
          note: "Each entry that touches cash, a schedule or a suspense account carries its support and an explanation.",
          status: "exploring",
        },
      ],
      wastes: [
        {
          id: "w-cash-1",
          kind: "muda_waiting",
          label: "Deposits held until the office manager is free to count",
          note: "Cash from three counters waits in the safe, which delays both the bank and the record.",
        },
      ],
    },
    {
      id: "proc-ap",
      name: "Parts, sublet & supplier payments",
      layer: "process",
      description:
        "Supplier statements, sublet repair invoices, shop supplies and card purchases, vendor setup and payment release.",
      dependencies: ["proc-parts"],
      controlIds: ["c-ap", "c-sod-ap", "c-sublet"],
      stage: 3,
      ownerPersonIds: ["p2"],
      inputs: ["Supplier invoices and statements", "Sublet invoices", "Card statements"],
      outputs: ["Approved payments", "Reconciled supplier statements"],
      risks: [
        {
          id: "r-ap-1",
          title: "Office manager sets up vendors and releases payments",
          kind: "fraud",
          severity: 5,
          likelihood: 3,
          note: "An insider can add and pay a sublet shop that does not exist, and code its invoices to repair orders that never carried the work.",
          linkedControlId: "c-sod-ap",
          linkedScenarioId: "sc-vendor-fraud",
        },
        {
          id: "r-ap-2",
          title: "Sublet and card purchases without a repair-order number",
          kind: "control",
          severity: 3,
          likelihood: 4,
          note: "The office pays for outside work and shop-card purchases without tying them to a job, so a personal purchase reads as shop supplies.",
          linkedControlId: "c-sublet",
        },
      ],
      ideas: [
        {
          id: "i-ap-1",
          title: "No repair-order number, no payment",
          category: "policy",
          effort: "low",
          impact: "high",
          note: "Before anyone pays them, the office codes sublet invoices and card charges to a repair order that shows the work or the part.",
          status: "planned",
        },
        {
          id: "i-ap-2",
          title: "Owner signs off every new vendor",
          category: "control",
          effort: "low",
          impact: "high",
          note: "The month's new vendors, with a W-9 and an address, go to the owner before a first payment.",
          status: "planned",
        },
      ],
      wastes: [
        {
          id: "w-ap-1",
          kind: "muda_overprocessing",
          label: "Supplier statements reconciled line by line by hand",
          note: "The office matches parts invoices to the statement from paper instead of the supplier's electronic feed.",
        },
      ],
    },
    {
      id: "proc-payroll",
      name: "Technician flat-rate & commission payroll",
      layer: "process",
      description:
        "Flagged hours from repair orders, sales commissions from posted deals, hourly staff time, and the payroll run.",
      dependencies: ["proc-service", "proc-title"],
      controlIds: ["c-payroll"],
      stage: 4,
      ownerPersonIds: ["p2", "p3", "p1"],
      inputs: ["Flagged hours by technician", "Posted deals and pay plans", "Timecards"],
      outputs: ["Payroll", "Commission statements"],
      risks: [
        {
          id: "r-pay-1",
          title: "Flagged hours and commissions paid without a second look",
          kind: "fraud",
          severity: 4,
          likelihood: 3,
          note: "Hours flagged to a technician who did not turn the wrench, or a commission on a deal the customer unwound, go out with the run.",
          linkedControlId: "c-payroll",
          linkedKnowledgeId: "k7",
        },
        {
          id: "r-pay-2",
          title: "Office manager enters payroll and releases it",
          kind: "fraud",
          severity: 4,
          likelihood: 3,
          note: "The same person who adds a pay line to the run also releases it.",
          linkedControlId: "c-payroll",
        },
      ],
      ideas: [
        {
          id: "i-pay-1",
          title: "Service manager approves flagged hours by technician each week",
          category: "control",
          effort: "low",
          impact: "high",
          note: "Someone matches hours to closed repair orders before they reach payroll.",
          status: "planned",
        },
        {
          id: "i-pay-2",
          title: "Owner reads the payroll register and the change report every run",
          category: "control",
          effort: "low",
          impact: "high",
          note: "New hires, rate changes and bank changes beside the names and gross-to-net totals.",
          status: "exploring",
        },
      ],
      wastes: [
        {
          id: "w-pay-1",
          kind: "muda_rework",
          label: "Commissions recalculated after deals unwind",
          note: "The office works pay plans in a spreadsheet, so an unwound deal means a manual clawback next cycle.",
        },
      ],
    },
  ],
  controls: [...baseFinancialControls(), ...automotiveControls],
  staffComposition: SAMPLE_SAFEGUARDS,
  scenarios: [
    ...baseFraudScenarios({
      keyPersonTitle: "Service manager leaves with sole warranty-claim knowledge",
      keyPersonDesc:
        "The service manager (sole expert on warranty claim rules, chargebacks and flat-rate dispatch) resigns. Claims miss their filing windows, chargebacks go unanswered and technicians dispute their pay.",
      knowledgeId: "k5",
      billingLabel: "Goodwill and customer write-offs without owner approval",
    }),
    ...automotiveScenarios,
  ],
  roleTemplates: {
    "Owner / Dealer Principal": [
      "approve_vendor",
      "approve_payroll",
      "approve_writeoffs",
      "approve_expenses",
      "sign_checks",
      "view_reports_only",
    ],
    "Office Manager": [
      "post_payments",
      "prepare_deposit",
      "enter_invoices",
      "create_vendor",
      "release_payment",
      "bank_reconcile",
      "post_journal_entries",
      "enter_payroll",
      "pms_admin_roles",
      "hold_company_card",
      "review_card_statement",
      "view_reports_only",
    ],
    "Service Manager": [
      "approve_writeoffs",
      "enter_payroll",
      "order_supplies",
      "receive_goods",
      "hold_company_card",
      "view_reports_only",
    ],
    "Service Advisor": [
      "collect_cash",
      "post_payments",
      "post_adjustments",
      "edit_patient_master",
      "view_reports_only",
    ],
    "Parts Manager": ["order_supplies", "receive_goods", "collect_cash", "view_reports_only"],
    "Sales & F&I Manager": [
      "collect_cash",
      "approve_writeoffs",
      "edit_patient_master",
      "view_reports_only",
    ],
    "Title Clerk": ["post_payments", "post_adjustments", "view_reports_only"],
    "Lead Technician": ["view_reports_only"],
    Cashier: ["collect_cash", "post_payments", "view_reports_only"],
  },
};
