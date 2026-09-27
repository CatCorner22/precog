import type { MatrixLayerId } from "../types";
import { DEFAULT_INDUSTRY, type IndustryId } from "../industry";

/** The four duties the segregation-of-duties cards illustrate. */
export type SodDuty = "authorization" | "custody" | "recording" | "reconciliation";

/** The layers whose card lists industry examples; the others list the business's own records. */
export type LayerCopyId = Extract<MatrixLayerId, "surface" | "source" | "continuity">;

export interface IndustryCopyBundle {
  /** An example of each duty in this industry, for the segregation-of-duties cards. */
  sodExamples: Record<SodDuty, string>;
  layerCopy: Record<LayerCopyId, string[]>;
  dualReleaseSeed: {
    /** The trusted payee the sample exception names; it matches payees containing this name. */
    defaultPayee: string;
    exceptionLabel: string;
  };
  pioneerPrompts: string[];
}

export function getIndustryCopy(id: IndustryId): IndustryCopyBundle {
  return INDUSTRY_COPY[id] ?? INDUSTRY_COPY[DEFAULT_INDUSTRY];
}

const INDUSTRY_COPY: Record<IndustryId, IndustryCopyBundle> = {
  dental: {
    sodExamples: {
      authorization: "Owner approves write-offs, large supplier bills, payroll",
      custody: "Cash drawer, deposits, starting electronic payments",
      recording: "Payment posting in the practice software, invoices, claim adjustments",
      reconciliation:
        "Bank reconciliation, deposits against the practice software, adjustment review",
    },
    layerCopy: {
      surface: [
        "Chair and exam-room use, and same-day openings",
        "Front desk call volume and no-shows",
        "Daily collections and patient complaints",
      ],
      source: [
        "Practice management system (roles & templates)",
        "Clearinghouse / payer portals",
        "Bank dual-release settings for electronic payments",
        "Lab and supply vendor accounts",
      ],
      continuity: [
        "If the front desk lead leaves, denied claims pile up within weeks.",
        "If the office manager is away, payroll and vendor payments stop.",
        "Without a second person releasing payments, a theft takes longer to find.",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Northgate Lab Services",
      exceptionLabel: "Trusted lab ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to reduce embezzlement risk?",
      "Where can one person move money alone, and which dual-release rules would help?",
      "If my front desk lead leaves, what breaks first?",
      "Walk me through a write-off abuse scenario and mitigations.",
      "Give me a plain-English one-page brief on what is still exposed.",
    ],
  },
  retail: {
    sodExamples: {
      authorization: "Owner approves large markdowns, vendor terms, payroll",
      custody: "Cash drawer, card batches, bank deposits",
      recording: "Register sales, inventory adjustments, refund entries",
      reconciliation: "Bank reconciliation, shrink reports, override log review",
    },
    layerCopy: {
      surface: [
        "Foot traffic and conversion by daypart",
        "Return rate spikes and override frequency",
        "Same-day cash vs card mix",
      ],
      source: [
        "Register roles and override codes",
        "E-commerce platform admin access",
        "Bank and card processor portals",
        "Supplier and freight vendor master",
      ],
      continuity: [
        "If the lead cashier leaves, return fraud is easier to miss.",
        "If the inventory lead is away, nobody measures shrink.",
        "Without dual release, one person can still pay a vendor alone.",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Pacific Apparel Wholesale",
      exceptionLabel: "Trusted supplier ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to reduce shrink and cash loss?",
      "Where can one person steal via returns or markdowns?",
      "If my lead cashier leaves, what knowledge gaps appear?",
      "Compare vendor fraud vs cash skimming scenarios for my store.",
      "Give me a plain-English brief on what is still exposed.",
    ],
  },
  restaurant: {
    sodExamples: {
      authorization: "Owner approves comps, vendor terms, payroll",
      custody: "Cash tips, safe, nightly deposits",
      recording: "Register sales, voids, inventory usage",
      reconciliation: "Bank reconciliation, tip pool check, liquor variance",
    },
    layerCopy: {
      surface: [
        "Covers and average check by shift",
        "Void and comp rate, and dishes that run out",
        "Tip-out and cash-over-short trends",
      ],
      source: [
        "Register and reservation system admin",
        "Food & beverage vendor accounts",
        "Payroll and tip reporting tools",
        "Liquor inventory and pour-cost tracking",
      ],
      continuity: [
        "If the shift lead leaves, nobody else knows how to close out the cash.",
        "If the bookkeeper is away, nobody checks the tip pool.",
        "Without dual release, one person can still pay a vendor alone.",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Valley Produce Co.",
      exceptionLabel: "Trusted produce vendor ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to protect cash and tips?",
      "Where is tip skimming or void abuse most likely?",
      "If my shift lead leaves, what breaks in nightly close?",
      "Walk me through a vendor fraud scenario for my kitchen.",
      "Give me a plain-English brief on what is still exposed.",
    ],
  },
  professional_services: {
    sodExamples: {
      authorization: "Partner approves write-offs, trust moves, payroll",
      custody: "Client trust deposits, operating cash",
      recording: "Time billing, invoicing, trust ledger entries",
      reconciliation: "Bank reconciliation, trust reconciliation, unbilled work review",
    },
    layerCopy: {
      surface: [
        "Utilization and realization by practice area",
        "Client receivable aging and disputes",
        "Trust balance anomalies and pending disbursements",
      ],
      source: [
        "Billing and time-entry system roles",
        "Trust account bank portal access",
        "Payroll and benefits administration",
        "Client engagement letter templates",
      ],
      continuity: [
        "If the billing coordinator leaves, invoices back up.",
        "If the person who handles trust money is away, disbursements wait.",
        "Without dual release, one person can still pay vendors and expenses alone.",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "CloudLegal Research LLC",
      exceptionLabel: "Trusted vendor ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to protect client trust funds?",
      "Where can billing and collections overlap create fraud risk?",
      "If my billing lead leaves, what client revenue is at risk?",
      "Compare trust commingling vs vendor fraud scenarios.",
      "Give me a plain-English brief for the managing partner.",
    ],
  },
  construction: {
    sodExamples: {
      authorization: "Owner approves new subcontractors, large change orders, payroll",
      custody: "Client checks, deposits, subcontractor and supplier payments",
      recording: "Pay applications, job cost entries, change-order log",
      reconciliation: "Bank reconciliation, job cost vs estimate, lien waiver log",
    },
    layerCopy: {
      surface: [
        "Jobs in progress, schedule slips and weather days",
        "Over and under billing by job",
        "Retainage held by clients and owed to subcontractors",
      ],
      source: [
        "Accounting and job-cost system roles",
        "Bank portal and ACH approvals",
        "Payroll provider and certified payroll reports",
        "Supplier accounts, fuel cards and equipment rentals",
      ],
      continuity: [
        "If the project accountant leaves, pay applications and retainage billing stop.",
        "If the payroll administrator is away, certified payroll on public jobs is late.",
        "Without dual release, one person can still pay a subcontractor alone.",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Keystone Concrete Supply",
      exceptionLabel: "Trusted supplier ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to protect subcontractor payments?",
      "Where could someone pay a fake subcontractor or pad field hours?",
      "If my project accountant leaves, what billing stops?",
      "Walk me through a change-order kickback scenario and its controls.",
      "Give me a plain-English brief on what is still exposed.",
    ],
  },
  nonprofit: {
    sodExamples: {
      authorization: "Executive director and board treasurer approve budgets, payroll, new vendors",
      custody: "Mail and event cash, deposits, organization cards",
      recording: "Gift entry, grant expense coding, vendor bills",
      reconciliation: "Bank reconciliation, donor database vs deposits, restricted-fund review",
    },
    layerCopy: {
      surface: [
        "Giving by month and campaign",
        "Grant spending against budget and deadlines",
        "Card spending and reimbursement requests",
      ],
      source: [
        "Donor database and online giving platform",
        "Accounting system fund and grant codes",
        "Bank portal and card program",
        "Payroll provider and grant time allocations",
      ],
      continuity: [
        "If the finance manager leaves, the close, payroll and audit support stop.",
        "If the grants manager is away, funder reports and draws are late.",
        "Without a second signer, one person can still pay vendors and card bills alone.",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Lakeside Printing Co.",
      exceptionLabel: "Trusted vendor ACH raise",
    },
    pioneerPrompts: [
      "What should we fix this week to protect donations?",
      "Where could restricted grant money be spent on the wrong thing?",
      "If our finance manager leaves, what stops first?",
      "Walk me through a card abuse scenario and what the treasurer should check.",
      "Give me a plain-English brief for the board.",
    ],
  },
  general: {
    sodExamples: {
      authorization: "Owner approves large expenses, payroll, write-offs",
      custody: "Petty cash, checks, starting electronic payments",
      recording: "Invoice posting, journal entries, adjustments",
      reconciliation: "Bank reconciliation, expense review, vendor statement match",
    },
    layerCopy: {
      surface: [
        "Weekly revenue and expense variance",
        "Unpaid bills by age and duplicate invoice flags",
        "Petty cash and corporate card activity",
      ],
      source: [
        "Accounting software roles and permissions",
        "Bank and payment processor access",
        "Payroll provider configuration",
        "Vendor list and 1099 tracking",
      ],
      continuity: [
        "If the office manager leaves, nobody else knows the vendor payments and payroll.",
        "If the bookkeeper is away, the month-end close stops.",
        "Without dual release, one person can still release a payment alone.",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Main Street Supplies Inc.",
      exceptionLabel: "Trusted supplier ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to reduce fraud exposure?",
      "Where can one person move money alone right now?",
      "If my office manager leaves, what processes stall?",
      "Walk me through a vendor fraud scenario step by step.",
      "Give me a plain-English brief on what is still exposed.",
    ],
  },
};
