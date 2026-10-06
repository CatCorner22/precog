import { useMemo, useState } from "react";
import { Columns2, GitCompare, Trophy } from "lucide-react";
import type { ScenarioTemplate } from "@/lib/precog/types";
import {
  insuranceBasis,
  insuranceFigureNote,
  NOT_INSURED_HINT,
  scenarioFlags,
  type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import { usePracticeState, useTemplate } from "@/lib/precog/practice-context";
import {
  MAKE_SCENARIO_YOURS,
  confirmedScenarioIds,
  isOwnBusiness,
  starterScenarioLabel,
  withOwnScenarioWording,
} from "@/lib/precog/scoring/scope";
import {
  COMPARE_PALETTE,
  compareScenarioFutures,
  compareScenarios,
  type CompareReport,
} from "@/lib/precog/scoring/scenario-compare";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import { count, verb } from "@/lib/precog/text";
import { ILLUSTRATIVE_LABEL } from "@/lib/precog/scoring/scenario-level";
import { deltaTone, formatDaysChange, formatMoneyChange, pickScenario } from "./scenario-page";
import { FigureTile } from "./figure-tile";
import { StaffWhatIfCard, type StaffWhatIf } from "./staff-what-if";

type Mode = "futures" | "cross";

/** Most scenarios compared side by side. */
const MAX_CROSS = 4;

/**
 * Compare what-ifs: the options for one scenario side by side, or several
 * scenarios under the same staffing and insurance. The staffing is the
 * scenario page's what-if, shared with One scenario.
 */
export function ScenarioCompare({
  initialScenarioId,
  staffWhatIf,
  riskVariables,
}: {
  initialScenarioId: string;
  staffWhatIf: StaffWhatIf;
  riskVariables: RiskVariableState;
}) {
  const baseTpl = useTemplate();
  const tpl = withOwnScenarioWording(baseTpl);
  const ownBusiness = isOwnBusiness(baseTpl);
  const { profile } = usePracticeState();
  const confirmed = useMemo(
    () => confirmedScenarioIds(profile.decisions, profile.industry),
    [profile.decisions, profile.industry],
  );
  const noPolicy = insuranceBasis(riskVariables, ownBusiness) === "none";
  const policyNote = insuranceFigureNote(riskVariables, ownBusiness);
  const { scenarios } = tpl;
  const staff = staffWhatIf.staff;
  const [mode, setMode] = useState<Mode>("futures");
  const [focusPick, setFocusPick] = useState(initialScenarioId);
  const [crossPick, setCrossPick] = useState<string[]>(() =>
    scenarios.slice(0, 3).map((s) => s.id),
  );
  const [packageMits, setPackageMits] = useState<string[]>([]);
  const [crossMits, setCrossMits] = useState<Record<string, string[]>>({});

  // Picks belong to a template; ids the current template lacks drop out here
  // rather than in an effect, so no render ever runs with a stale id.
  const focusScenario = pickScenario(scenarios, focusPick);
  const selectedScenarios = useMemo(() => {
    const valid = crossPick.filter((id) => scenarios.some((s) => s.id === id));
    return valid.length > 0 ? valid : scenarios.slice(0, 3).map((s) => s.id);
  }, [crossPick, scenarios]);

  const report: CompareReport = useMemo(() => {
    if (mode === "futures") {
      return compareScenarioFutures(tpl, focusScenario.id, staff, packageMits, riskVariables);
    }
    return compareScenarios(tpl, selectedScenarios, staff, crossMits, riskVariables);
  }, [
    tpl,
    mode,
    focusScenario.id,
    staff,
    packageMits,
    selectedScenarios,
    crossMits,
    riskVariables,
  ]);

  function toggleScenario(id: string) {
    setCrossPick(
      selectedScenarios.includes(id)
        ? selectedScenarios.filter((x) => x !== id)
        : [...selectedScenarios, id],
    );
  }

  function togglePackageMit(id: string) {
    setPackageMits((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleCrossMit(scenarioId: string, mitId: string) {
    setCrossMits((prev) => {
      const cur = prev[scenarioId] ?? [];
      const next = cur.includes(mitId) ? cur.filter((x) => x !== mitId) : [...cur, mitId];
      return { ...prev, [scenarioId]: next };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Compare what">
        <Button
          size="sm"
          variant={mode === "futures" ? "default" : "secondary"}
          aria-pressed={mode === "futures"}
          onClick={() => setMode("futures")}
        >
          <GitCompare className="size-3.5" />
          Options for one scenario
        </Button>
        <Button
          size="sm"
          variant={mode === "cross" ? "default" : "secondary"}
          aria-pressed={mode === "cross"}
          onClick={() => setMode("cross")}
        >
          <Columns2 className="size-3.5" />
          Several scenarios side by side
        </Button>
      </div>

      {mode === "futures" ? (
        <FuturesPicker
          scenarios={scenarios}
          focus={focusScenario}
          onFocus={(id) => {
            setFocusPick(id);
            setPackageMits([]);
          }}
          packageMits={packageMits}
          onTogglePackageMit={togglePackageMit}
        />
      ) : (
        <CrossPicker
          scenarios={scenarios}
          selected={selectedScenarios}
          onToggleScenario={toggleScenario}
          crossMits={crossMits}
          onToggleCrossMit={toggleCrossMit}
        />
      )}

      <StaffWhatIfCard {...staffWhatIf} />

      {ownBusiness && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-muted">
          <span className="font-medium text-warn">{starterScenarioLabel(profile.industry)}.</span>{" "}
          {confirmed.size > 0
            ? `${confirmed.size} of them ${verb(confirmed.size, "is", "are")} yours; the rest are the sample's assumptions.`
            : "Their losses and timelines are the sample's assumptions, not facts about your business."}{" "}
          {MAKE_SCENARIO_YOURS}
        </p>
      )}

      {report.columns.length > 0 && (
        <CompareResults report={report} noPolicy={noPolicy} policyNote={policyNote} />
      )}
    </div>
  );
}

function FuturesPicker({
  scenarios,
  focus,
  onFocus,
  packageMits,
  onTogglePackageMit,
}: {
  scenarios: readonly ScenarioTemplate[];
  focus: ScenarioTemplate;
  onFocus: (id: string) => void;
  packageMits: readonly string[];
  onTogglePackageMit: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Scenario to test</CardTitle>
        <CardDescription>
          Each option runs with your current settings and insurance. {ILLUSTRATIVE_LABEL}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Scenario to test">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={focus.id === s.id}
              onClick={() => onFocus(s.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                focus.id === s.id
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
            Combine controls into one extra option
          </p>
          <div className="flex flex-wrap gap-2">
            {focus.mitigations.map((m) => {
              const on = packageMits.includes(m.id);
              return (
                <MitigationChip
                  key={m.id}
                  label={m.label}
                  on={on}
                  onClick={() => onTogglePackageMit(m.id)}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CrossPicker({
  scenarios,
  selected,
  onToggleScenario,
  crossMits,
  onToggleCrossMit,
}: {
  scenarios: readonly ScenarioTemplate[];
  selected: readonly string[];
  onToggleScenario: (id: string) => void;
  crossMits: Record<string, string[]>;
  onToggleCrossMit: (scenarioId: string, mitId: string) => void;
}) {
  const full = selected.length >= MAX_CROSS;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Scenarios to compare (up to {MAX_CROSS})</CardTitle>
        <CardDescription>
          Every column uses the same staffing and insurance; add controls to any scenario.
          {full ? ` Untick one to compare another.` : ""} {ILLUSTRATIVE_LABEL}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {scenarios.map((s) => {
            const on = selected.includes(s.id);
            // The last ticked scenario stays, and a fifth cannot be added.
            const locked = on ? selected.length <= 1 : full;
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-xl border p-3",
                  on ? "border-primary/40 bg-primary/5" : "border-border bg-elevated",
                )}
              >
                <label
                  className={cn(
                    "flex items-start gap-2 text-sm",
                    locked ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={() => onToggleScenario(s.id)}
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
                    {s.mitigations.map((m) => (
                      <MitigationChip
                        key={m.id}
                        label={m.label}
                        on={(crossMits[s.id] ?? []).includes(m.id)}
                        onClick={() => onToggleCrossMit(s.id, m.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CompareResults({
  report,
  noPolicy,
  policyNote,
}: {
  report: CompareReport;
  noPolicy: boolean;
  policyNote: string | null;
}) {
  const deltaMap = new Map(report.deltas.map((d) => [d.columnId, d]));
  const retained = (c: CompareReport["columns"][number]) =>
    c.result.retainedImpact?.expected ?? c.result.financialImpact.expected;
  const labelOf = (id: string) => report.columns.find((c) => c.id === id)?.label;
  // When every option retains the same amount, a "lowest" title would rest
  // only on the hidden tie-break, so none is shown.
  const allTie =
    report.columns.length > 1 &&
    report.columns.every(
      (c) => Math.round(retained(c)) === Math.round(retained(report.columns[0])),
    );
  const retainedWinner = allTie ? undefined : labelOf(report.winnerByRetained);

  return (
    <>
      {allTie ? (
        <p className="rounded-lg border border-border bg-panel p-3 text-sm text-muted">
          With {noPolicy ? "no policy" : "these insurance settings"} every option retains the same{" "}
          {formatUsd(retained(report.columns[0]))}; they differ only in assumed loss if it happens.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <WinnerChip icon label="Lowest assumed retained loss" value={retainedWinner ?? "—"} />
          </div>
          <p className="text-xs text-subtle">
            {report.mode === "futures"
              ? "Do nothing is the baseline and never counts as the lowest; a tie on retained loss goes to the lower assumed loss if it happens."
              : "A tie on retained loss goes to the lower assumed loss if it happens."}
            {policyNote ? ` Retained loss and cost of risk: ${policyNote}.` : ""}
          </p>
        </>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {report.columns.map((col, i) => {
          const d = deltaMap.get(col.id);
          const isBase = col.id === report.baselineId;
          const isWinner = !allTie && col.id === report.winnerByRetained;
          const dynamic = col.result.dynamic;
          return (
            <Card key={col.id} className={cn(isWinner && "border-ok/40 glow-primary")}>
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
                      Lowest retained loss
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-sm leading-snug">{col.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <FigureTile
                  size="sm"
                  className="border-0 bg-transparent p-0"
                  label="Assumed loss if it happens"
                  value={formatUsd(col.result.financialImpact.expected)}
                  hint={`assumed range ${formatUsd(col.result.financialImpact.low)} – ${formatUsd(col.result.financialImpact.high)}`}
                />
                <FigureTile
                  size="sm"
                  className="border-0 bg-transparent p-0"
                  label="Assumed retained loss"
                  value={formatUsd(retained(col))}
                  hint={
                    scenarioFlags(col.result.scenarioId).fraudRelated
                      ? withNote(
                          noPolicy
                            ? "all of it"
                            : dynamic
                              ? `paid by insurance ${formatUsd(dynamic.transferredExpected)}`
                              : "after deductible and limit",
                          policyNote,
                        )
                      : NOT_INSURED_HINT
                  }
                />
                <FigureTile
                  size="sm"
                  className="border-0 bg-transparent p-0"
                  label="Assumed days until found"
                  value={`about ${col.result.timelineDays.p50} days`}
                  hint={`assumed range ${col.result.timelineDays.p95Low}–${col.result.timelineDays.p95High} days`}
                />
                {!isBase && d && (
                  <div className="rounded-lg border border-border bg-elevated px-2 py-2 text-xs">
                    <p className="text-subtle">Against the baseline</p>
                    <p
                      className={cn(
                        "mt-1 font-medium",
                        TONE[deltaTone(d.vsBaseline.retainedDelta)],
                      )}
                    >
                      Assumed retained loss {formatMoneyChange(d.vsBaseline.retainedDelta)}
                    </p>
                    <p className={TONE[deltaTone(d.vsBaseline.p50DaysDelta)]}>
                      Assumed days until found {formatDaysChange(d.vsBaseline.p50DaysDelta)}
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
          <CardTitle className="text-base">Comparison table</CardTitle>
          <CardDescription>
            Assumed loss if it happens and assumed retained loss for{" "}
            {count(report.columns.length, "option")}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-subtle">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Option
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Assumed loss if it happens
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Assumed retained loss
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Assumed days until found
                </th>
                <th scope="col" className="py-2 font-medium">
                  Change in retained loss
                </th>
              </tr>
            </thead>
            <tbody>
              {report.columns.map((c) => {
                const d = deltaMap.get(c.id);
                return (
                  <tr key={c.id} className="border-b border-border/70">
                    <th scope="row" className="py-2.5 pr-3 font-medium">
                      {c.label}
                      {!allTie && c.id === report.winnerByRetained && (
                        <>
                          {" "}
                          <Badge variant="ok" className="ml-1">
                            lowest retained loss
                          </Badge>
                        </>
                      )}
                    </th>
                    <td className="py-2.5 pr-3 tabular">
                      {formatUsd(c.result.financialImpact.expected)}
                    </td>
                    <td className="py-2.5 pr-3 tabular">{formatUsd(retained(c))}</td>
                    <td className="py-2.5 pr-3 tabular">about {c.result.timelineDays.p50} days</td>
                    <td
                      className={cn(
                        "py-2.5 tabular",
                        d && TONE[deltaTone(d.vsBaseline.retainedDelta)],
                      )}
                    >
                      {c.id === report.baselineId || !d
                        ? "—"
                        : formatMoneyChange(d.vsBaseline.retainedDelta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function MitigationChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-left text-xs",
        on ? "border-ok/40 bg-ok/10 text-ok" : "border-border bg-elevated text-muted",
      )}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

function WinnerChip({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <p className="text-xs tracking-wide text-subtle uppercase">{label}</p>
      <p className="mt-0.5 max-w-[280px] truncate text-sm font-medium" title={value}>
        {icon && <Trophy className="mr-1 inline size-3.5 text-ok" />}
        {value}
      </p>
    </div>
  );
}

function withNote(text: string, note: string | null) {
  return note ? `${text} · ${note}` : text;
}

const TONE = { ok: "text-ok", danger: "text-danger", muted: "text-muted" } as const;
