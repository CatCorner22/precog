import { useState } from "react";
import { runFixFirstTriage, type FixFirstCalculatorValues } from "./fix-first-triage";

type FixFirstGate = keyof FixFirstCalculatorValues["gates"];
type FixFirstProof = keyof FixFirstCalculatorValues["proofs"];

const initialValues: FixFirstCalculatorValues = {
  gates: {
    personal_statutory_liability: false,
    irreversible_money_out: false,
    ability_to_operate: false,
    active_incident: false,
  },
  impact: 1,
  likelihood: 1,
  legal: 0,
  detection: 0,
  recoverability: 0,
  aggregation: 0,
  compensating_credit: 0,
  proofs: { actor: false, cadence: false, artifact: false },
};

const gateOptions: { key: FixFirstGate; label: string }[] = [
  {
    key: "personal_statutory_liability",
    label: "Someone could be personally liable under a statute",
  },
  { key: "irreversible_money_out", label: "Money could go out and not come back" },
  { key: "ability_to_operate", label: "It threatens the license or ability to operate" },
  {
    key: "active_incident",
    label: "An incident is happening now (for example, a patient-safety event)",
  },
];

const proofOptions: { key: FixFirstProof; label: string }[] = [
  { key: "actor", label: "A named person other than the doer checks it" },
  { key: "cadence", label: "On a set schedule" },
  { key: "artifact", label: "Leaves a record you can show" },
];

const gateLabels: Record<FixFirstGate, string> = Object.fromEntries(
  gateOptions.map(({ key, label }) => [key, label]),
) as Record<FixFirstGate, string>;

type SelectOption = { value: number; label: string };

function NumberSelect({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  options: readonly SelectOption[];
  onChange: (value: number) => void;
}) {
  return (
    <label htmlFor={id} className="block min-w-0 text-sm font-medium">
      {label}
      <select
        id={id}
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 min-h-10 w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span id={`${id}-hint`} className="mt-1 block text-xs leading-5 text-muted">
        {hint}
      </span>
    </label>
  );
}

export function FixFirstCalculator() {
  const [values, setValues] = useState(initialValues);
  const result = runFixFirstTriage(values);
  const appliedCredit = "compensating_credit" in result ? result.compensating_credit : 0;
  const warning = "warning" in result ? result.warning : undefined;
  const deadline =
    result.tier === 1
      ? `Interim control within ${result.interim_control_days} days; permanent fix within ${result.permanent_fix_days} days.`
      : result.tier === 2
        ? "Interim control within 30 days; permanent fix within 90 days."
        : result.tier === 3
          ? "Fix within 2 quarters; monitor monthly."
          : "Review yearly.";

  return (
    <section
      className="mt-7 rounded-2xl border border-border bg-surface p-5 sm:p-7"
      aria-labelledby="fix-first-calculator-title"
    >
      <h2 id="fix-first-calculator-title" className="text-xl font-semibold tracking-tight">
        Fix first
      </h2>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Gates</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {gateOptions.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-start gap-3 rounded-lg border border-border bg-elevated p-3 text-sm leading-5"
            >
              <input
                type="checkbox"
                checked={values.gates[key]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    gates: { ...current.gates, [key]: event.target.checked },
                  }))
                }
                className="mt-1 size-4 shrink-0"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberSelect
          id="fix-first-impact"
          label="Impact"
          hint="1 is low; 5 is high."
          value={values.impact}
          options={[
            { value: 1, label: "1 — Low" },
            { value: 2, label: "2 — Low to moderate" },
            { value: 3, label: "3 — Moderate" },
            { value: 4, label: "4 — High" },
            { value: 5, label: "5 — High" },
          ]}
          onChange={(value) =>
            setValues((current) => ({
              ...current,
              impact: value as FixFirstCalculatorValues["impact"],
            }))
          }
        />
        <NumberSelect
          id="fix-first-likelihood"
          label="Likelihood"
          hint="1 is low; 5 is high."
          value={values.likelihood}
          options={[
            { value: 1, label: "1 — Low" },
            { value: 2, label: "2 — Unlikely" },
            { value: 3, label: "3 — Possible" },
            { value: 4, label: "4 — Likely" },
            { value: 5, label: "5 — High" },
          ]}
          onChange={(value) =>
            setValues((current) => ({
              ...current,
              likelihood: value as FixFirstCalculatorValues["likelihood"],
            }))
          }
        />
        <NumberSelect
          id="fix-first-legal"
          label="Legal exposure"
          hint="0 is none; 6 is most serious."
          value={values.legal}
          options={[
            { value: 0, label: "0 — None" },
            { value: 2, label: "2 — Limited" },
            { value: 4, label: "4 — Serious" },
            { value: 6, label: "6 — Most serious" },
          ]}
          onChange={(value) =>
            setValues((current) => ({
              ...current,
              legal: value as FixFirstCalculatorValues["legal"],
            }))
          }
        />
        <NumberSelect
          id="fix-first-detection"
          label="Detection"
          hint="0 is caught right away; 2 is caught late; 3 is likely missed."
          value={values.detection}
          options={[
            { value: 0, label: "0 — Caught right away" },
            { value: 2, label: "2 — Caught late" },
            { value: 3, label: "3 — Likely missed" },
          ]}
          onChange={(value) =>
            setValues((current) => ({
              ...current,
              detection: value as FixFirstCalculatorValues["detection"],
            }))
          }
        />
        <NumberSelect
          id="fix-first-recoverability"
          label="Recoverability"
          hint="0 is easy to undo; 2 is hard to undo; 3 cannot be undone."
          value={values.recoverability}
          options={[
            { value: 0, label: "0 — Easy to undo" },
            { value: 2, label: "2 — Hard to undo" },
            { value: 3, label: "3 — Cannot be undone" },
          ]}
          onChange={(value) =>
            setValues((current) => ({
              ...current,
              recoverability: value as FixFirstCalculatorValues["recoverability"],
            }))
          }
        />
        <NumberSelect
          id="fix-first-aggregation"
          label="Aggregation"
          hint="0 is a one-off; 2 is part of a pattern."
          value={values.aggregation}
          options={[
            { value: 0, label: "0 — One-off" },
            { value: 2, label: "2 — Part of a pattern" },
          ]}
          onChange={(value) =>
            setValues((current) => ({
              ...current,
              aggregation: value as FixFirstCalculatorValues["aggregation"],
            }))
          }
        />
        <NumberSelect
          id="fix-first-credit"
          label="Compensating credit"
          hint="Select 0–3 points; all three proof checks are required for credit."
          value={values.compensating_credit}
          options={[
            { value: 0, label: "0 — No credit" },
            { value: 1, label: "1 — 1 point" },
            { value: 2, label: "2 — 2 points" },
            { value: 3, label: "3 — 3 points" },
          ]}
          onChange={(value) =>
            setValues((current) => ({
              ...current,
              compensating_credit: value as FixFirstCalculatorValues["compensating_credit"],
            }))
          }
        />
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Proof for compensating credit</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {proofOptions.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-start gap-3 rounded-lg border border-border bg-elevated p-3 text-sm leading-5"
            >
              <input
                type="checkbox"
                checked={values.proofs[key]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    proofs: { ...current.proofs, [key]: event.target.checked },
                  }))
                }
                className="mt-1 size-4 shrink-0"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 rounded-xl border border-border bg-elevated p-4" aria-live="polite">
        <h3 className="text-lg font-semibold">Tier {result.tier}</h3>
        <p className="mt-1 text-sm font-medium">
          {result.score === null
            ? `Gate: ${result.triggered_gates.map((gate) => gateLabels[gate]).join("; ")}`
            : `Score ${result.score}`}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          Formula: {values.impact} × {values.likelihood} + {values.legal} + {values.detection} +{" "}
          {values.recoverability} − {appliedCredit} + {values.aggregation} ={" "}
          {result.score ?? "not scored; gate applies"}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">{deadline}</p>
        {warning && <p className="mt-2 text-sm leading-6 text-muted">{warning}</p>}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        Scores order the work; they are not measured probabilities.
      </p>
    </section>
  );
}
