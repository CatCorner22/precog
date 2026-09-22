import type { ValueEvidence } from "./value-evidence";

export const VALUE_CASE_STORAGE_KEY = "precog-value-case-v1";

export type ValueCaseInputs = {
  reviewHoursBefore: number;
  reviewHoursAfter: number;
  hourlyCost: number;
  annualReviews: number;
  directRecoveries: number;
  annualExposure: number;
  eventProbability: number;
  controlEffectiveness: number;
  annualProgramCost: number;
};

export const DEFAULT_VALUE_CASE: ValueCaseInputs = {
  reviewHoursBefore: 36,
  reviewHoursAfter: 14,
  hourlyCost: 95,
  annualReviews: 4,
  directRecoveries: 0,
  annualExposure: 250_000,
  eventProbability: 0.04,
  controlEffectiveness: 0.35,
  annualProgramCost: 12_000,
};

function bounded(value: unknown, minimum: number, maximum: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : minimum;
}

export function normalizeValueCase(
  value: Partial<ValueCaseInputs> | null | undefined,
): ValueCaseInputs {
  const source = value ?? {};
  return {
    reviewHoursBefore: bounded(
      source.reviewHoursBefore ?? DEFAULT_VALUE_CASE.reviewHoursBefore,
      0,
      10_000,
    ),
    reviewHoursAfter: bounded(
      source.reviewHoursAfter ?? DEFAULT_VALUE_CASE.reviewHoursAfter,
      0,
      10_000,
    ),
    hourlyCost: bounded(source.hourlyCost ?? DEFAULT_VALUE_CASE.hourlyCost, 0, 10_000),
    annualReviews: bounded(source.annualReviews ?? DEFAULT_VALUE_CASE.annualReviews, 0, 365),
    directRecoveries: bounded(
      source.directRecoveries ?? DEFAULT_VALUE_CASE.directRecoveries,
      0,
      1_000_000_000,
    ),
    annualExposure: bounded(
      source.annualExposure ?? DEFAULT_VALUE_CASE.annualExposure,
      0,
      1_000_000_000,
    ),
    eventProbability: bounded(source.eventProbability ?? DEFAULT_VALUE_CASE.eventProbability, 0, 1),
    controlEffectiveness: bounded(
      source.controlEffectiveness ?? DEFAULT_VALUE_CASE.controlEffectiveness,
      0,
      1,
    ),
    annualProgramCost: bounded(
      source.annualProgramCost ?? DEFAULT_VALUE_CASE.annualProgramCost,
      0,
      1_000_000_000,
    ),
  };
}

/**
 * True once the owner has replaced at least one observed input (hours, cost,
 * recoveries, program cost) with their own figure. Until then the observed
 * metrics are the app's own assumptions and must not be shown as a return.
 */
export function hasOwnObservations(raw: ValueCaseInputs): boolean {
  const inputs = normalizeValueCase(raw);
  const keys: (keyof ValueCaseInputs)[] = [
    "reviewHoursBefore",
    "reviewHoursAfter",
    "hourlyCost",
    "annualReviews",
    "directRecoveries",
    "annualProgramCost",
  ];
  return keys.some((key) => inputs[key] !== DEFAULT_VALUE_CASE[key]);
}

export function calculateValueCase(raw: ValueCaseInputs) {
  const inputs = normalizeValueCase(raw);
  const hoursSaved =
    Math.max(0, inputs.reviewHoursBefore - inputs.reviewHoursAfter) * inputs.annualReviews;
  const laborValue = hoursSaved * inputs.hourlyCost;
  const expectedLossBefore = inputs.annualExposure * inputs.eventProbability;
  const modeledAvoidedLoss = expectedLossBefore * inputs.controlEffectiveness;
  const observedNetValue = laborValue + inputs.directRecoveries - inputs.annualProgramCost;
  const observedRoi =
    inputs.annualProgramCost > 0 ? observedNetValue / inputs.annualProgramCost : null;
  const monthlyObservedValue = (laborValue + inputs.directRecoveries) / 12;
  const paybackMonths =
    monthlyObservedValue > 0 ? inputs.annualProgramCost / monthlyObservedValue : null;
  return {
    inputs,
    observed: {
      hoursSaved,
      laborValue,
      directRecoveries: inputs.directRecoveries,
      total: laborValue + inputs.directRecoveries,
      net: observedNetValue,
      roi: observedRoi,
      paybackMonths,
    },
    modeled: {
      expectedLossBefore,
      low: modeledAvoidedLoss * 0.5,
      base: modeledAvoidedLoss,
      high: modeledAvoidedLoss * 1.5,
    },
  };
}

export function applyVerifiedAnnualHours(raw: ValueCaseInputs, annualHours: number) {
  const inputs = normalizeValueCase(raw);
  const hours = Number.isFinite(annualHours) ? Math.max(0, annualHours) : 0;
  if (inputs.annualReviews === 0) return inputs;
  return normalizeValueCase({
    ...inputs,
    reviewHoursAfter: Math.max(0, inputs.reviewHoursBefore - hours / inputs.annualReviews),
  });
}

export function createValueCaseMemo(
  raw: ValueCaseInputs,
  generatedAt: Date = new Date(),
  evidence: ValueEvidence[] = [],
) {
  const value = calculateValueCase(raw);
  const percent = (input: number) => `${(input * 100).toFixed(1)}%`;
  const money = (input: number) => `$${Math.round(input).toLocaleString("en-US")}`;
  const evidenceRows = evidence.length
    ? evidence.map(
        (item) =>
          `| ${item.verified ? "Verified" : "Unverified"} | ${item.kind} | ${item.description.replaceAll("|", "\\|")} | ${item.source.replaceAll("|", "\\|") || "—"} |`,
      )
    : ["| — | — | No evidence recorded | — |"];
  return [
    "# Precog value case",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    "## Directly observed value",
    "",
    `- Annual review hours returned: ${value.observed.hoursSaved.toLocaleString("en-US")}`,
    `- Labor capacity value: ${money(value.observed.laborValue)}`,
    `- Documented recoveries: ${money(value.observed.directRecoveries)}`,
    `- Annual program cost: ${money(value.inputs.annualProgramCost)}`,
    `- Net observed value: ${money(value.observed.net)}`,
    `- Observed ROI: ${value.observed.roi === null ? "Not available" : percent(value.observed.roi)}`,
    `- Payback: ${value.observed.paybackMonths === null ? "Not available" : `${value.observed.paybackMonths.toFixed(1)} months`}`,
    "",
    "## Modeled risk reduction (not realized savings)",
    "",
    `- Annual exposure (your assumption): ${money(value.inputs.annualExposure)}`,
    `- Baseline event probability (your assumption): ${percent(value.inputs.eventProbability)}`,
    `- Estimated control effectiveness (your assumption): ${percent(value.inputs.controlEffectiveness)}`,
    `- Low / base / high: ${money(value.modeled.low)} / ${money(value.modeled.base)} / ${money(value.modeled.high)}`,
    "",
    "> Modeled avoided loss is a decision scenario, not booked savings. Validate assumptions independently and report it separately from observed value.",
    "",
    "## Evidence register",
    "",
    "| Status | Type | Observation | Source |",
    "| --- | --- | --- | --- |",
    ...evidenceRows,
    "",
  ].join("\n");
}
