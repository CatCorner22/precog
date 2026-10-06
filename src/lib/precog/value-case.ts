import {
  VALUE_EVIDENCE_KIND_LABEL,
  formatEvidenceAmount,
  summarizeValueEvidence,
  type ValueEvidence,
} from "./value-evidence";
import { formatDay } from "./dates";
import { count, joinWithAnd } from "./text";
import { formatEstimateUsd, formatUsd, formatPct } from "../utils";
import { boundedNumber } from "./number";

export const VALUE_CASE_STORAGE_KEY = "precog-value-case-v1";

/**
 * The modeled range around the base avoided loss: half and one and a half
 * times the base. This app's assumption, not a statistical interval.
 */
const MODELED_RANGE = { low: 0.5, high: 1.5 } as const;

/** The sentence that says where Low and High come from, for the memo and the card. */
export const MODELED_RANGE_NOTE =
  "Low and High assume the control reduction is half, or one and a half times, the base figure (Precog's assumption). High never exceeds the expected loss.";

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

function bounded(value: unknown, minimum: number, maximum: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return boundedNumber(numeric, { min: minimum, max: maximum, fallback: minimum });
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
  /** Cash recovered: the documented recoveries, once entered. */
  cash: ObservedFigure;
  /** Time returned, valued at the owner's hourly cost, once the hours and the cost are entered. */
  time: ObservedFigure;
  net: ObservedFigure;
  roi: ObservedFigure;
  /** Return on cash alone: recoveries against the program cost, with no value put on time. */
  cashRoi: ObservedFigure;
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

  const cash: ObservedFigure = {
    observed: recoveriesObserved,
    value: recoveriesObserved ? inputs.directRecoveries : null,
    defaultsUsed: [],
    missing: recoveriesObserved ? [] : ["directRecoveries"],
  };
  const time: ObservedFigure = {
    observed: laborObserved,
    value: laborObserved ? calc.observed.laborValue : null,
    defaultsUsed: valueDefaults,
    missing: laborObserved
      ? []
      : defaultsOf(["reviewHoursBefore", "reviewHoursAfter", "hourlyCost"]),
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

  // Both inputs behind it are typed numbers, never defaults, so it is either
  // observed or missing.
  const cashRoiValue =
    recoveriesObserved && has("annualProgramCost") ? calc.observed.cashRoi : null;
  const cashRoi: ObservedFigure = {
    observed: cashRoiValue !== null,
    value: cashRoiValue,
    defaultsUsed: [],
    missing: cashRoiValue !== null ? [] : defaultsOf(["directRecoveries", "annualProgramCost"]),
  };

  return {
    anyObservation: OBSERVED_INPUTS.some((k) => has(k)),
    entered,
    hours,
    value,
    cash,
    time,
    net,
    roi,
    cashRoi,
    payback,
  };
}

/** What the two modeled tiles read before the owner enters their own exposure or probability. */
export const NOT_ENTERED = "Not entered";

/**
 * The "Modeled risk reduction" and "Assumed loss baseline" tiles. While the
 * annual exposure and the event probability are both Precog defaults, neither
 * tile prints a dollar figure: it reads "Not entered", so a default never
 * reads as the business's own loss.
 */
export function modeledTileValues(
  raw: ValueCaseInputs,
  typed: Iterable<ValueInputKey> = [],
): { riskReduction: string; lossBaseline: string; entered: boolean } {
  const inputs = normalizeValueCase(raw);
  const entered = enteredValueInputs(inputs, typed);
  const own = entered.has("annualExposure") || entered.has("eventProbability");
  if (!own) return { riskReduction: NOT_ENTERED, lossBaseline: NOT_ENTERED, entered: false };
  const { modeled } = calculateValueCase(inputs);
  return {
    riskReduction: formatUsd(modeled.base),
    // An assumed loss, so it reads as every scenario loss does: "about $16,000".
    lossBaseline: formatEstimateUsd(modeled.expectedLossBefore),
    entered: true,
  };
}

/**
 * The Low, Base and High rows of the "Modeled range" card. Like the modeled
 * tiles, they read "Not entered" (with no bar) until the owner enters the
 * annual exposure or the event probability, so a loss built only from Precog
 * defaults never reads as this business's own.
 */
export function modeledRangeRows(
  raw: ValueCaseInputs,
  typed: Iterable<ValueInputKey> = [],
): Array<{ label: "Low" | "Base" | "High"; amount: number | null; display: string }> {
  const inputs = normalizeValueCase(raw);
  const { entered } = modeledTileValues(inputs, typed);
  const { modeled } = calculateValueCase(inputs);
  return (
    [
      ["Low", modeled.low],
      ["Base", modeled.base],
      ["High", modeled.high],
    ] as const
  ).map(([label, amount]) =>
    entered
      ? { label, amount, display: formatUsd(amount) }
      : { label, amount: null, display: NOT_ENTERED },
  );
}

/** "reviews per year" / "reviews per year and loaded hourly cost" */
export function inputList(keys: readonly ValueInputKey[]): string {
  return joinWithAnd(keys.map((k) => VALUE_INPUT_LABEL[k]));
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
  // Cash only: what was recovered against what the program costs, with no
  // value put on the hours returned.
  const cashRoi =
    inputs.annualProgramCost > 0
      ? (inputs.directRecoveries - inputs.annualProgramCost) / inputs.annualProgramCost
      : null;
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
      cashRoi,
      paybackMonths,
    },
    modeled: {
      expectedLossBefore,
      low: modeledAvoidedLoss * MODELED_RANGE.low,
      base: modeledAvoidedLoss,
      // No control avoids more loss than was expected in the first place.
      high: Math.min(expectedLossBefore, modeledAvoidedLoss * MODELED_RANGE.high),
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
  const uses = (f: ObservedFigure) =>
    f.defaultsUsed.length ? ` (uses the Precog default for ${inputList(f.defaultsUsed)})` : "";
  const notYet = (f: ObservedFigure) =>
    `not yet observed${f.missing.length ? `; enter ${inputList(f.missing)}` : ""}`;
  const line = (label: string, f: ObservedFigure, show: (v: number) => string) =>
    `- ${label}: ${f.observed && f.value !== null ? `${show(f.value)}${uses(f)}` : notYet(f)}`;
  const assumption = (key: ValueInputKey) =>
    status.entered.has(key) ? "your assumption" : "Precog default";
  const cell = (text: string) => text.replaceAll("|", "\\|") || "—";
  const evidenceRows = evidence.length
    ? evidence.map(
        (item) =>
          `| ${item.verified ? "Verified" : "Unverified"} | ${VALUE_EVIDENCE_KIND_LABEL[item.kind]} | ${cell(item.description)} | ${formatEvidenceAmount(item)} | ${item.observedAt ? formatDay(item.observedAt) : "—"} | ${cell(item.source)} |`,
      )
    : ["| — | — | No evidence recorded | — | — | — |"];
  const register = summarizeValueEvidence(evidence, generatedAt);
  const typedRecoveries = status.entered.has("directRecoveries")
    ? value.inputs.directRecoveries
    : null;
  const recoveriesDiffer = typedRecoveries !== null && typedRecoveries !== register.recoveries;
  const observedSection =
    status.anyObservation || evidence.length > 0
      ? [
          "## Directly observed value",
          "",
          line("Annual review hours returned", status.hours, (v) => v.toLocaleString("en-US")),
          line("Cash recovered", status.cash, formatUsd),
          line("Time returned (valued at your hourly cost)", status.time, formatUsd),
          line("Observed value (cash recovered and time returned)", status.value, formatUsd),
          `- Verified recoveries in the evidence register: ${formatUsd(register.recoveries)} (${register.verified} verified of ${count(register.total, "item")})${recoveriesDiffer ? "; this differs from the cash recovered above" : ""}`,
          `- Verified hours in the evidence register: ${register.hours.toLocaleString("en-US")}`,
          `- Annual program cost: ${status.entered.has("annualProgramCost") ? formatUsd(value.inputs.annualProgramCost) : "not yet observed"}`,
          line("Net observed value", status.net, formatUsd),
          line("Cash-only ROI", status.cashRoi, (v) => formatPct(v, 1)),
          line("ROI including time", status.roi, (v) => formatPct(v, 1)),
          line("Payback", status.payback, (v) => `${v.toFixed(1)} months`),
        ]
      : [
          "## Observed value",
          "",
          "Not yet observed. This memo shows no observed figure until you enter your own review hours, costs or recoveries on Value proof, or record evidence; the figures below are Precog defaults unless marked as your assumption.",
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
    `- Annual exposure (${assumption("annualExposure")}): ${formatUsd(value.inputs.annualExposure)}`,
    `- Baseline event probability (${assumption("eventProbability")}): ${formatPct(value.inputs.eventProbability, 1)}`,
    `- Estimated control effectiveness (${assumption("controlEffectiveness")}): ${formatPct(value.inputs.controlEffectiveness, 1)}`,
    `- Low / base / high: ${formatUsd(value.modeled.low)} / ${formatUsd(value.modeled.base)} / ${formatUsd(value.modeled.high)} (base ×${MODELED_RANGE.low} and ×${MODELED_RANGE.high}, Precog's assumption${value.modeled.high < value.modeled.base * MODELED_RANGE.high ? "; High is capped at the expected loss" : ""})`,
    "",
    "> Modeled avoided loss is a decision scenario, not booked savings. Validate assumptions independently and report it separately from observed value.",
    "",
    "## Evidence register",
    "",
    "| Status | Type | Observation | Amount | Observed | Source |",
    "| --- | --- | --- | --- | --- | --- |",
    ...evidenceRows,
    "",
  ].join("\n");
}
