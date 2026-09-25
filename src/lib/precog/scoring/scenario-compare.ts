import { runPrecogScenario } from "../engine";
import type { IndustryTemplate } from "../templates";
import type { PrecogResult, StaffComposition } from "../types";
import type { RiskVariableState } from "./dynamic-variables";

interface CompareColumn {
  id: string;
  label: string;
  scenarioId: string;
  mitigationIds: string[];
  result: PrecogResult;
  /**
   * Priority pressure, lower is better: the assumed retained loss per day of
   * the scenario's own assumed days until found, as the scenario author wrote
   * them. Mitigations shorten the days a scheme runs, which is good, so they
   * never raise the pressure by shortening the divisor.
   */
  priorityIndex: number;
  annualMitigationCost: number;
}

interface CompareDelta {
  columnId: string;
  vsBaseline: {
    expectedLossDelta: number;
    retainedDelta: number;
    p50DaysDelta: number;
    annualCorDelta: number;
  };
}

/**
 * Winners are column ids, or "" when no column earns the title. Comparing the
 * futures of one scenario, the "Do nothing" baseline never wins: a winner must
 * beat it outright, with the assumed gross loss breaking a tie on retained
 * loss or cost of risk (a default deductible can make every retained figure
 * the same while the gross loss differs by tens of thousands).
 */
export interface CompareReport {
  mode: "futures" | "cross";
  baselineId: string;
  columns: CompareColumn[];
  deltas: CompareDelta[];
  winnerByRetained: string;
  winnerByPriority: string;
  winnerByAnnualCor: string;
  staff: StaffComposition;
}

function lossMetric(result: PrecogResult): number {
  return result.retainedImpact?.expected ?? result.financialImpact.expected;
}

function annualCor(result: PrecogResult): number {
  return result.dynamic?.expectedAnnualCostOfRisk ?? lossMetric(result);
}

function grossMetric(result: PrecogResult): number {
  return result.financialImpact.expected;
}

function priorityIndex(result: PrecogResult, authoredDays: number): number {
  return lossMetric(result) * (1 / Math.max(14, authoredDays));
}

function buildCompareColumn(
  tpl: IndustryTemplate,
  scenarioId: string,
  mitigationIds: string[],
  staff: StaffComposition,
  label?: string,
  riskVariables?: RiskVariableState,
): CompareColumn | null {
  const { scenarios } = tpl;
  const scenario = scenarios.find((s) => s.id === scenarioId);
  const result = runPrecogScenario(tpl, scenarioId, {
    mitigationIds,
    staff,
    riskVariables,
  });
  if (!scenario || !result) return null;

  const annualMitigationCost = scenario.mitigations
    .filter((m) => mitigationIds.includes(m.id))
    .reduce((s, m) => s + m.costAnnual, 0);

  const mitLabel =
    mitigationIds.length === 0
      ? "Do nothing"
      : scenario.mitigations
          .filter((m) => mitigationIds.includes(m.id))
          .map((m) => m.label)
          .join(" + ");

  return {
    id: `${scenarioId}__${mitigationIds.slice().sort().join(",") || "none"}`,
    label: label ?? `${scenario.title} · ${mitLabel}`,
    scenarioId,
    mitigationIds,
    result,
    priorityIndex: priorityIndex(result, scenario.baseTimelineDays.p50),
    annualMitigationCost,
  };
}

export function compareScenarios(
  tpl: IndustryTemplate,
  scenarioIds: string[],
  staff?: StaffComposition,
  mitigationByScenario: Record<string, string[]> = {},
  riskVariables?: RiskVariableState,
): CompareReport {
  const staffResolved = staff ?? tpl.staffComposition;
  const columns = scenarioIds
    .map((id) =>
      buildCompareColumn(
        tpl,
        id,
        mitigationByScenario[id] ?? [],
        staffResolved,
        undefined,
        riskVariables,
      ),
    )
    .filter(Boolean) as CompareColumn[];

  return finalizeReport(columns, staffResolved, "cross");
}

export function compareScenarioFutures(
  tpl: IndustryTemplate,
  scenarioId: string,
  staff?: StaffComposition,
  selectedMitigationIds: string[] = [],
  riskVariables?: RiskVariableState,
): CompareReport {
  const { scenarios, staffComposition: defaultStaff } = tpl;
  const staffResolved = staff ?? defaultStaff;
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    return finalizeReport([], staffResolved, "futures");
  }

  const columns: CompareColumn[] = [];

  const base = buildCompareColumn(tpl, scenarioId, [], staffResolved, "Do nothing", riskVariables);
  if (base) columns.push(base);

  for (const m of scenario.mitigations) {
    const col = buildCompareColumn(tpl, scenarioId, [m.id], staffResolved, m.label, riskVariables);
    if (col) columns.push(col);
  }

  if (selectedMitigationIds.length > 1) {
    const combined = buildCompareColumn(
      tpl,
      scenarioId,
      selectedMitigationIds,
      staffResolved,
      "Selected package",
      riskVariables,
    );
    if (combined) columns.push(combined);
  }

  return finalizeReport(columns, staffResolved, "futures");
}

/**
 * The column that does best on `key` (lower is better), with the assumed gross
 * loss breaking ties. In futures mode the baseline is not a candidate and a
 * winner must beat it outright; otherwise there is no winner.
 */
function pickWinner(
  columns: CompareColumn[],
  mode: CompareReport["mode"],
  key: (c: CompareColumn) => number,
): string {
  const better = (a: CompareColumn, b: CompareColumn) =>
    key(a) < key(b) || (key(a) === key(b) && grossMetric(a.result) < grossMetric(b.result));
  const baseline = columns[0];
  const candidates = mode === "futures" ? columns.slice(1) : columns;
  if (candidates.length === 0) return "";
  const best = candidates.reduce((a, b) => (better(b, a) ? b : a));
  if (mode === "futures" && !better(best, baseline)) return "";
  return best.id;
}

function finalizeReport(
  columns: CompareColumn[],
  staff: StaffComposition,
  mode: CompareReport["mode"],
): CompareReport {
  if (columns.length === 0) {
    return {
      mode,
      baselineId: "",
      columns: [],
      deltas: [],
      winnerByRetained: "",
      winnerByPriority: "",
      winnerByAnnualCor: "",
      staff,
    };
  }

  const baselineId = columns[0].id;
  const baseline = columns[0];

  const deltas: CompareDelta[] = columns.map((c) => {
    const el = c.result.financialImpact.expected - baseline.result.financialImpact.expected;
    const ret = lossMetric(c.result) - lossMetric(baseline.result);
    const p50 = c.result.timelineDays.p50 - baseline.result.timelineDays.p50;
    const cor = annualCor(c.result) - annualCor(baseline.result);
    return {
      columnId: c.id,
      vsBaseline: {
        expectedLossDelta: el,
        retainedDelta: ret,
        p50DaysDelta: p50,
        annualCorDelta: cor,
      },
    };
  });

  return {
    mode,
    baselineId,
    columns,
    deltas,
    winnerByRetained: pickWinner(columns, mode, (c) => lossMetric(c.result)),
    winnerByPriority: pickWinner(columns, mode, (c) => c.priorityIndex),
    winnerByAnnualCor: pickWinner(columns, mode, (c) => annualCor(c.result)),
    staff,
  };
}

export const COMPARE_PALETTE = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-warn)",
  "var(--color-danger)",
  "var(--color-ok)",
  "var(--color-muted)",
];
