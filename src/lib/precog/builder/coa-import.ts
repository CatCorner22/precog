/**
 * Chart-of-accounts import: turn a QuickBooks / Xero / generic CSV (or a pasted list)
 * into suggested processes. Accounts are grouped by what money-movement they imply;
 * each group maps to a process pattern with default risks, controls, and I/O.
 */
import type { ControlItem, ProcessNode, ProcessRiskKind } from "../types";

export interface CoaAccount {
  name: string;
  type: string;
  detail?: string;
  number?: string;
}

export type CoaGroup =
  | "cash"
  | "receivables"
  | "revenue"
  | "payables"
  | "payroll"
  | "inventory"
  | "fixed_assets"
  | "credit_card"
  | "sales_tax"
  | "debt"
  | "owner_equity"
  | "other";

export interface CoaSuggestion {
  group: CoaGroup;
  title: string;
  description: string;
  accounts: CoaAccount[];
  process: Omit<ProcessNode, "id">;
  /** Existing process id that already covers this group, if any. */
  existingProcessId?: string;
}

/** Minimal CSV parser: quotes, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<keyof CoaAccount, string[]> = {
  name: ["account", "account name", "name", "full name", "*name", "account_name"],
  type: ["type", "account type", "*type", "account_type", "category"],
  detail: ["detail type", "detail", "subtype", "sub type", "tax type", "description"],
  number: ["number", "account number", "acct #", "code", "account code", "*code"],
};

export function parseCoa(text: string): CoaAccount[] {
  const rows = parseCsv(text.trim());
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (key: keyof CoaAccount) => header.findIndex((h) => HEADER_ALIASES[key].includes(h));
  const iName = idx("name");
  const iType = idx("type");
  const iDetail = idx("detail");
  const iNum = idx("number");

  // No recognizable header: treat each line as "name[, type]".
  if (iName < 0) {
    return rows
      .map((r) => ({ name: r[0]?.trim() ?? "", type: r[1]?.trim() ?? "" }))
      .filter((a) => a.name);
  }
  return rows
    .slice(1)
    .map((r) => ({
      name: (r[iName] ?? "").trim(),
      type: (iType >= 0 ? r[iType] : "")?.trim() ?? "",
      detail: iDetail >= 0 ? r[iDetail]?.trim() : undefined,
      number: iNum >= 0 ? r[iNum]?.trim() : undefined,
    }))
    .filter((a) => a.name);
}

export function classifyAccount(a: CoaAccount): CoaGroup {
  const t = `${a.type} ${a.detail ?? ""}`.toLowerCase();
  const n = a.name.toLowerCase();
  const all = `${t} ${n}`;
  if (/credit card/.test(all)) return "credit_card";
  if (/sales tax|gst|vat|hst|tax payable/.test(all)) return "sales_tax";
  if (/payroll|wages|salar|401k|benefits|withholding/.test(all)) return "payroll";
  if (/accounts receivable|receivable|\ba\/r\b/.test(all)) return "receivables";
  if (/accounts payable|payable|\ba\/p\b/.test(all) && !/tax/.test(all)) return "payables";
  if (/inventory|stock|cost of goods|cogs/.test(all)) return "inventory";
  if (/fixed asset|equipment|furniture|vehicle|depreciation|property/.test(all)) return "fixed_assets";
  if (/loan|line of credit|note payable|mortgage|long.?term liabilit/.test(all)) return "debt";
  if (/equity|owner|retained earnings|distribution|draw/.test(all)) return "owner_equity";
  if (/\bbank\b|checking|savings|cash|petty|undeposited|money market/.test(all)) return "cash";
  if (/income|revenue|sales|fees|service/.test(t) || /income|revenue|sales/.test(n)) return "revenue";
  if (/expense/.test(t) && /(vendor|supplies|rent|utilities|contractor|professional|advertis)/.test(all)) return "payables";
  return "other";
}

interface Pattern {
  title: string;
  description: string;
  stage: number;
  inputs: string[];
  outputs: string[];
  risks: { title: string; kind: ProcessRiskKind; severity: 1 | 2 | 3 | 4 | 5; likelihood: 1 | 2 | 3 | 4 | 5; note: string }[];
  controlHints: string[];
  matchTokens: string[];
}

const PATTERNS: Partial<Record<CoaGroup, Pattern>> = {
  cash: {
    title: "Cash handling & deposits",
    description: "Receipts in, daily close, deposit, and posting to the ledger.",
    stage: 2,
    inputs: ["Customer payment"],
    outputs: ["Deposit", "Posted receipt"],
    risks: [
      { title: "Skimming before deposit", kind: "fraud", severity: 4, likelihood: 3, note: "Separate collection from posting and reconciliation." },
      { title: "Deposits lag or go missing", kind: "control", severity: 3, likelihood: 2, note: "Deposit daily; agree close to bank credit." },
    ],
    controlHints: ["cash", "reconcil"],
    matchTokens: ["cash", "deposit", "receipt"],
  },
  receivables: {
    title: "Billing & collections",
    description: "Invoice, track A/R, follow up, and approve any write-offs.",
    stage: 1,
    inputs: ["Delivery / service record"],
    outputs: ["Invoice", "A/R balance"],
    risks: [
      { title: "Unauthorised write-offs hide theft", kind: "fraud", severity: 4, likelihood: 2, note: "Independent approval of adjustments; monthly aging review." },
      { title: "Slow collections strain cash", kind: "revenue", severity: 3, likelihood: 3, note: "Weekly aging follow-up." },
    ],
    controlHints: ["a/r", "write", "aging", "billing"],
    matchTokens: ["billing", "receivable", "a/r", "collection", "invoice"],
  },
  revenue: {
    title: "Sales & revenue recognition",
    description: "Every sale captured, priced correctly, and recorded once.",
    stage: 1,
    inputs: ["Order / appointment"],
    outputs: ["Sales record", "Invoice"],
    risks: [
      { title: "Side deals bypass the system", kind: "revenue", severity: 3, likelihood: 3, note: "Match sales to schedule or delivery records." },
    ],
    controlHints: ["billing", "sales"],
    matchTokens: ["sales", "revenue", "clinical", "delivery", "service"],
  },
  payables: {
    title: "Vendor payments",
    description: "Vendor setup, invoice approval, and payment release.",
    stage: 3,
    inputs: ["Vendor invoice"],
    outputs: ["Approved payment"],
    risks: [
      { title: "Fictitious vendor", kind: "fraud", severity: 5, likelihood: 2, note: "Vendor creator must not release payments." },
      { title: "Duplicate or unapproved payments", kind: "control", severity: 3, likelihood: 3, note: "Three-way match; dual release over threshold." },
    ],
    controlHints: ["vendor", "ap", "invoice", "payment"],
    matchTokens: ["payable", "vendor", "accounts payable", "a/p", "purchas"],
  },
  payroll: {
    title: "Payroll",
    description: "Hours in, approvals, transmission, and reconciliation to the bank.",
    stage: 3,
    inputs: ["Timesheets", "Rate changes"],
    outputs: ["Payroll register", "Tax filings"],
    risks: [
      { title: "Ghost employee or inflated hours", kind: "fraud", severity: 4, likelihood: 2, note: "Owner approves register before transmission; reconcile headcount." },
    ],
    controlHints: ["payroll"],
    matchTokens: ["payroll"],
  },
  inventory: {
    title: "Inventory & receiving",
    description: "Ordering, receiving, counting, and shrink investigation.",
    stage: 2,
    inputs: ["Purchase order"],
    outputs: ["Stock on hand", "Count variance"],
    risks: [
      { title: "Shrink undetected", kind: "fraud", severity: 3, likelihood: 3, note: "Counter independent of receiving and adjustment." },
    ],
    controlHints: ["inventory", "invoice"],
    matchTokens: ["inventory", "stock", "receiving"],
  },
  fixed_assets: {
    title: "Asset purchases & disposals",
    description: "Approving, tagging, depreciating, and disposing of equipment.",
    stage: 4,
    inputs: ["Capital request"],
    outputs: ["Asset register entry"],
    risks: [
      { title: "Assets walk out the door", kind: "control", severity: 3, likelihood: 2, note: "Tag and count annually; approve disposals." },
    ],
    controlHints: ["invoice"],
    matchTokens: ["asset", "equipment"],
  },
  credit_card: {
    title: "Card spend",
    description: "Company cards: who holds them, receipts, monthly review.",
    stage: 3,
    inputs: ["Card statement"],
    outputs: ["Coded expenses"],
    risks: [
      { title: "Personal spend on company cards", kind: "fraud", severity: 3, likelihood: 3, note: "Owner reviews statements line by line; receipts required." },
    ],
    controlHints: ["invoice", "reconcil"],
    matchTokens: ["card", "credit card", "expense"],
  },
  sales_tax: {
    title: "Tax filings & remittance",
    description: "Sales tax / payroll tax calculated, filed, and paid on time.",
    stage: 4,
    inputs: ["Sales records", "Payroll register"],
    outputs: ["Filed return", "Remittance"],
    risks: [
      { title: "Late or missed filings", kind: "compliance", severity: 4, likelihood: 2, note: "Calendar the deadlines; owner confirms payment cleared." },
    ],
    controlHints: ["reconcil"],
    matchTokens: ["tax", "filing", "remit"],
  },
  debt: {
    title: "Debt service & covenants",
    description: "Loan payments, line-of-credit draws, and covenant tracking.",
    stage: 4,
    inputs: ["Loan schedule"],
    outputs: ["Payments", "Covenant report"],
    risks: [
      { title: "Unauthorised draws on the line", kind: "fraud", severity: 4, likelihood: 1, note: "Owner-only draw authority; monthly statement review." },
    ],
    controlHints: ["reconcil"],
    matchTokens: ["loan", "debt", "credit line", "covenant"],
  },
};

function tokens(s: string) {
  return s.toLowerCase().split(/[^a-z0-9/]+/).filter((t) => t.length > 2);
}

/** Group accounts and propose one process per money-movement group not already on the map. */
export function suggestProcessesFromCoa(
  accounts: CoaAccount[],
  existing: ProcessNode[],
  controls: ControlItem[],
): CoaSuggestion[] {
  const byGroup = new Map<CoaGroup, CoaAccount[]>();
  for (const a of accounts) {
    const g = classifyAccount(a);
    if (g === "other" || g === "owner_equity") continue;
    const list = byGroup.get(g) ?? [];
    list.push(a);
    byGroup.set(g, list);
  }

  const out: CoaSuggestion[] = [];
  for (const [group, accts] of byGroup) {
    const pat = PATTERNS[group];
    if (!pat) continue;
    const existingMatch = existing.find((p) => {
      const pt = tokens(`${p.name} ${p.description}`);
      return pat.matchTokens.some((m) => pt.some((t) => t.includes(m.replace(/\s+/g, "")) || m.split(" ").every((w) => pt.includes(w))));
    });
    const controlIds = controls
      .filter((c) => pat.controlHints.some((h) => `${c.name} ${c.description}`.toLowerCase().includes(h)))
      .slice(0, 3)
      .map((c) => c.id);
    out.push({
      group,
      title: pat.title,
      description: pat.description,
      accounts: accts,
      existingProcessId: existingMatch?.id,
      process: {
        name: pat.title,
        layer: "process",
        description: `${pat.description} Accounts: ${accts.slice(0, 4).map((a) => a.name).join(", ")}${accts.length > 4 ? ` +${accts.length - 4}` : ""}.`,
        dependencies: [],
        controlIds,
        stage: pat.stage,
        ownerPersonIds: [],
        inputs: pat.inputs,
        outputs: pat.outputs,
        risks: pat.risks.map((r, i) => ({ id: `r-coa-${group}-${i}`, ...r })),
        ideas: [],
        wastes: [],
        evidence: [],
      },
    });
  }
  const order: CoaGroup[] = ["revenue", "receivables", "cash", "inventory", "payables", "payroll", "credit_card", "fixed_assets", "sales_tax", "debt"];
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

export const SAMPLE_COA = `Account,Type,Detail Type
Checking - Operating,Bank,Checking
Petty Cash,Bank,Cash on hand
Undeposited Funds,Other Current Asset,Undeposited Funds
Accounts Receivable,Accounts Receivable,Accounts Receivable
Inventory Asset,Other Current Asset,Inventory
Equipment,Fixed Asset,Machinery & Equipment
Accounts Payable,Accounts Payable,Accounts Payable
Visa Business Card,Credit Card,Credit Card
Sales Tax Payable,Other Current Liability,Sales Tax Payable
Payroll Liabilities,Other Current Liability,Payroll Tax Payable
Line of Credit,Long Term Liability,Line of Credit
Owner Equity,Equity,Owner's Equity
Service Revenue,Income,Service/Fee Income
Product Sales,Income,Sales of Product Income
Cost of Goods Sold,Cost of Goods Sold,Supplies & Materials - COGS
Payroll Expenses,Expense,Payroll Expenses
Rent,Expense,Rent or Lease of Buildings
Advertising,Expense,Advertising/Promotional`;
