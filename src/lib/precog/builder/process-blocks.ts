/**
 * Reusable process blocks — mini-templates users can drop onto their map.
 */
import type { IndustryId } from "../industry";
import type { ProcessNode } from "../types";

export interface ProcessBlock {
  id: string;
  name: string;
  description: string;
  category: "cash" | "vendor" | "payroll" | "revenue" | "ops" | "compliance";
  industries?: IndustryId[];
  template: Omit<ProcessNode, "id">;
}

export interface SavedProcessBlock {
  id: string;
  name: string;
  description: string;
  category: ProcessBlock["category"];
  template: Omit<ProcessNode, "id">;
  createdAt: string;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Built-in blocks available in the map builder. */
const PROCESS_BLOCKS: ProcessBlock[] = [
  {
    id: "block-dual-payment",
    name: "Dual-control payment release",
    description: "Vendor payment with separate setup and release roles.",
    category: "vendor",
    template: {
      name: "Payment release",
      layer: "process",
      description: "Second signer releases ACH/check after invoice approval.",
      dependencies: [],
      controlIds: ["c-sod-ap"],
      stage: 3,
      ownerPersonIds: [],
      inputs: ["Approved invoice"],
      outputs: ["Payment batch"],
      risks: [
        {
          id: "r-dual",
          title: "Single signer releases payments",
          kind: "fraud",
          severity: 4,
          likelihood: 3,
          note: "Classic vendor fraud path when one person sets up and releases.",
        },
      ],
      ideas: [
        {
          id: "i-dual",
          title: "Enable dual release in Precog policy",
          category: "control",
          effort: "low",
          impact: "high",
          note: "Wire the dual-release simulator to your real approvers.",
          status: "planned",
        },
      ],
      wastes: [],
    },
  },
  {
    id: "block-bank-rec",
    name: "Owner bank reconciliation",
    description:
      "Weekly owner review of bank vs ledger — catches unrecorded or altered payments before the person who posts them can adjust the books.",
    category: "cash",
    template: {
      name: "Bank reconciliation",
      layer: "process",
      description: "Owner or external bookkeeper reconciles bank to GL weekly.",
      dependencies: [],
      controlIds: ["c-sod-cash"],
      stage: 4,
      ownerPersonIds: [],
      inputs: ["Bank statement", "GL cash balance"],
      outputs: ["Reconciled cash position"],
      risks: [
        {
          id: "r-rec",
          title: "No independent reconciliation",
          kind: "fraud",
          severity: 5,
          likelihood: 3,
          note: "Errors and theft linger when the same person posts and reconciles.",
        },
      ],
      ideas: [],
      wastes: [],
    },
  },
  {
    id: "block-cash-drawer",
    name: "Cash collection & deposit",
    description: "Front-line cash handling with daily deposit and dual count.",
    category: "cash",
    industries: ["dental", "retail", "restaurant", "nonprofit"],
    template: {
      name: "Cash collection",
      layer: "process",
      description: "Collect payments, prepare deposit, hand off for independent posting.",
      dependencies: [],
      controlIds: ["c-cash"],
      stage: 2,
      ownerPersonIds: [],
      inputs: ["Customer payment"],
      outputs: ["Deposit slip", "Posted receipt"],
      risks: [
        {
          id: "r-cash",
          title: "Skimming before deposit",
          kind: "fraud",
          severity: 4,
          likelihood: 3,
          note: "Segregate collection from posting and reconciliation.",
        },
      ],
      ideas: [],
      wastes: [],
    },
  },
  {
    id: "block-vendor-onboard",
    name: "Vendor onboarding",
    description: "New vendor setup separated from payment authorization.",
    category: "vendor",
    template: {
      name: "Vendor onboarding",
      layer: "process",
      description: "Collect W-9, validate bank details, approve before first payment.",
      dependencies: [],
      controlIds: ["c-sod-ap", "c-ap"],
      stage: 2,
      ownerPersonIds: [],
      inputs: ["Vendor application"],
      outputs: ["Approved vendor record"],
      risks: [
        {
          id: "r-vendor",
          title: "Fictitious vendor setup",
          kind: "fraud",
          severity: 4,
          likelihood: 2,
          note: "Creator of vendor should not release payments to that vendor.",
        },
      ],
      ideas: [],
      wastes: [],
    },
  },
  {
    id: "block-invoice-bill",
    name: "Client invoicing",
    description: "Bill generation through collections — revenue-side controls.",
    category: "revenue",
    industries: ["professional_services", "dental", "construction", "general"],
    template: {
      name: "Client invoicing",
      layer: "process",
      description: "Generate invoice from delivery record; track AR through collection.",
      dependencies: [],
      controlIds: [],
      stage: 1,
      ownerPersonIds: [],
      inputs: ["Delivery record", "Time entry"],
      outputs: ["Invoice", "AR balance"],
      risks: [
        {
          id: "r-inv",
          title: "Side agreements bypass billing",
          kind: "revenue",
          severity: 3,
          likelihood: 3,
          note: "Match invoices to signed scope or clinical notes.",
        },
      ],
      ideas: [],
      wastes: [],
    },
  },
  {
    id: "block-inventory-count",
    name: "Inventory cycle count",
    description: "Periodic count independent of purchasing and receiving.",
    category: "ops",
    industries: ["retail", "restaurant", "construction"],
    template: {
      name: "Inventory count",
      layer: "process",
      description: "Cycle count vs system; investigate shrink before reorder.",
      dependencies: [],
      controlIds: [],
      stage: 3,
      ownerPersonIds: [],
      inputs: ["System on-hand"],
      outputs: ["Count variance report"],
      risks: [
        {
          id: "r-inv2",
          title: "Shrink undetected",
          kind: "fraud",
          severity: 3,
          likelihood: 3,
          note: "Counter should not also receive and adjust inventory.",
        },
      ],
      ideas: [],
      wastes: [],
    },
  },
];

export function blocksForIndustry(industry: IndustryId): ProcessBlock[] {
  return PROCESS_BLOCKS.filter((b) => !b.industries || b.industries.includes(industry));
}

function cloneNestedIds(template: Omit<ProcessNode, "id">): Omit<ProcessNode, "id"> {
  return {
    ...template,
    risks: (template.risks ?? []).map((r) => ({ ...r, id: uid("r") })),
    ideas: (template.ideas ?? []).map((i) => ({ ...i, id: uid("i") })),
    wastes: (template.wastes ?? []).map((w) => ({ ...w, id: uid("w") })),
    dependencies: [...template.dependencies],
    controlIds: [...template.controlIds],
    ownerPersonIds: [...(template.ownerPersonIds ?? [])],
    inputs: [...(template.inputs ?? [])],
    outputs: [...(template.outputs ?? [])],
  };
}

/** Instantiate a block as a new process node with fresh IDs. */
export function instantiateBlock(
  block: ProcessBlock | SavedProcessBlock,
  existingIds: Set<string>,
  stage?: number,
): ProcessNode {
  const base = slug(block.name) || "block";
  let id = `proc-${base}`;
  let n = 2;
  while (existingIds.has(id)) id = `proc-${base}-${n++}`;

  const template = cloneNestedIds(block.template);
  return {
    id,
    ...template,
    stage: stage ?? template.stage ?? 0,
  };
}

export function processToSavedBlock(process: ProcessNode): SavedProcessBlock {
  const { id: _id, ...template } = process;
  return {
    id: uid("saved"),
    name: process.name,
    description: process.description,
    category: "ops",
    template: cloneNestedIds(template),
    createdAt: new Date().toISOString(),
  };
}
