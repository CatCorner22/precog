import { useMemo, useState } from "react";
import { scenarios, staffComposition as baseStaff } from "@/lib/precog/demo-data";
import type { StaffComposition } from "@/lib/precog/types";
import type { RiskVariableState } from "@/lib/precog/scoring/dynamic-variables";
import {
  COMPARE_PALETTE,
  compareChartSeries,
  compareScenarioFutures,
  compareScenarios,
  type CompareReport,
} from "@/lib/precog/scoring/scenario-compare";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd, cn } from "@/lib/utils";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Columns2, GitCompare, Trophy } from "lucide-react";

type Mode = "futures" | "cross";

export function ScenarioCompare({
  initialScenarioId,
  sharedStaff,
  onStaffChange,
  riskVariables,
}: {
  initialScenarioId?: string | null;
  sharedStaff?: StaffComposition;
  onStaffChange?: (s: StaffComposition) => void;
  riskVariables?: RiskVariableState;
}) {
  const [mode, setMode] = useState<Mode>("futures");
  const [focusScenarioId, setFocusScenarioId] = useState(
    initialScenarioId && scenarios.some((s) => s.id === initialScenarioId)
      ? initialScenarioId
      : scenarios[0].id,
  );
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(
    scenarios.slice(0, 3).map((s) => s.id),
  );
  const [packageMits, setPackageMits] = useState<string[]>([]);
  const [crossMits, setCrossMits] = useState<Record<string, string[]>>({});
  const [staff, setStaff] = useState<StaffComposition>(
    sharedStaff ? { ...sharedStaff } : { ...baseStaff },
  );

  const report: CompareReport = useMemo(() => {
    if (mode === "futures") {
      return compareScenarioFutures(
        focusScenarioId,
        staff,
        packageMits,
        riskVariables,
      );
    }
    return compareScenarios(selectedScenarios, staff, crossMits, riskVariables);
  }, [mode, focusScenarioId, staff, packageMits, selectedScenarios, crossMits, riskVariables]);

  const chartData = useMemo(() => compareChartSeries(report), [report]);
  const focusScenario = scenarios.find((s) => s.id === focusScenarioId)!;

  function updateStaff(next: StaffComposition) {
    setStaff(next);
    onStaffChange?.(next);
  }

  function toggleScenario(id: string) {
    setSelectedScenarios((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  function togglePackageMit(id: string) {
    setPackageMits((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleCrossMit(scenarioId: string, mitId: string) {
    setCrossMits((prev) => {
      const cur = prev[scenarioId] ?? [];
      const next = cur.includes(mitId)
        ? cur.filter((x) => x !== mitId)
        : [...cur, mitId];
      return { ...prev, [scenarioId]: next };
    });
  }

  const deltaMap = new Map(report.deltas.map((d) => [d.columnId, d]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={mode === "futures" ? "default" : "secondary"}
          onClick={() => setMode("futures")}
        >
          <GitCompare className="size-3.5" />
          Futures of one scenario
        </Button>
        <Button
          size="sm"
          variant={mode === "cross" ? "default" : "secondary"}
          onClick={() => setMode("cross")}
        >
          <Columns2 className="size-3.5" />
          Cross-scenario compare
        </Button>
      </div>

      {mode === "futures" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scenario under test</CardTitle>
            <CardDescription>
              Side-by-side under current insurance / control variables
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setFocusScenarioId(s.id);
                    setPackageMits([]);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                    focusScenarioId === s.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-elevated hover:border-border-strong",
                  )}
                >
                  <span className="font-medium">{s.title}</span>
                </button>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">
                Optional package (combined column)
              </p>
              <div className="flex flex-wrap gap-2">
                {focusScenario.mitigations.map((m) => {
                  const on = packageMits.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => togglePackageMit(m.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        on
                          ? "border-ok/40 bg-ok/10 text-ok"
                          : "border-border bg-elevated text-muted",
                      )}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scenarios to compare (max 4)</CardTitle>
            <CardDescription>
              Shared staff + insurance variables · optional mitigations per column
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {scenarios.map((s) => {
                const on = selectedScenarios.includes(s.id);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-xl border p-3",
                      on ? "border-primary/40 bg-primary/5" : "border-border bg-elevated",
                    )}
                  >
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleScenario(s.id)}
                        className="mt-1 size-4 accent-[var(--color-primary)]"
                      />
                      <span>
                        <span className="font-medium">{s.title}</span>
                        <span className="mt-0.5 block text-xs text-muted line-clamp-2">
                          {s.description}
                        </span>
                      </span>
                    </label>
                    {on && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                        {s.mitigations.map((m) => {
                          const mitOn = (crossMits[s.id] ?? []).includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleCrossMit(s.id, m.id)}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                mitOn
                                  ? "border-ok/40 bg-ok/10 text-ok"
                                  : "border-border text-muted",
                              )}
                            >
                              {m.label.slice(0, 32)}
                              {m.label.length > 32 ? "…" : ""}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Shared staff composition</CardTitle>
          <CardDescription>Applied to every column (mirrors dual control / bank rec into variables)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Slider
            label="Team size"
            value={staff.teamSize}
            min={2}
            max={20}
            onChange={(v) => updateStaff({ ...staff, teamSize: v })}
          />
          <Slider
            label="Segregation score"
            value={staff.segregationScore}
            min={0}
            max={100}
            onChange={(v) => updateStaff({ ...staff, segregationScore: v })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={staff.dualControlPayments}
              onChange={(e) =>
                updateStaff({ ...staff, dualControlPayments: e.target.checked })
              }
              className="size-4 accent-[var(--color-primary)]"
            />
            Dual control payments
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={staff.independentBankRec}
              onChange={(e) =>
                updateStaff({ ...staff, independentBankRec: e.target.checked })
              }
              className="size-4 accent-[var(--color-primary)]"
            />
            Independent bank rec
          </label>
        </CardContent>
      </Card>

      {report.columns.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <WinnerChip
              icon
              label="Lowest retained loss"
              value={
                report.columns.find((c) => c.id === report.winnerByRetained)?.label ?? "—"
              }
            />
            <WinnerChip
              label="Lowest annual cost of risk"
              value={
                report.columns.find((c) => c.id === report.winnerByAnnualCor)?.label ?? "—"
              }
            />
            <WinnerChip
              label="Lowest priority pressure"
              value={
                report.columns.find((c) => c.id === report.winnerByPriority)?.label ?? "—"
              }
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.columns.map((col, i) => {
              const d = deltaMap.get(col.id);
              const isBase = col.id === report.baselineId;
              const isWinner = col.id === report.winnerByRetained;
              const retained =
                col.result.retainedImpact?.expected ?? col.result.financialImpact.expected;
              const cor = col.result.dynamic?.expectedAnnualCostOfRisk ?? retained;
              return (
                <Card
                  key={col.id}
                  className={cn(isWinner && "border-ok/40 glow-primary")}
                >
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }}
                      />
                      {isBase && <Badge variant="default">Baseline</Badge>}
                      {isWinner && (
                        <Badge variant="ok">
                          <Trophy className="mr-1 inline size-3" />
                          Best retained
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm leading-snug">{col.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Metric
                      label="Gross expected"
                      value={formatUsd(col.result.financialImpact.expected)}
                      sub={`${formatUsd(col.result.financialImpact.low)} – ${formatUsd(col.result.financialImpact.high)}`}
                    />
                    <Metric
                      label="Retained expected"
                      value={formatUsd(retained)}
                      sub={
                        col.result.dynamic
                          ? `transferred ${formatUsd(col.result.dynamic.transferredExpected)}`
                          : "after deductible/limit"
                      }
                    />
                    <Metric
                      label="Annual cost of risk"
                      value={formatUsd(cor)}
                      sub={
                        col.result.dynamic
                          ? `premium ${formatUsd(col.result.dynamic.premiumAnnualNet)}`
                          : "incl. premium when modeled"
                      }
                    />
                    <Metric
                      label="Timeline p50"
                      value={`${col.result.timelineDays.p50} days`}
                      sub={`95% ${col.result.timelineDays.p95Low}–${col.result.timelineDays.p95High}d`}
                    />
                    {!isBase && d && (
                      <div className="rounded-lg border border-border bg-elevated px-2 py-2 text-xs">
                        <p className="text-subtle">vs baseline</p>
                        <p
                          className={cn(
                            "mt-1 font-medium",
                            d.vsBaseline.retainedDelta < 0 ? "text-ok" : "text-danger",
                          )}
                        >
                          Retained {fmtDeltaMoney(d.vsBaseline.retainedDelta)}
                        </p>
                        <p
                          className={cn(
                            d.vsBaseline.annualCorDelta < 0 ? "text-ok" : "text-muted",
                          )}
                        >
                          Annual CoR {fmtDeltaMoney(d.vsBaseline.annualCorDelta)}
                        </p>
                        <p className="text-muted">
                          p50 {fmtDeltaDays(d.vsBaseline.p50DaysDelta)}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Impact risk trajectories</CardTitle>
              <CardDescription>Overlay under shared staff + insurance variables</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(d) => `Day ${d}`}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value) => {
                        const col = report.columns.find((c) => c.id === value);
                        const label = col?.label ?? value;
                        return label.length > 36 ? label.slice(0, 35) + "…" : label;
                      }}
                    />
                    {report.columns.map((c, i) => (
                      <Line
                        key={c.id}
                        type="monotone"
                        dataKey={c.id}
                        name={c.id}
                        stroke={COMPARE_PALETTE[i % COMPARE_PALETTE.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comparison table</CardTitle>
              <CardDescription>Gross vs retained vs annual cost of risk</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-subtle">
                    <th className="py-2 pr-3 font-medium">Future</th>
                    <th className="py-2 pr-3 font-medium">Gross $</th>
                    <th className="py-2 pr-3 font-medium">Retained $</th>
                    <th className="py-2 pr-3 font-medium">Annual CoR</th>
                    <th className="py-2 pr-3 font-medium">p50</th>
                    <th className="py-2 font-medium">Δ retained</th>
                  </tr>
                </thead>
                <tbody>
                  {report.columns.map((c) => {
                    const d = deltaMap.get(c.id);
                    const retained =
                      c.result.retainedImpact?.expected ?? c.result.financialImpact.expected;
                    const cor = c.result.dynamic?.expectedAnnualCostOfRisk ?? retained;
                    return (
                      <tr key={c.id} className="border-b border-border/70">
                        <td className="py-2.5 pr-3 font-medium">
                          {c.label}
                          {c.id === report.winnerByRetained && (
                            <Badge variant="ok" className="ml-2">
                              best
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 tabular">
                          {formatUsd(c.result.financialImpact.expected)}
                        </td>
                        <td className="py-2.5 pr-3 tabular">{formatUsd(retained)}</td>
                        <td className="py-2.5 pr-3 tabular">{formatUsd(cor)}</td>
                        <td className="py-2.5 pr-3 tabular">
                          {c.result.timelineDays.p50}d
                        </td>
                        <td
                          className={cn(
                            "py-2.5 tabular",
                            d && d.vsBaseline.retainedDelta < 0 && "text-ok",
                            d && d.vsBaseline.retainedDelta > 0 && "text-danger",
                          )}
                        >
                          {c.id === report.baselineId
                            ? "—"
                            : fmtDeltaMoney(d?.vsBaseline.retainedDelta ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function WinnerChip({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <p className="text-[10px] tracking-wide text-subtle uppercase">{label}</p>
      <p className="mt-0.5 max-w-[280px] truncate text-sm font-medium">
        {icon && <Trophy className="mr-1 inline size-3.5 text-ok" />}
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-subtle">{label}</p>
      <p className="font-semibold tabular tracking-tight">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-sm">
      <div className="mb-1 flex justify-between">
        <span className="text-muted">{label}</span>
        <span className="tabular font-medium">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
    </label>
  );
}

function fmtDeltaMoney(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${formatUsd(Math.abs(n))}`;
}

function fmtDeltaDays(n: number) {
  if (n === 0) return "0d";
  return `${n > 0 ? "+" : ""}${n}d`;
}
