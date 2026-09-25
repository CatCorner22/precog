import { useEffect, useMemo, useState } from "react";
import { LAYER_META } from "@/lib/precog/templates/layer-meta";
import { useTemplate } from "@/lib/precog/use-template";
import { runPrecogScenario } from "@/lib/precog/engine";
import type { StaffComposition } from "@/lib/precog/types";
import {
  DEFAULT_RISK_VARIABLES,
  assumedAnnualFrequency,
  insuranceBasis,
  insuranceFigureNote,
  type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import {
  confirmedScenarioIds,
  isOwnBusiness,
  starterScenarioLabel,
  withOwnScenarioWording,
} from "@/lib/precog/scoring/scope";
import { industryMeta } from "@/lib/precog/industry";
import { usePractice } from "@/lib/precog/practice-context";
import { CascadePanel } from "@/components/precog/cascade-panel";
import { DynamicVariablesPanel } from "@/components/precog/dynamic-variables-panel";
import { ScenarioCompare } from "@/components/precog/scenario-compare";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import { CONFLICT_RULES } from "@/lib/precog/sod/conflict-rules";
import { casesForSodRules, observedLossRange } from "@/lib/precog/evidence";
import { CaseCard } from "@/components/precog/case-card";
import { CheckCircle2, GitBranch, GitCompare, LineChart, SlidersHorizontal } from "lucide-react";
import { dateAfter } from "@/lib/precog/decisions/follow-through";

export function ScenarioRunner({ initialScenarioId }: { initialScenarioId?: string | null }) {
  const baseTpl = useTemplate();
  // The owner's own business reads the starter scenarios in role words, not
  // the sample team's names; ids and figures are unchanged.
  const tpl = withOwnScenarioWording(baseTpl);
  const ownBusiness = isOwnBusiness(baseTpl);
  const {
    profile,
    setStaff: setProfileStaff,
    setRiskVariables: setProfileRisk,
    addDecision,
  } = usePractice();
  const confirmed = useMemo(
    () => confirmedScenarioIds(profile.decisions, profile.industry),
    [profile.decisions, profile.industry],
  );
  const teamLabel = industryMeta(profile.industry).teamLabel;
  const [view, setView] = useState<"single" | "compare" | "variables" | "cascades">("single");
  const [scenarioId, setScenarioId] = useState(
    initialScenarioId && tpl.scenarios.some((s) => s.id === initialScenarioId)
      ? initialScenarioId
      : tpl.scenarios[0].id,
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
    if (initialScenarioId && tpl.scenarios.some((s) => s.id === initialScenarioId)) {
      setScenarioId(initialScenarioId);
      setMitigations([]);
    }
  }, [initialScenarioId, tpl.scenarios]);

  // Scenario picks belong to a template; when the template changes, start over.
  useEffect(() => {
    if (!tpl.scenarios.some((s) => s.id === scenarioId)) {
      setScenarioId(tpl.scenarios[0].id);
      setMitigations([]);
    }
  }, [tpl.scenarios, scenarioId]);

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

  const scenario = tpl.scenarios.find((s) => s.id === scenarioId) ?? tpl.scenarios[0];
  const scenarioIsStarter = ownBusiness && !confirmed.has(scenario.id);
  const basis = insuranceBasis(riskVars, ownBusiness);
  const policyNote = insuranceFigureNote(riskVars, ownBusiness, scenario.id);
  const withPolicyNote = (text: string) => (policyNote ? `${text} · ${policyNote}` : text);

  function confirmScenario() {
    addDecision({
      subject: `Scenario: ${scenario.title}`,
      kind: "monitor",
      note: "Confirmed this starter scenario could happen here. Its losses and timelines are still the example's assumptions; review them against your own figures.",
      reviewBy: dateAfter(new Date(), 90),
      linkedTab: "precog",
      linkedId: scenario.id,
    });
  }

  /**
   * The prosecuted cases behind this scenario.
   *
   * A scenario's figures are assumptions. The duty conflicts it models are
   * not: each conflict rule that links to this scenario has real cases behind
   * it, so the page can put the assumption next to what the same failure
   * cost somewhere real. Scenarios no rule links to (a key person leaving)
   * get no case list rather than a loosely related one.
   */
  const realCases = useMemo(() => {
    const ruleIds = CONFLICT_RULES.filter((r) => r.linkedScenarioId === scenario.id).map(
      (r) => r.id,
    );
    const cases = ruleIds.length ? casesForSodRules(ruleIds) : [];
    return { cases, lossRange: observedLossRange(cases) };
  }, [scenario.id]);
  const result = useMemo(
    () =>
      runPrecogScenario(tpl, scenarioId, {
        mitigationIds: mitigations,
        staff,
        riskVariables: riskVars,
      }),
    [tpl, scenarioId, mitigations, staff, riskVars],
  );

  function toggleMitigation(id: string) {
    setMitigations((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
            {tpl.scenarios.map((s) => (
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
            ownBusiness={ownBusiness}
          />
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live outcome</CardTitle>
                <CardDescription>{scenario.title}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Outcome
                  label="Assumed days until found"
                  value={`~${result.timelineDays.p50}d`}
                  sub={`assumed range ${result.timelineDays.p95Low}–${result.timelineDays.p95High}d`}
                />
                <Outcome
                  label="Assumed loss if it happens"
                  value={formatUsd(result.financialImpact.expected)}
                  sub="before insurance"
                />
                <Outcome
                  label="Assumed retained loss"
                  value={formatUsd(result.retainedImpact.expected)}
                  sub={
                    basis === "none"
                      ? withPolicyNote("all of it")
                      : withPolicyNote("after deductible / limit")
                  }
                />
                <Outcome
                  label="Annual cost of risk"
                  value={formatUsd(result.dynamic?.expectedAnnualCostOfRisk ?? 0)}
                  sub={withPolicyNote(
                    costOfRiskHint(result.dynamic?.likelihoodMultiplier ?? 1, basis === "none"),
                  )}
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
          {ownBusiness && (
            <div className="rounded-lg border border-warn/40 bg-warn/5 p-4">
              <p className="text-sm font-medium text-warn">
                {starterScenarioLabel(profile.industry)}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                These scenarios come with the example business. Their losses and timelines are the
                example&rsquo;s assumptions, not facts about your business, so they stay out of the
                threat index and your totals until you pick one and choose &ldquo;This could happen
                here&rdquo;.
              </p>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tpl.scenarios.map((s) => (
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
                {ownBusiness && (
                  <Badge variant={confirmed.has(s.id) ? "ok" : "default"} className="mb-2">
                    {confirmed.has(s.id) ? "Yours" : "Starter"}
                  </Badge>
                )}
                <p className="text-sm font-semibold leading-snug">{s.title}</p>
                <p className="mt-2 line-clamp-2 text-xs text-muted">{s.description}</p>
              </button>
            ))}
          </div>

          {scenarioIsStarter && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel p-3 text-sm">
              <p className="max-w-2xl text-muted">
                &ldquo;{scenario.title}&rdquo; is a starter scenario from the example. If it could
                happen in your business, make it yours: it is logged in your Decisions log with a
                review date and starts counting in the threat index and your totals.
              </p>
              <Button size="sm" onClick={confirmScenario}>
                <CheckCircle2 className="size-3.5" />
                This could happen here
              </Button>
            </div>
          )}

          {realCases.cases.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What this looked like somewhere real</CardTitle>
                <CardDescription>
                  {realCases.cases.length} prosecuted{" "}
                  {realCases.cases.length === 1 ? "case involves" : "cases involve"} the duty
                  conflicts this scenario models
                  {realCases.lossRange
                    ? `; median stated loss ${formatUsd(realCases.lossRange.median)}, from ${formatUsd(realCases.lossRange.low)} to ${formatUsd(realCases.lossRange.high)}`
                    : ""}
                  . The assumed figures below are not drawn from these cases; the cases are what the
                  same failure cost other organizations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {realCases.cases.slice(0, 3).map((c) => (
                  <CaseCard key={c.id} study={c} />
                ))}
                {realCases.cases.length > 3 && (
                  <p className="text-xs text-subtle">
                    {realCases.cases.length - 3} more on Start here, under &ldquo;Every case behind
                    this page&rdquo;.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>What this scenario assumes</CardTitle>
                <CardDescription>
                  Change a staffing, detection, or insurance setting and the assumed figures move
                  with it
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="rounded-lg border border-border bg-panel p-3 text-xs leading-relaxed text-muted">
                  These figures are assumptions written into this scenario, scaled by your settings.
                  They are not predictions and were not measured at any business. For what failures
                  like this one actually cost, see the prosecuted cases on Start here.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Stat
                    label="Assumed days until found"
                    value={`about ${result.timelineDays.p50} days`}
                    hint={`assumed range ${result.timelineDays.p95Low}–${result.timelineDays.p95High} days`}
                  />
                  <Stat
                    label="Basis of these figures"
                    value="Assumption"
                    hint={result.confidenceLabel}
                  />
                  <Stat
                    label="Assumed loss if it happens"
                    value={formatUsd(result.financialImpact.expected)}
                    hint={`assumed range ${formatUsd(result.financialImpact.low)} – ${formatUsd(result.financialImpact.high)}`}
                  />
                  <Stat
                    label={`Assumed loss retained by ${teamLabel}`}
                    value={formatUsd(result.retainedImpact.expected)}
                    hint={withPolicyNote(
                      basis === "none"
                        ? "all of the assumed loss"
                        : `assumed range ${formatUsd(result.retainedImpact.low)} – ${formatUsd(result.retainedImpact.high)}`,
                    )}
                  />
                  <Stat
                    label="Net premium / year"
                    value={formatUsd(result.dynamic?.premiumAnnualNet ?? 0)}
                    hint={withPolicyNote(
                      basis === "none"
                        ? "no premium"
                        : `−${result.dynamic?.discountPctApplied ?? 0}% control credits`,
                    )}
                  />
                  <Stat
                    label="Annual cost of risk"
                    value={formatUsd(result.dynamic?.expectedAnnualCostOfRisk ?? 0)}
                    hint={withPolicyNote(
                      costOfRiskHint(result.dynamic?.likelihoodMultiplier ?? 1, basis === "none"),
                    )}
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
                  <CardDescription>
                    Synced to business profile · feeds residual + cascades
                  </CardDescription>
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
                    onChange={(v) => updateStaff({ ...staff, soleOwnerKnowledgeCount: v })}
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
                    For comparison, across investigated cases in the ACFE&rsquo;s 2026 study: median
                    time to detection {tpl.crimeFraudStats.medianDetectionMonths} months; median
                    loss at organizations under 100 staff{" "}
                    {formatUsd(tpl.crimeFraudStats.medianLossSmallOrgUsd)}. Those describe other
                    organizations, not this scenario.{" "}
                    <a
                      href={tpl.crimeFraudStats.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary hover:underline"
                    >
                      Source
                    </a>
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
                        <span className="text-xs text-muted">
                          {reductionPhrase(m.riskReduction)}
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

/** How the annual cost-of-risk figure is built, with the assumed yearly chance named. */
function costOfRiskHint(likelihoodMultiplier: number, noPolicy: boolean): string {
  const pct = `${(assumedAnnualFrequency(likelihoodMultiplier) * 100).toFixed(1)}%`;
  return noPolicy
    ? `retained loss × assumed ${pct} chance a year`
    : `premium + retained loss × assumed ${pct} chance a year`;
}

/**
 * A mitigation's riskReduction is a coefficient the scenario author set, not a
 * measured effect, so it is shown as a size rather than a percentage.
 */
function reductionPhrase(r: number): string {
  const size = r >= 0.6 ? "large" : r >= 0.4 ? "moderate" : "modest";
  return `${size} assumed reduction`;
}

function Outcome({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <p className="text-xs text-subtle">{label}</p>
      <p className="text-lg font-semibold tabular">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <p className="text-xs tracking-wide text-subtle uppercase">{label}</p>
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
