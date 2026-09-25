/**
 * Deterministic risk / idea / control suggestions for a process, keyed on
 * what the process is called and does. Used as the offline fallback for the
 * AI suggester and to pad AI output so the builder always returns something.
 */
import type { ProcessIdea, ProcessRisk } from "../types";
import type { GrokAccess } from "../llm/types";

export interface SuggestionInput {
  processName: string;
  description: string;
  industryLabel: string;
  existingRiskTitles: string[];
  existingIdeaTitles: string[];
  availableControls: { id: string; name: string }[];
  ownerRoles: string[];
}

export type SuggestedRisk = Omit<ProcessRisk, "id">;
export type SuggestedIdea = Omit<ProcessIdea, "id">;

export interface SuggestionResult {
  source: "grok" | "local";
  model?: string;
  grokStatus?: GrokAccess;
  risks: SuggestedRisk[];
  ideas: SuggestedIdea[];
  controlIds: string[];
  rationale: string;
}

interface Pattern {
  match: RegExp;
  controls: string[];
  risks: SuggestedRisk[];
  ideas: SuggestedIdea[];
}

const PATTERNS: Pattern[] = [
  {
    match: /cash|deposit|drawer|tip|till|register|safe/i,
    controls: ["c-cash", "c-sod-cash"],
    risks: [
      {
        title: "Cash skimmed before it is recorded",
        kind: "fraud",
        severity: 5,
        likelihood: 3,
        note: "Whoever collects cash can also adjust the sale or prepare the deposit.",
      },
      {
        title: "Deposit lag hides shortages",
        kind: "control",
        severity: 3,
        likelihood: 4,
        note: "Cash sits for days before it reaches the bank; over/short is never trended.",
      },
    ],
    ideas: [
      {
        title: "Blind drawer count at every handoff",
        category: "control",
        effort: "low",
        impact: "high",
        note: "Counter does not see the expected total; log over/short by person.",
        status: "backlog",
      },
      {
        title: "Owner opens the bank statement first",
        category: "policy",
        effort: "low",
        impact: "high",
        note: "Review deposits vs. daily totals before the bookkeeper touches it.",
        status: "backlog",
      },
    ],
  },
  {
    match: /payroll|wages|timesheet|hours|commission|bonus/i,
    controls: ["c-payroll"],
    risks: [
      {
        title: "Ghost employee or unapproved rate change",
        kind: "fraud",
        severity: 4,
        likelihood: 2,
        note: "Payroll preparer can add people or change rates without a second look.",
      },
      {
        title: "Padded hours on self-approved time",
        kind: "control",
        severity: 3,
        likelihood: 3,
        note: "Managers edit their own punches; no exception report.",
      },
    ],
    ideas: [
      {
        title: "Owner approves headcount + total every cycle",
        category: "control",
        effort: "low",
        impact: "high",
        note: "Two numbers, two minutes: register total and employee count vs. last run.",
        status: "backlog",
      },
    ],
  },
  {
    match: /vendor|payable|\bAP\b|invoice|supplier|purchas|procure/i,
    controls: ["c-ap", "c-sod-ap"],
    risks: [
      {
        title: "Fictitious or hijacked vendor",
        kind: "fraud",
        severity: 5,
        likelihood: 3,
        note: "Same person can create a vendor and release payment to it.",
      },
      {
        title: "Duplicate or short-shipped invoices paid in full",
        kind: "control",
        severity: 3,
        likelihood: 4,
        note: "No match between what was ordered, received, and billed.",
      },
    ],
    ideas: [
      {
        title: "Call-back verification on any vendor bank change",
        category: "policy",
        effort: "low",
        impact: "high",
        note: "Use a known phone number, never the one on the email.",
        status: "backlog",
      },
      {
        title: "Three-way match above a dollar threshold",
        category: "control",
        effort: "medium",
        impact: "medium",
        note: "PO, receiving note, invoice — one initial each.",
        status: "backlog",
      },
    ],
  },
  {
    match:
      /billing|receivable|\bAR\b|collection|write.?off|credit|markdown|void|comp|adjust|refund|discount/i,
    controls: ["c-sod-billing", "c-sod-ar", "c-ar"],
    risks: [
      {
        title: "Adjustments hide diverted payments",
        kind: "fraud",
        severity: 4,
        likelihood: 3,
        note: "The person posting payments can also write balances off or issue credits.",
      },
      {
        title: "Revenue leaks through unbilled or under-billed work",
        kind: "revenue",
        severity: 3,
        likelihood: 4,
        note: "No monthly check that everything delivered was invoiced.",
      },
    ],
    ideas: [
      {
        title: "Reason code + second approval above a threshold",
        category: "control",
        effort: "low",
        impact: "high",
        note: "Monthly adjustment report reviewed by the owner.",
        status: "backlog",
      },
    ],
  },
  {
    match: /inventory|receiving|stock|warehouse|shrink|count|supplies/i,
    controls: ["c-ap", "c-sod-ap"],
    risks: [
      {
        title: "Shrink absorbed as an inventory adjustment",
        kind: "fraud",
        severity: 4,
        likelihood: 3,
        note: "Large negative adjustments without a count or a reason.",
      },
      {
        title: "Receiving without an order match",
        kind: "control",
        severity: 3,
        likelihood: 3,
        note: "Short deliveries are accepted and paid at full quantity.",
      },
    ],
    ideas: [
      {
        title: "Weekly cycle count on top-20 items",
        category: "lean",
        effort: "low",
        impact: "medium",
        note: "Second person spot-checks; variance trend by item.",
        status: "backlog",
      },
    ],
  },
  {
    match: /sales|quote|\bPOS\b|return|checkout|order|e-?com|online/i,
    controls: ["c-cash"],
    risks: [
      {
        title: "Return or refund abuse",
        kind: "fraud",
        severity: 4,
        likelihood: 3,
        note: "Refunds without a receipt or a received item; overrides not reviewed.",
      },
      {
        title: "Discount authority is unclear",
        kind: "revenue",
        severity: 3,
        likelihood: 4,
        note: "Anyone can apply a discount; margin erodes quietly.",
      },
    ],
    ideas: [
      {
        title: "Daily exception report: voids, returns, overrides by user",
        category: "tech",
        effort: "low",
        impact: "high",
        note: "Five-minute owner scan; spikes by one person are a leading indicator.",
        status: "backlog",
      },
    ],
  },
  {
    match: /trust|retainer|escrow|client funds/i,
    controls: ["c-cash", "c-sod-cash"],
    risks: [
      {
        title: "Client funds commingled with operating cash",
        kind: "compliance",
        severity: 5,
        likelihood: 2,
        note: "One person can move money between trust and operating without a second signature.",
      },
    ],
    ideas: [
      {
        title: "Monthly three-way trust reconciliation signed by a partner",
        category: "control",
        effort: "medium",
        impact: "high",
        note: "Bank, ledger, and per-client balances must agree.",
        status: "backlog",
      },
    ],
  },
];

const GENERIC: Pick<Pattern, "risks" | "ideas"> = {
  risks: [
    {
      title: "Only one person knows how this runs",
      kind: "continuity",
      severity: 4,
      likelihood: 3,
      note: "No written steps; a vacation or resignation stalls the process.",
    },
    {
      title: "No independent review of this process",
      kind: "control",
      severity: 3,
      likelihood: 4,
      note: "Nobody outside the process checks the output on a schedule.",
    },
  ],
  ideas: [
    {
      title: "Write a one-page SOP and name a backup",
      category: "training",
      effort: "low",
      impact: "medium",
      note: "Screen-record the steps; have the backup run it once a quarter.",
      status: "backlog",
    },
    {
      title: "Add a monthly owner spot-check",
      category: "control",
      effort: "low",
      impact: "medium",
      note: "Sample three transactions end to end; log what you looked at.",
      status: "backlog",
    },
  ],
};

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function suggestLocally(input: SuggestionInput): SuggestionResult {
  const haystack = `${input.processName} ${input.description}`;
  const hits = PATTERNS.filter((p) => p.match.test(haystack));
  const available = new Set(input.availableControls.map((c) => c.id));
  const existingRisks = new Set(input.existingRiskTitles.map(norm));
  const existingIdeas = new Set(input.existingIdeaTitles.map(norm));

  const risks: SuggestedRisk[] = [];
  const ideas: SuggestedIdea[] = [];
  const controlIds = new Set<string>();

  for (const p of [...hits, GENERIC as Pattern]) {
    for (const r of p.risks) {
      if (risks.length >= 4) break;
      if (existingRisks.has(norm(r.title)) || risks.some((x) => x.title === r.title)) continue;
      risks.push(r);
    }
    for (const i of p.ideas) {
      if (ideas.length >= 3) break;
      if (existingIdeas.has(norm(i.title)) || ideas.some((x) => x.title === i.title)) continue;
      ideas.push(i);
    }
    for (const c of p.controls ?? []) if (available.has(c)) controlIds.add(c);
  }

  const matched = hits.length
    ? `Matched ${hits.length} pattern${hits.length === 1 ? "" : "s"} in the process name and description`
    : "No specific pattern matched; using continuity and review basics";

  return {
    source: "local",
    risks,
    ideas,
    controlIds: [...controlIds].slice(0, 3),
    rationale: `${matched} for a ${input.industryLabel.toLowerCase()} process.`,
  };
}
