import { z } from "zod";

const named = z.string().refine((value) => Boolean(value.trim()), "Enter a name.");
const gates = z.strictObject({
  personal_statutory_liability: z.boolean(),
  irreversible_money_out: z.boolean(),
  ability_to_operate: z.boolean(),
  active_incident: z.boolean(),
});
const proof = {
  compensating_has_actor: z.boolean().optional(),
  compensating_has_cadence: z.boolean().optional(),
  compensating_has_artifact: z.boolean().optional(),
  control: named.optional(),
};

export const triageInput = z.strictObject({
  gates,
  impact: z.int().min(1).max(5).optional(),
  likelihood: z.int().min(1).max(5).optional(),
  legal: z.literal([0, 2, 4, 6]).optional(),
  detection: z.literal([0, 2, 3]).optional(),
  recoverability: z.literal([0, 2, 3]).optional(),
  aggregation: z.literal([0, 2]).optional(),
  compensating_credit: z.int().min(0).max(3).optional(),
  subject: named.optional(),
  ...proof,
});

const vertices = ["authorization", "custody", "recordkeeping", "reconciliation"] as const;
export const sodInput = z.strictObject({
  subject: named,
  asset_class: z.enum([
    "Cash",
    "Payables",
    "Payroll",
    "Controlled Substances",
    "Surgical Implants",
    "Inventory",
    "DNS/IT",
  ]),
  vertices: z.array(z.enum(vertices)),
  impact: z.number().min(1).max(10).optional(),
  exploitability: z.number().min(1).max(10).optional(),
  factor: z.number().min(0.15).max(1).optional(),
  ...proof,
});
