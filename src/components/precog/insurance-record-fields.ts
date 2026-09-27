import {
  CORE_POLICY_FIELDS,
  type InsuranceRecord,
  type PolicyField,
} from "@/lib/precog/scoring/insurance-record";
import { VARIABLE_CATALOG } from "@/lib/precog/scoring/dynamic-variables";
import { formatUsd } from "@/lib/utils";

/**
 * The record with one figure confirmed or unconfirmed. Unconfirming one of
 * the four core figures withdraws every scenario recovery assumption, which
 * rests on them; the optional credits and loads leave those assumptions alone.
 */
export function withFieldToggled(
  record: InsuranceRecord,
  key: PolicyField,
  reviewedOn: string,
): InsuranceRecord {
  const wasConfirmed = record.confirmedFields.includes(key);
  const unconfirmsCore = wasConfirmed && (CORE_POLICY_FIELDS as readonly string[]).includes(key);
  return {
    ...record,
    confirmedFields: wasConfirmed
      ? record.confirmedFields.filter((field) => field !== key)
      : [...record.confirmedFields, key],
    modeledScenarioIds: unconfirmsCore ? [] : record.modeledScenarioIds,
    reviewedOn,
  };
}

/** A figure with its unit: "$4,200" for an amount, "5%" for a percentage. */
export function policyFieldValue(key: PolicyField, amount: number): string {
  const kind = VARIABLE_CATALOG.find((item) => item.id === key)?.kind;
  if (kind === "currency") return formatUsd(amount);
  if (kind === "percent") return `${amount.toLocaleString("en-US")}%`;
  return amount.toLocaleString("en-US");
}
