import { triage } from "@/lib/precog/sod/controlguard-risk";

type FixFirstProof = "actor" | "cadence" | "artifact";

export type FixFirstCalculatorValues = {
  gates: Parameters<typeof triage>[0]["gates"];
  impact: 1 | 2 | 3 | 4 | 5;
  likelihood: 1 | 2 | 3 | 4 | 5;
  legal: 0 | 2 | 4 | 6;
  detection: 0 | 2 | 3;
  recoverability: 0 | 2 | 3;
  aggregation: 0 | 2;
  compensating_credit: 0 | 1 | 2 | 3;
  proofs: Record<FixFirstProof, boolean>;
};

export function runFixFirstTriage(values: FixFirstCalculatorValues) {
  const input = {
    gates: values.gates,
    impact: values.impact,
    likelihood: values.likelihood,
    legal: values.legal,
    detection: values.detection,
    recoverability: values.recoverability,
    aggregation: values.aggregation,
    compensating_credit: values.compensating_credit,
    subject: "Risk finding",
    control: "Compensating control",
    compensating_has_actor: values.proofs.actor,
    compensating_has_cadence: values.proofs.cadence,
    compensating_has_artifact: values.proofs.artifact,
  };
  const hasAllProofs = Object.values(values.proofs).every(Boolean);

  return hasAllProofs ? triage(input, () => ["active", null]) : triage(input);
}
