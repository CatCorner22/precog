import { z } from "zod";
import { finite, fraction, multiply } from "../controlguard-decimal";
import { controlGuardConflictPriority, controlGuardTriageTier } from "../scoring/bands";

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

export type ProofStatus = "active" | "lapsed" | "future_signoff" | "no_signoff";
export type Signoff = (subject: string, control: string) => [ProofStatus, string | null];

function evidence(
  input: {
    [K in keyof typeof proof]?: z.output<(typeof proof)[K]>;
  } & { subject?: string },
  signoff?: Signoff,
) {
  if (
    !input.compensating_has_actor ||
    !input.compensating_has_cadence ||
    !input.compensating_has_artifact
  ) {
    return ["missing_triple_proof", null] as const;
  }
  if (input.subject && input.control && signoff) return signoff(input.subject, input.control);
  return ["no_signoff", null] as const;
}

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

const deadlines = { permanent_fix_days: 30, interim_control_days: 7 };

export function triage(input: z.infer<typeof triageInput>, signoff?: Signoff) {
  const triggered_gates = (Object.keys(gates.shape) as (keyof typeof gates.shape)[]).filter(
    (gate) => input.gates[gate],
  );
  if (triggered_gates.length) return { tier: 1, score: null, triggered_gates, ...deadlines };
  const {
    impact,
    likelihood,
    legal,
    detection,
    recoverability,
    aggregation,
    compensating_credit = 0,
  } = input;
  if (
    impact === undefined ||
    likelihood === undefined ||
    legal === undefined ||
    detection === undefined ||
    recoverability === undefined ||
    aggregation === undefined
  ) {
    throw new Error("Enter all six score factors when no gate is active.");
  }
  const [proof_status, signed_at] = compensating_credit
    ? evidence(input, signoff)
    : (["not_requested", null] as const);
  const credit = proof_status === "active" ? compensating_credit : 0;
  const score = impact * likelihood + legal + detection + recoverability - credit + aggregation;
  const tier = controlGuardTriageTier(score);
  return {
    tier,
    score,
    triggered_gates,
    compensating_credit: credit,
    proof_status,
    signed_at,
    ...(tier === 1 ? deadlines : {}),
    ...(compensating_credit && !credit
      ? {
          warning:
            "Verify the reviewer, cadence and audit artifact before relying on this control.",
        }
      : {}),
  };
}

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

export function sod(input: z.infer<typeof sodInput>, signoff?: Signoff) {
  const selected = vertices.filter((vertex) => input.vertices.includes(vertex));
  const common = {
    subject: input.subject,
    asset_class: input.asset_class,
    vertices: selected,
    conflict: selected.length >= 2,
  };
  if (!common.conflict) return { ...common, score: null, priority: null };
  const { impact, exploitability, factor: requested = 1 } = input;
  if (impact === undefined || exploitability === undefined)
    throw new Error("Enter impact and exploitability.");
  const [proof_status, signed_at] =
    requested < 1 ? evidence(input, signoff) : (["not_requested", null] as const);
  const factor = proof_status === "active" ? requested : 1;
  const exactScore = multiply(
    multiply(fraction(impact), fraction(exploitability)),
    fraction(factor),
  );
  const score = finite(exactScore);
  const priority = controlGuardConflictPriority(...exactScore);
  return {
    ...common,
    score,
    priority,
    factor,
    proof_status,
    signed_at,
    remediation_hours: priority === "P1" ? 48 : priority === "P2" ? 336 : null,
    next_step: {
      P1: "Remediate now.",
      P2: "Remediate within 14 calendar days.",
      P3: "Monitor weekly or monthly.",
      P4: "Review annually.",
    }[priority],
  };
}
