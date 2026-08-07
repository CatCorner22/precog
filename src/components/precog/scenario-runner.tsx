import { useEffect, useMemo, useState } from "react";
import {
  crimeFraudStats,
  scenarios,
} from "@/lib/precog/demo-data";
import { runPrecogScenario } from "@/lib/precog/engine";
import type { StaffComposition } from "@/lib/precog/types";
import {
  DEFAULT_RISK_VARIABLES,
  type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import { usePractice } from "@/lib/precog/practice-context";
import { CascadePanel } from "@/components/precog/cascade-panel";
import { DynamicVariablesPanel } from "@/components/precog/dynamic-variables-panel";
import { ScenarioCompare } from "@/components/precog/scenario-compare";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import { LAYER_META } from "@/lib/precog/demo-data";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GitBranch, GitCompare, LineChart, SlidersHorizontal } from "lucide-react";

export function ScenarioRunner({
  initialScenarioId,
}: {
  initialScenarioId?: string | null;
}) {
  const { profile, setStaff: setProfileStaff, setRiskVariables: setProfileRisk } =
    usePractice();
  const [view, setView] = useState<"single" | "compare" | "variables" | "cascades">(
    "single",
  );
  const [scenarioId, setScenarioId] = useState(
    initialScenarioId && scenarios.some((s) => s.id === initialScenarioId)
      ? initialScenarioId
      : scenarios[0].id,
  );
  const [mitigations, setMitigations] = useState<string[]>([]);
  const [staff, setStaff] = useState<StaffComposition>({ ...profile.staff });
  const [riskVars, setRiskVars] = useState<RiskVariableState>({
    ...profile.riskVariables,
  });

  useEffect(() => {
    setStaff({ ...profile.staff });
    setRiskVars({ ...profile.riskVariables });
  }, [profile.staff, profile.riskVariables]);

  useEffect(() => {
    if (initialScenarioId && scenarios.some((s) => s.id === initialScenarioId)) {
      setScenarioId(initialScenarioId);
      setMitigations([]);
    }
  }, [initialScenarioId]);

  function updateStaff(next: StaffComposition) {
    setStaff(next);
    setRiskVars((v) => ({
      ...v,
      hasDualControl: next.dualControlPayments,
      hasIndependentBankRec: next.independentBankRec,
    }));
    setProfileStaff(next);
  }

  function updateRiskVars(next: RiskVariableState) {
    setRiskVars(next);
    setStaff((s) => ({
      ...s,
      dualControlPayments: next.hasDualControl,
      independentBankRec: next.hasIndependentBankRec,
    }));
    setProfileRisk(next);
  }

  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  const result = useMemo(
    () =>
      runPrecogScenario(scenarioId, {
        mitigationIds: mitigations,
        staff,
        riskVariables: riskVars,
      }),
    [scenarioId, mitigations, staff, riskVars],
  );

  const chartData = useMemo(() => {
    if (!result) return [];
    const { p50, p95Low, p95High } = result.timelineDays;
    return [
      { day: 0, risk: 5 },
      { day: p95Low, risk: 45 },
      { day: p50, risk: 72 },
      { day: p95High, risk: 92 },
      { day: Math.round(p95High * 1.2), risk: 96 },
    ];
  }, [result]);

  function toggleMitigation(id: string) {
    setMitigations((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={view === "single" ? "default" : "secondary"}
          onClick={() => setView("single")}
        >
          <LineChart className="size-3.5" />
          Single scenario
        </Button>
        <Button
          size="sm"
          variant={view === "compare" ? "default" : "secondary"}
          onClick={() => setView("compare")}
        >
          <GitCompare className="size-3.5" />
          Multi-scenario compare
        </Button>
        <Button
          size="sm"
          variant={view === "variables" ? "default" : "secondary"}
          onClick={() => setView("variables")}
        >
          <SlidersHorizontal className="size-3.5" />
          Dynamic variables
        </Button>
        <Button
          size="sm"
          variant={view === "cascades" ? "default" : "secondary"}
          onClick={() => setView("cascades")}
        >
          <GitBranch className="size-3.5" />
          Cascades
        </Button>
      </div>

      {view === "compare" ? (
        <ScenarioCompare
          initialScenarioId={scenarioId}
          sharedStaff={staff}
          onStaffChange={updateStaff}
          riskVariables={riskVars}
        />
      ) : view === "cascades" ? (
        <CascadePanel />
      ) : view === "variables" ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScenarioId(s.id)}
                className={
                  scenarioId === s.id
                    ? "rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 text-left text-sm"
                    : "rounded-xl border border-border bg-elevated px-3 py-2 text-left text-sm"
                }
              >
                {s.title}
              </button>
            ))}
          </div>
          <DynamicVariablesPanel
            value={riskVars}
            onChange={updateRiskVars}
            result={result}
          />
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live outcome</CardTitle>
                <CardDescription>{scenario.title}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Outcome
                  label="p50 timeline"
                  value={`${result.timelineDays.p50}d`}
                  sub={`${result.timelineDays.p95Low}–${result.timelineDays.p95High}d 95%`}
                />
                <Outcome
                  label="Gross expected"
                  value={formatUsd(result.financialImpact.expected)}
                  sub="before insurance"
                />
                <Outcome
                  label="Retained expected"
                  value={formatUsd(result.retainedImpact.expected)}
                  sub="after deductible / limit"
                />
                <Outcome
                  label="Annual cost of risk"
                  value={formatUsd(result.dynamic?.expectedAnnualCostOfRisk ?? 0)}
                  sub="premium + annualized retained"
                />
              </CardContent>
            </Card>
          )}
          <Button variant="secondary" size="sm" onClick={() => setView("cascades")}>
            <GitBranch className="size-3.5" />
            See how levers cascade across metrics
          </Button>
        </div>
      ) : !result ? null : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScenarioId(s.id);
                  setMitigations([]);
                }}
                className={
                  scenarioId === s.id
                    ? "rounded-xl border border-primary/50 bg-primary/10 p-4 text-left glow-primary"
                    : "rounded-xl border border-border bg-surface p-4 text-left hover:border-border-strong"
                }
              >
                <p className="text-sm font-semibold leading-snug">{s.title}</p>
                <p className="mt-2 line-clamp-2 text-xs text-muted">{s.description}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Precog projection</CardTitle>
                <CardDescription>
                  Coupled to dynamic variables — change one input, likelihood and cost both move
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Stat
                    label="Most likely timeline"
                    value={`${result.timelineDays.p50} days`}
                    hint="p50 · detection lag applied"
                  />
                  <Stat
                    label="95% confidence range"
                    value={`${result.timelineDays.p95Low}–${result.timelineDays.p95High}d`}
                    hint={result.confidenceLabel}
                  />
                  <Stat
                    label="Gross financial impact"
                    value={formatUsd(result.financialImpact.expected)}
                    hint={`${formatUsd(result.financialImpact.low)} – ${formatUsd(result.financialImpact.high)}`}
                  />
                  <Stat
                    label="Retained by practice"
                    value={formatUsd(result.retainedImpact.expected)}
                    hint={`${formatUsd(result.retainedImpact.low)} – ${formatUsd(result.retainedImpact.high)}`}
                  />
                  <Stat
                    label="Net premium / year"
                    value={formatUsd(result.dynamic?.premiumAnnualNet ?? 0)}
                    hint={`−${result.dynamic?.discountPctApplied ?? 0}% control credits`}
                  />
                  <Stat
                    label="Annual cost of risk"
                    value={formatUsd(result.dynamic?.expectedAnnualCostOfRisk ?? 0)}
                    hint="Premium + annualized retained EL"
                  />
                </div>

                {result.dynamic && (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="primary">
                      Likelihood ×{result.dynamic.likelihoodMultiplier.toFixed(2)}
                    </Badge>
                    <Badge variant="warn">
                      Severity ×{result.dynamic.grossSeverityMultiplier.toFixed(2)}
                    </Badge>
                    <Badge variant="default">
                      Detection lag ×{result.dynamic.detectionLagMultiplier.toFixed(2)}
                    </Badge>
                    <Badge variant="ok">
                      Transferred {formatUsd(result.dynamic.transferredExpected)}
                    </Badge>
                  </div>
                )}

                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-elevated)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelFormatter={(d) => `Day ${d}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="risk"
                        stroke="var(--color-primary)"
                        fill="url(#riskFill)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <p className="text-xs font-medium tracking-wide text-subtle uppercase">
                    Cascade across Matrix layers
                  </p>
                  <ul className="mt-2 space-y-2">
                    {result.cascade.map((c) => (
                      <li
                        key={c.layer}
                        className="flex gap-3 rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                      >
                        <Badge variant="primary">{LAYER_META[c.layer].name}</Badge>
                        <span className="text-muted">{c.effect}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setView("variables")}>
                    <SlidersHorizontal className="size-3.5" />
                    Tune variables
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setView("cascades")}>
                    <GitBranch className="size-3.5" />
                    Cross-variable cascades
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setView("compare")}>
                    <GitCompare className="size-3.5" />
                    Compare futures
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Staff composition</CardTitle>
                  <CardDescription>Synced to practice profile · feeds residual + cascades</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SliderRow
                    label="Team size"
                    value={staff.teamSize}
                    min={2}
                    max={20}
                    onChange={(v) => updateStaff({ ...staff, teamSize: v })}
                  />
                  <SliderRow
                    label="Sole-owner knowledge items"
                    value={staff.soleOwnerKnowledgeCount}
                    min={0}
                    max={8}
                    onChange={(v) =>
                      updateStaff({ ...staff, soleOwnerKnowledgeCount: v })
                    }
                  />
                  <SliderRow
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
                    Dual control on payments
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
                    Independent bank reconciliation
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Crime / transfer notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted">
                    Exposure ~{Math.round(crimeFraudStats.industryEmbezzlementRate * 100)}% ·
                    median detect {crimeFraudStats.medianDetectionDays}d · mid loss{" "}
                    {formatUsd(crimeFraudStats.typicalLossMid)}
                  </p>
                  <ul className="space-y-1 text-xs text-muted">
                    {result.crimeModifiers.map((m) => (
                      <li key={m}>· {m}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Mitigations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {scenario.mitigations.map((m) => {
                  const on = mitigations.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMitigation(m.id)}
                      className={
                        on
                          ? "rounded-xl border border-ok/40 bg-ok/10 p-4 text-left"
                          : "rounded-xl border border-border bg-elevated p-4 text-left hover:border-border-strong"
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={on ? "ok" : "default"}>{m.effort} effort</Badge>
                        <span className="text-xs tabular text-muted">
                          −{Math.round(m.riskReduction * 100)}% risk
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{m.label}</p>
                      <p className="mt-1 text-xs text-subtle">
                        Annual cost {m.costAnnual ? formatUsd(m.costAnnual) : "in-house"}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 rounded-lg border border-border bg-panel p-3 text-sm text-muted">
                {result.residualIfNothing}
              </p>
              <div className="mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setMitigations([]);
                    updateStaff({ ...profile.staff });
                    updateRiskVars({
                      ...DEFAULT_RISK_VARIABLES,
                      ...profile.riskVariables,
                    });
                  }}
                >
                  Reset mitigations
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Outcome({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <p className="text-[11px] text-subtle">{label}</p>
      <p className="text-lg font-semibold tabular">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <p className="text-[11px] tracking-wide text-subtle uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function SliderRow({
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
      <div className="mb-1 flex justify-between gap-2">
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
