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

export type ValueInputKey = keyof ValueCaseInputs;

/** The inputs that describe what actually happened, as opposed to the modeled scenario. */
const OBSERVED_INPUTS: readonly ValueInputKey[] = [
  "reviewHoursBefore",
  "reviewHoursAfter",
  "hourlyCost",
  "annualReviews",
  "directRecoveries",
  "annualProgramCost",
];

/** Plain names for each input, for "uses the app default for ..." notes. */
const VALUE_INPUT_LABEL: Record<ValueInputKey, string> = {
  reviewHoursBefore: "hours per review before",
  reviewHoursAfter: "hours per review with Precog",
  hourlyCost: "loaded hourly cost",
  annualReviews: "reviews per year",
  directRecoveries: "documented recoveries",
  annualExposure: "annual loss exposure",
  eventProbability: "baseline event probability",
  controlEffectiveness: "estimated control reduction",
  annualProgramCost: "annual program cost",
};

/** Keys of a stored `entered` list, keeping only real input names. */
export function normalizeEnteredInputs(value: unknown): ValueInputKey[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(Object.keys(DEFAULT_VALUE_CASE));
  return Array.from(
    new Set(value.filter((v): v is ValueInputKey => typeof v === "string" && known.has(v))),
  );
}

/**
 * The inputs the owner has entered: every one they typed into (tracked by the
 * page) and every one that differs from the app's default. An untouched input
 * is the app default, not the owner's assumption or observation.
 */
function enteredValueInputs(
  raw: ValueCaseInputs,
  typed: Iterable<ValueInputKey> = [],
): Set<ValueInputKey> {
  const inputs = normalizeValueCase(raw);
  const out = new Set<ValueInputKey>(typed);
  for (const key of Object.keys(DEFAULT_VALUE_CASE) as ValueInputKey[]) {
    if (inputs[key] !== DEFAULT_VALUE_CASE[key]) out.add(key);
  }
  return out;
}

/**
 * True once the owner has entered at least one observed input (hours, cost,
 * recoveries, program cost). Until then the observed metrics are the app's own
 * defaults and must not be shown as a return.
 */
export function hasOwnObservations(
  raw: ValueCaseInputs,
  typed: Iterable<ValueInputKey> = [],
): boolean {
  const entered = enteredValueInputs(raw, typed);
  return OBSERVED_INPUTS.some((key) => entered.has(key));
}

/** One observed figure: shown only when observed, with any app default it still uses named. */
export interface ObservedFigure {
  observed: boolean;
  /** The figure from the owner's inputs; null until observed. */
  value: number | null;
  /** Inputs the figure uses that are still the app default. */
  defaultsUsed: ValueInputKey[];
  /** Inputs the owner must enter before the figure counts as observed. */
  missing: ValueInputKey[];
}

/**
 * Which observed figures the owner's own inputs support.
 *
 * - Hours returned: once the hours before or after are entered.
 * - Observed value: labor once the hours and the hourly cost are entered, plus
 *   documented recoveries once entered.
 * - Net observed value: once there is observed value and the program cost is
 *   entered.
 * - Return and payback: only when every input they use is entered, so a
 *   return is never built from the app's defaults.
 */
export function observedValueStatus(
  raw: ValueCaseInputs,
  typed: Iterable<ValueInputKey> = [],
): {
  anyObservation: boolean;
  entered: Set<ValueInputKey>;
  hours: ObservedFigure;
  value: ObservedFigure;
  net: ObservedFigure;
  roi: ObservedFigure;
  payback: ObservedFigure;
} {
  const inputs = normalizeValueCase(raw);
  const entered = enteredValueInputs(inputs, typed);
  const calc = calculateValueCase(inputs);
  const has = (k: ValueInputKey) => entered.has(k);
  const defaultsOf = (keys: ValueInputKey[]) => keys.filter((k) => !has(k));

  const hourKeys: ValueInputKey[] = ["reviewHoursBefore", "reviewHoursAfter", "annualReviews"];
  const hoursObserved = has("reviewHoursBefore") || has("reviewHoursAfter");
  const hours: ObservedFigure = {
    observed: hoursObserved,
    value: hoursObserved ? calc.observed.hoursSaved : null,
    defaultsUsed: hoursObserved ? defaultsOf(hourKeys) : [],
    missing: hoursObserved ? [] : ["reviewHoursBefore", "reviewHoursAfter"],
  };

  const laborObserved = hoursObserved && has("hourlyCost");
  const recoveriesObserved = has("directRecoveries");
  const valueObserved = laborObserved || recoveriesObserved;
  const observedTotal =
    (laborObserved ? calc.observed.laborValue : 0) +
    (recoveriesObserved ? inputs.directRecoveries : 0);
  const valueDefaults = laborObserved ? defaultsOf([...hourKeys, "hourlyCost"]) : [];
  const value: ObservedFigure = {
    observed: valueObserved,
    value: valueObserved ? observedTotal : null,
    defaultsUsed: valueDefaults,
    missing: valueObserved
      ? []
      : defaultsOf(["reviewHoursBefore", "reviewHoursAfter", "hourlyCost", "directRecoveries"]),
  };

  const netObserved = valueObserved && has("annualProgramCost");
  const net: ObservedFigure = {
    observed: netObserved,
    value: netObserved ? observedTotal - inputs.annualProgramCost : null,
    defaultsUsed: netObserved ? valueDefaults : [],
    missing: netObserved ? [] : [...value.missing, ...defaultsOf(["annualProgramCost"])],
  };

  const fullyEntered = netObserved && valueDefaults.length === 0;
  const roiValue =
    fullyEntered && inputs.annualProgramCost > 0
      ? (observedTotal - inputs.annualProgramCost) / inputs.annualProgramCost
      : null;
  const paybackValue =
    fullyEntered && observedTotal > 0 ? inputs.annualProgramCost / (observedTotal / 12) : null;
  const strictMissing = fullyEntered ? [] : Array.from(new Set([...net.missing, ...valueDefaults]));
  const roi: ObservedFigure = {
    observed: roiValue !== null,
    value: roiValue,
    defaultsUsed: [],
    missing: strictMissing,
  };
  const payback: ObservedFigure = {
    observed: paybackValue !== null,
    value: paybackValue,
    defaultsUsed: [],
    missing: strictMissing,
  };

  return {
    anyObservation: OBSERVED_INPUTS.some((k) => has(k)),
    entered,
    hours,
    value,
    net,
    roi,
    payback,
  };
}

/** "reviews per year" / "reviews per year and loaded hourly cost" */
export function inputList(keys: readonly ValueInputKey[]): string {
  const words = keys.map((k) => VALUE_INPUT_LABEL[k]);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
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

/** Whole dollars with the sign in front: "-$3,640", never "$-3,640". */
export function formatMoney(input: number): string {
  const rounded = Math.round(input);
  return `${rounded < 0 ? "-" : ""}$${Math.abs(rounded).toLocaleString("en-US")}`;
}

/**
 * The executive memo. Its observed section appears only once the owner has
 * entered an observation (an input of their own or an evidence item); each
 * observed figure names any app default it still uses, and the return and
 * payback print only when every input behind them is the owner's.
 */
export function createValueCaseMemo(
  raw: ValueCaseInputs,
  generatedAt: Date = new Date(),
  evidence: ValueEvidence[] = [],
  typed: Iterable<ValueInputKey> = [],
) {
  const value = calculateValueCase(raw);
  const status = observedValueStatus(value.inputs, typed);
  const percent = (input: number) => `${(input * 100).toFixed(1)}%`;
  const money = formatMoney;
  const uses = (f: ObservedFigure) =>
    f.defaultsUsed.length ? ` (uses the app default for ${inputList(f.defaultsUsed)})` : "";
  const notYet = (f: ObservedFigure) =>
    `not yet observed${f.missing.length ? `; enter ${inputList(f.missing)}` : ""}`;
  const line = (label: string, f: ObservedFigure, show: (v: number) => string) =>
    `- ${label}: ${f.observed && f.value !== null ? `${show(f.value)}${uses(f)}` : notYet(f)}`;
  const assumption = (key: ValueInputKey) =>
    status.entered.has(key) ? "your assumption" : "app default";
  const evidenceRows = evidence.length
    ? evidence.map(
        (item) =>
          `| ${item.verified ? "Verified" : "Unverified"} | ${item.kind} | ${item.description.replaceAll("|", "\\|")} | ${item.source.replaceAll("|", "\\|") || "—"} |`,
      )
    : ["| — | — | No evidence recorded | — |"];
  const observedSection =
    status.anyObservation || evidence.length > 0
      ? [
          "## Directly observed value",
          "",
          line("Annual review hours returned", status.hours, (v) => v.toLocaleString("en-US")),
          line("Observed value (labor and documented recoveries)", status.value, money),
          `- Documented recoveries: ${status.entered.has("directRecoveries") ? money(value.inputs.directRecoveries) : "not yet observed"}`,
          `- Annual program cost: ${status.entered.has("annualProgramCost") ? money(value.inputs.annualProgramCost) : "not yet observed"}`,
          line("Net observed value", status.net, money),
          line("Observed ROI", status.roi, percent),
          line("Payback", status.payback, (v) => `${v.toFixed(1)} months`),
        ]
      : [
          "## Observed value",
          "",
          "Not yet observed. Nothing on this memo is observed until you enter your own review hours, costs or recoveries on Value proof, or record evidence; the figures below are app defaults unless marked as your assumption.",
        ];
  return [
    "# Precog value case",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    ...observedSection,
    "",
    "## Modeled risk reduction (not realized savings)",
    "",
    `- Annual exposure (${assumption("annualExposure")}): ${money(value.inputs.annualExposure)}`,
    `- Baseline event probability (${assumption("eventProbability")}): ${percent(value.inputs.eventProbability)}`,
    `- Estimated control effectiveness (${assumption("controlEffectiveness")}): ${percent(value.inputs.controlEffectiveness)}`,
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
