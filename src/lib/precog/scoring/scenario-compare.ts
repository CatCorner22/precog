import { scenarios } from "../demo-data";
import { runPrecogScenario } from "../engine";
import type { PrecogResult, StaffComposition } from "../types";
import { staffComposition as defaultStaff } from "../demo-data";

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
    p50DaysDelta: number;
    p95HighDelta: number;
    priorityIndexDelta: number;
    expectedLossPct: number;
  };
}

export interface CompareReport {
  baselineId: string;
  columns: CompareColumn[];
  deltas: CompareDelta[];
  winnerByLoss: string;
  winnerBySpeed: string; // longest p50 = worst; winner = longest delay / safest time
  winnerByPriority: string;
  staff: StaffComposition;
}

function priorityIndex(result: PrecogResult): number {
  // Higher = more urgent/dangerous
  return (
    result.financialImpact.expected *
    (1 / Math.max(14, result.timelineDays.p50))
  );
}

export function buildCompareColumn(
  scenarioId: string,
  mitigationIds: string[],
  staff: StaffComposition,
  label?: string,
): CompareColumn | null {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  const result = runPrecogScenario(scenarioId, { mitigationIds, staff });
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

/** Compare multiple scenarios under shared staff (default: do-nothing for each). */
export function compareScenarios(
  scenarioIds: string[],
  staff: StaffComposition = defaultStaff,
  mitigationByScenario: Record<string, string[]> = {},
): CompareReport {
  const columns = scenarioIds
    .map((id) =>
      buildCompareColumn(id, mitigationByScenario[id] ?? [], staff),
    )
    .filter(Boolean) as CompareColumn[];

  return finalizeReport(columns, staff);
}

/**
 * Futures for one scenario: do nothing, each mitigation alone, and best single mitigation.
 */
export function compareScenarioFutures(
  scenarioId: string,
  staff: StaffComposition = defaultStaff,
  selectedMitigationIds: string[] = [],
): CompareReport {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    return finalizeReport([], staff);
  }

  const columns: CompareColumn[] = [];

  const base = buildCompareColumn(scenarioId, [], staff, "Do nothing");
  if (base) columns.push(base);

  for (const m of scenario.mitigations) {
    const col = buildCompareColumn(scenarioId, [m.id], staff, m.label);
    if (col) columns.push(col);
  }

  if (selectedMitigationIds.length > 1) {
    const combined = buildCompareColumn(
      scenarioId,
      selectedMitigationIds,
      staff,
      "Selected package",
    );
    if (combined) columns.push(combined);
  }

  // Best single mitigation by expected loss
  const singles = columns.filter((c) => c.mitigationIds.length === 1);
  if (singles.length > 0) {
    const best = singles.reduce((a, b) =>
      a.result.financialImpact.expected <= b.result.financialImpact.expected
        ? a
        : b,
    );
    // annotate is already a column
    void best;
  }

  return finalizeReport(columns, staff);
}

function finalizeReport(
  columns: CompareColumn[],
  staff: StaffComposition,
): CompareReport {
  if (columns.length === 0) {
    return {
      baselineId: "",
      columns: [],
      deltas: [],
      winnerByLoss: "",
      winnerBySpeed: "",
      winnerByPriority: "",
      staff,
    };
  }

  const baselineId = columns[0].id;
  const baseline = columns[0];

  const deltas: CompareDelta[] = columns.map((c) => {
    const el = c.result.financialImpact.expected - baseline.result.financialImpact.expected;
    const p50 = c.result.timelineDays.p50 - baseline.result.timelineDays.p50;
    const p95 = c.result.timelineDays.p95High - baseline.result.timelineDays.p95High;
    const pri = c.priorityIndex - baseline.priorityIndex;
    const pct =
      baseline.result.financialImpact.expected === 0
        ? 0
        : (el / baseline.result.financialImpact.expected) * 100;
    return {
      columnId: c.id,
      vsBaseline: {
        expectedLossDelta: el,
        p50DaysDelta: p50,
        p95HighDelta: p95,
        priorityIndexDelta: pri,
        expectedLossPct: pct,
      },
    };
  });

  const winnerByLoss = columns.reduce((a, b) =>
    a.result.financialImpact.expected <= b.result.financialImpact.expected ? a : b,
  ).id;

  // Safer = longer p50 (delay material impact) when comparing futures of same scenario;
  // for multi-scenario, longer p50 can mean slower failure — still "better" for delay.
  const winnerBySpeed = columns.reduce((a, b) =>
    a.result.timelineDays.p50 >= b.result.timelineDays.p50 ? a : b,
  ).id;

  const winnerByPriority = columns.reduce((a, b) =>
    a.priorityIndex <= b.priorityIndex ? a : b,
  ).id;

  return {
    baselineId,
    columns,
    deltas,
    winnerByLoss,
    winnerBySpeed,
    winnerByPriority,
    staff,
  };
}

/** Chart series: risk trajectory points per column */
export function compareChartSeries(report: CompareReport) {
  const maxDay = Math.max(
    30,
    ...report.columns.map((c) => Math.round(c.result.timelineDays.p95High * 1.15)),
  );
  const days = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxDay * t));

  return days.map((day) => {
    const row: Record<string, number | string> = { day };
    for (const c of report.columns) {
      const { p50, p95Low, p95High } = c.result.timelineDays;
      let risk = 5;
      if (day >= p95High) risk = 95;
      else if (day >= p50) risk = 70 + ((day - p50) / Math.max(1, p95High - p50)) * 25;
      else if (day >= p95Low) risk = 40 + ((day - p95Low) / Math.max(1, p50 - p95Low)) * 30;
      else risk = 5 + (day / Math.max(1, p95Low)) * 35;
      row[c.id] = Math.round(Math.min(98, Math.max(0, risk)));
    }
    return row;
  });
}

export const COMPARE_PALETTE = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-warn)",
  "var(--color-danger)",
  "var(--color-ok)",
  "var(--color-muted)",
];
