import { runPrecogScenario } from "../engine";
import type { IndustryTemplate } from "../templates";
import type { PrecogResult, StaffComposition } from "../types";
import type { RiskVariableState } from "./dynamic-variables";

export interface CompareColumn {
  id: string;
  label: string;
  scenarioId: string;
  mitigationIds: string[];
  result: PrecogResult;
  /** Lower is better priority pressure */
  priorityIndex: number;
  annualMitigationCost: number;
}

export interface CompareDelta {
  columnId: string;
  vsBaseline: {
    expectedLossDelta: number;
    retainedDelta: number;
    p50DaysDelta: number;
    p95HighDelta: number;
    priorityIndexDelta: number;
    expectedLossPct: number;
    annualCorDelta: number;
  };
}

export interface CompareReport {
  baselineId: string;
  columns: CompareColumn[];
  deltas: CompareDelta[];
  winnerByLoss: string;
  winnerByRetained: string;
  winnerBySpeed: string;
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

function priorityIndex(result: PrecogResult): number {
  return lossMetric(result) * (1 / Math.max(14, result.timelineDays.p50));
}

export function buildCompareColumn(
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
    priorityIndex: priorityIndex(result),
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

  return finalizeReport(columns, staffResolved);
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
    return finalizeReport([], staffResolved);
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

  return finalizeReport(columns, staffResolved);
}

function finalizeReport(columns: CompareColumn[], staff: StaffComposition): CompareReport {
  if (columns.length === 0) {
    return {
      baselineId: "",
      columns: [],
      deltas: [],
      winnerByLoss: "",
      winnerByRetained: "",
      winnerBySpeed: "",
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
    const p95 = c.result.timelineDays.p95High - baseline.result.timelineDays.p95High;
    const pri = c.priorityIndex - baseline.priorityIndex;
    const cor = annualCor(c.result) - annualCor(baseline.result);
    const pct =
      baseline.result.financialImpact.expected === 0
        ? 0
        : (el / baseline.result.financialImpact.expected) * 100;
    return {
      columnId: c.id,
      vsBaseline: {
        expectedLossDelta: el,
        retainedDelta: ret,
        p50DaysDelta: p50,
        p95HighDelta: p95,
        priorityIndexDelta: pri,
        expectedLossPct: pct,
        annualCorDelta: cor,
      },
    };
  });

  const winnerByLoss = columns.reduce((a, b) =>
    a.result.financialImpact.expected <= b.result.financialImpact.expected ? a : b,
  ).id;

  const winnerByRetained = columns.reduce((a, b) =>
    lossMetric(a.result) <= lossMetric(b.result) ? a : b,
  ).id;

  const winnerBySpeed = columns.reduce((a, b) =>
    a.result.timelineDays.p50 >= b.result.timelineDays.p50 ? a : b,
  ).id;

  const winnerByPriority = columns.reduce((a, b) =>
    a.priorityIndex <= b.priorityIndex ? a : b,
  ).id;

  const winnerByAnnualCor = columns.reduce((a, b) =>
    annualCor(a.result) <= annualCor(b.result) ? a : b,
  ).id;

  return {
    baselineId,
    columns,
    deltas,
    winnerByLoss,
    winnerByRetained,
    winnerBySpeed,
    winnerByPriority,
    winnerByAnnualCor,
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
