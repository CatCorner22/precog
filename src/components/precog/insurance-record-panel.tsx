import {
  CORE_POLICY_FIELDS,
  POLICY_FIELDS,
  normalizeInsuranceRecord,
  type PolicyField,
} from "@/lib/precog/scoring/insurance-record";
import { VARIABLE_CATALOG, type RiskVariableState } from "@/lib/precog/scoring/dynamic-variables";
import { localDateKey } from "@/lib/precog/decisions/follow-through";

/** No file upload or external model call: records the owner's stated basis. */
export function InsuranceRecordPanel({
  value,
  onChange,
  scenarioId,
}: {
  value: RiskVariableState;
  onChange: (value: RiskVariableState) => void;
  scenarioId?: string;
}) {
  const record = normalizeInsuranceRecord(value.insurance) ?? {
    status: "unknown" as const,
    confirmedFields: [],
    modeledScenarioIds: [],
  };
  const complete =
    record.status === "reported" &&
    CORE_POLICY_FIELDS.every((key) => record.confirmedFields.includes(key));
  const confirmed = (key: PolicyField) => record.confirmedFields.includes(key);
  const label = (key: PolicyField) =>
    VARIABLE_CATALOG.find((item) => item.id === key)?.label ?? key;
  const toggle = (key: PolicyField) =>
    onChange({
      ...value,
      insurance: {
        ...record,
        confirmedFields: confirmed(key)
          ? record.confirmedFields.filter((field) => field !== key)
          : [...record.confirmedFields, key],
        modeledScenarioIds: [],
        reviewedOn: localDateKey(new Date()),
      },
    });
  const checkbox = (key: PolicyField) => (
    <label key={key} className="flex items-center gap-2 text-xs text-muted">
      <input
        type="checkbox"
        className="size-4"
        checked={confirmed(key)}
        onChange={() => toggle(key)}
      />
      Confirm {label(key).toLowerCase()}: {value[key].toLocaleString("en-US")}
    </label>
  );
  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-panel p-3"
      aria-label="Insurance information status"
    >
      <label className="block text-sm font-medium">
        Insurance information status
        <select
          className="mt-1 block w-full rounded-md border border-border bg-bg p-2 text-sm"
          value={record.status}
          onChange={(event) =>
            onChange({
              ...value,
              insurance: {
                ...record,
                status: event.target.value as typeof record.status,
                confirmedFields: [],
                modeledScenarioIds: [],
                reviewedOn: undefined,
              },
            })
          }
        >
          <option value="unknown">Not assessed / I have not checked</option>
          <option value="none">I have no crime policy</option>
          <option value="reported">I have a policy to record</option>
        </select>
      </label>
      <p className="text-xs text-muted">
        Changing a sample number does not establish a policy. Unknown is not the same as uninsured.
        Existing saved numbers are preserved for review.
      </p>
      {record.status === "reported" && (
        <>
          <label className="block text-xs text-muted">
            Source or broker reference (optional)
            <input
              className="mt-1 block w-full rounded-md border border-border bg-bg p-2 text-sm"
              maxLength={240}
              value={record.source ?? ""}
              placeholder="Policy declarations or quote reference; do not enter confidential identifiers"
              onChange={(event) =>
                onChange({ ...value, insurance: { ...record, source: event.target.value } })
              }
            />
          </label>
          <p className="text-xs text-muted">
            Enter exact amounts below, then confirm each figure here. A figure equal to an app
            default can still be confirmed. Confirming a figure does not verify coverage.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">{CORE_POLICY_FIELDS.map(checkbox)}</div>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Confirm additional quote terms and credits</summary>
            <p className="my-2">
              Only explicitly confirmed credits and loads are included. Confirm the discount cap
              too. Do not apply discounts again to an already-net quote.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {POLICY_FIELDS.filter(
                (key) => !(CORE_POLICY_FIELDS as readonly string[]).includes(key),
              ).map(checkbox)}
            </div>
          </details>
          {scenarioId && (
            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                disabled={!complete}
                checked={complete && record.modeledScenarioIds.includes(scenarioId)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    insurance: {
                      ...record,
                      modeledScenarioIds: event.target.checked
                        ? [...new Set([...record.modeledScenarioIds, scenarioId])]
                        : record.modeledScenarioIds.filter((id) => id !== scenarioId),
                      reviewedOn: localDateKey(new Date()),
                    },
                  })
                }
              />
              <span>
                Model this scenario as potentially covered. This is my assumption, not confirmation
                from the insurer. Check exclusions, sublimits, policy dates and aggregate limits
                with the broker first.
              </span>
            </label>
          )}
          {!complete && (
            <p className="text-xs text-warn">
              Confirm all four main figures to enable a scenario recovery assumption.
            </p>
          )}
          {record.reviewedOn && (
            <p className="text-xs text-subtle">
              Last user confirmation: {record.reviewedOn}. Not a carrier review.
            </p>
          )}
        </>
      )}
    </section>
  );
}
