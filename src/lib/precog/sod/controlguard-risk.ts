import { finite, fraction, multiply } from "../controlguard-decimal";
import { controlGuardConflictPriority, controlGuardTriageTier } from "../scoring/bands";
export { sodInput, triageInput } from "./controlguard-risk-schema";

type TriageInput = {
  gates: {
    personal_statutory_liability: boolean;
    irreversible_money_out: boolean;
    ability_to_operate: boolean;
    active_incident: boolean;
  };
  impact?: number;
  likelihood?: number;
  legal?: 0 | 2 | 4 | 6;
  detection?: 0 | 2 | 3;
  recoverability?: 0 | 2 | 3;
  aggregation?: 0 | 2;
  compensating_credit?: number;
  subject?: string;
  compensating_has_actor?: boolean;
  compensating_has_cadence?: boolean;
  compensating_has_artifact?: boolean;
  control?: string;
};

type EvidenceInput = {
  subject?: string;
  control?: string;
  compensating_has_actor?: boolean;
  compensating_has_cadence?: boolean;
  compensating_has_artifact?: boolean;
};

export type ProofStatus = "active" | "lapsed" | "future_signoff" | "no_signoff";
export type Signoff = (subject: string, control: string) => [ProofStatus, string | null];

function evidence(input: EvidenceInput, signoff?: Signoff) {
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

const deadlines = { permanent_fix_days: 30, interim_control_days: 7 };
const triageGateKeys = [
  "personal_statutory_liability",
  "irreversible_money_out",
  "ability_to_operate",
  "active_incident",
] as const satisfies readonly (keyof TriageInput["gates"])[];

export function triage(input: TriageInput, signoff?: Signoff) {
  const triggered_gates = triageGateKeys.filter((gate) => input.gates[gate]);
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
type SodInput = EvidenceInput & {
  subject: string;
  asset_class:
    | "Cash"
    | "Payables"
    | "Payroll"
    | "Controlled Substances"
    | "Surgical Implants"
    | "Inventory"
    | "DNS/IT";
  vertices: (typeof vertices)[number][];
  impact?: number;
  exploitability?: number;
  factor?: number;
};

export function sod(input: SodInput, signoff?: Signoff) {
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
