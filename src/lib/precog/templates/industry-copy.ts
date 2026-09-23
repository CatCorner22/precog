import type { MatrixLayerId } from "../types";
import { industryMeta, type IndustryId } from "../industry";

export interface IndustryCopyBundle {
  /** Authorization, custody, recording, reconciliation examples for SoD cards. */
  sodExamples: [string, string, string, string];
  layerCopy: Partial<Record<MatrixLayerId, string[]>>;
  dualReleaseSeed: {
    defaultPayee: string;
    exceptionPayeeContains: string;
    exceptionLabel: string;
  };
  pioneerPrompts: string[];
}

export const INDUSTRY_COPY: Record<IndustryId, IndustryCopyBundle> = {
  dental: {
    sodExamples: [
      "Owner approves write-offs, large AP, payroll",
      "Drawer, deposits, ACH initiation",
      "Payment posting in PMS, invoices, claim adjustments",
      "Bank rec, deposit vs PMS, adjustment review",
    ],
    layerCopy: {
      surface: [
        "Chair and exam-room use, and same-day openings",
        "Front desk call volume and no-shows",
        "Daily collections and patient experience noise",
      ],
      source: [
        "Practice management system (roles & templates)",
        "Clearinghouse / payer portals",
        "Bank ACH dual-release configuration",
        "Lab and supply vendor accounts",
      ],
      continuity: [
        "If front desk lead exits → denial backlog within weeks",
        "If office manager unavailable → payroll + AP stall",
        "If dual control never added → detection lag stays high",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Apex Dental Lab",
      exceptionPayeeContains: "apex dental lab",
      exceptionLabel: "Trusted lab ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to reduce embezzlement risk?",
      "Where are my biggest SoD gaps and what dual release rules help?",
      "If my front desk lead leaves, what breaks first?",
      "Walk me through a write-off abuse scenario and mitigations.",
      "Give me a plain-English board brief on residual risk.",
    ],
  },
  retail: {
    sodExamples: [
      "Owner approves large markdowns, vendor terms, payroll",
      "Cash drawer, card batches, bank deposits",
      "POS posting, inventory adjustments, refund entries",
      "Bank rec, shrink reports, override log review",
    ],
    layerCopy: {
      surface: [
        "Foot traffic and conversion by daypart",
        "Return rate spikes and override frequency",
        "Same-day cash vs card mix",
      ],
      source: [
        "POS system roles and override codes",
        "E-commerce platform admin access",
        "Bank ACH and card processor portals",
        "Supplier and freight vendor master",
      ],
      continuity: [
        "If lead cashier exits → return fraud controls weaken",
        "If inventory lead unavailable → shrink blind spot grows",
        "Without dual release → vendor payment path stays exposed",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Pacific Apparel Wholesale",
      exceptionPayeeContains: "pacific apparel",
      exceptionLabel: "Trusted supplier ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to reduce shrink and cash loss?",
      "Where can one person steal via returns or markdowns?",
      "If my lead cashier leaves, what knowledge gaps appear?",
      "Compare vendor fraud vs cash skimming scenarios for my store.",
      "Give me a plain-English brief on top residual risks.",
    ],
  },
  restaurant: {
    sodExamples: [
      "Owner approves comps, vendor terms, payroll",
      "Cash tips, safe, nightly deposits",
      "POS sales posting, voids, inventory usage",
      "Bank rec, tip pool reconciliation, liquor variance",
    ],
    layerCopy: {
      surface: [
        "Covers and average check by shift",
        "Void/comp rate and 86'd items",
        "Tip-out and cash-over-short trends",
      ],
      source: [
        "POS and reservation system admin",
        "Food & beverage vendor accounts",
        "Payroll and tip reporting tools",
        "Liquor inventory and pour-cost tracking",
      ],
      continuity: [
        "If shift lead exits → cash handling knowledge gap",
        "If bookkeeper unavailable → tip reconciliation stalls",
        "Without dual release → vendor ACH path stays open",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Valley Produce Co.",
      exceptionPayeeContains: "valley produce",
      exceptionLabel: "Trusted produce vendor ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to protect cash and tips?",
      "Where is tip skimming or void abuse most likely?",
      "If my shift lead leaves, what breaks in nightly close?",
      "Walk me through a vendor fraud scenario for my kitchen.",
      "Give me a plain-English brief on top residual risks.",
    ],
  },
  professional_services: {
    sodExamples: [
      "Partner approves write-offs, trust moves, payroll",
      "Client trust deposits, operating cash",
      "Time billing, invoicing, trust ledger entries",
      "Bank rec, trust reconciliation, WIP review",
    ],
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
        "If billing coordinator exits → invoicing backlog",
        "If trust admin unavailable → disbursement delays",
        "Without dual release → vendor and expense path exposed",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "CloudLegal Research LLC",
      exceptionPayeeContains: "cloudlegal",
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
  general: {
    sodExamples: [
      "Owner approves large expenses, payroll, write-offs",
      "Petty cash, checks, ACH initiation",
      "Invoice posting, journal entries, adjustments",
      "Bank rec, expense review, vendor statement match",
    ],
    layerCopy: {
      surface: [
        "Weekly revenue and expense variance",
        "Open AP aging and duplicate invoice flags",
        "Petty cash and corporate card activity",
      ],
      source: [
        "Accounting software roles and permissions",
        "Bank and payment processor access",
        "Payroll provider configuration",
        "Vendor master and 1099 tracking",
      ],
      continuity: [
        "If office manager exits → AP and payroll knowledge gap",
        "If bookkeeper unavailable → month-end close stalls",
        "Without dual release → payment release stays single-person",
      ],
    },
    dualReleaseSeed: {
      defaultPayee: "Main Street Supplies Inc.",
      exceptionPayeeContains: "main street supplies",
      exceptionLabel: "Trusted supplier ACH raise",
    },
    pioneerPrompts: [
      "What should I fix this week to reduce fraud exposure?",
      "Where are my biggest SoD gaps right now?",
      "If my office manager leaves, what processes stall?",
      "Walk me through a vendor fraud scenario step by step.",
      "Give me a plain-English brief on residual risk.",
    ],
  },
};

export function getIndustryCopy(id: IndustryId): IndustryCopyBundle {
  return INDUSTRY_COPY[id] ?? INDUSTRY_COPY.general;
}

/** The plural of the industry's word for a business: "practices", "stores", "businesses". */
export function pluralTeamLabel(id: IndustryId): string {
  const word = industryMeta(id).teamLabel;
  return /(s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
}
