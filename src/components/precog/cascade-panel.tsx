import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import {
  CASCADE_LEVERS,
  leverAffects,
  leverUnavailableReason,
  simulateAllCascades,
  simulateCascadeLever,
  type CascadeLeverId,
  type MetricSnapshot,
} from "@/lib/precog/scoring/variable-cascade";
import { insuranceFigureNote } from "@/lib/precog/scoring/dynamic-variables";
import { confirmedScenarioIds, isOwnBusiness } from "@/lib/precog/scoring/scope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEstimateUsd, formatEstimateUsdDelta, formatUsd, cn } from "@/lib/utils";
import { GitBranch } from "lucide-react";

export function CascadePanel() {
  const { profile, template } = usePractice();
  const [leverId, setLeverId] = useState<CascadeLeverId>("enable_dual_control");
  const confirmed = useMemo(
    () => confirmedScenarioIds(profile.decisions, profile.industry),
    [profile.decisions, profile.industry],
  );
  const scope = useMemo(() => ({ confirmedScenarioIds: confirmed }), [confirmed]);

  const all = useMemo(
    () => simulateAllCascades(template, profile.riskVariables, profile.staff, undefined, scope),
    [template, profile.riskVariables, profile.staff, scope],
  );

  const selected = useMemo(
    () =>
      simulateCascadeLever(
        template,
        leverId,
        profile.riskVariables,
        profile.staff,
        all.scenarioId,
        scope,
      ),
    [template, leverId, profile.riskVariables, profile.staff, all.scenarioId, scope],
  );
  const waiting = CASCADE_LEVERS.filter((l) => leverUnavailableReason(l.id, profile.riskVariables));
  const policyNote = insuranceFigureNote(
    profile.riskVariables,
    isOwnBusiness(template),
    all.scenarioId,
  );

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="accent">What else moves</Badge>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <GitBranch className="size-5 text-primary" />
          Change one thing — see what else moves
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Dual release does more than separate duties: it also cuts likelihood, shrinks scheme size
          and changes the annual cost of risk, and on a policy you entered it can earn the credit
          your carrier quotes. Pioneer uses this same engine.
        </p>
        {policyNote && (
          <p className="mt-2 max-w-2xl text-xs text-subtle">
            Insurance figures here: {policyNote}.
          </p>
        )}
        {all.scopeNote && <p className="mt-2 max-w-2xl text-xs text-subtle">{all.scopeNote}</p>}
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pick a lever</CardTitle>
          <CardDescription>
            Ranked by annual cost-of-risk improvement under your saved profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {waiting.length > 0 && (
            <p className="rounded-lg border border-dashed border-border bg-panel/60 px-3 py-2 text-xs text-muted">
              {waiting.map((l) => l.label).join(", ")}: not modeled until you enter your policy on
              Settings and insurance, so Precog does not rank them.
            </p>
          )}
          {all.rankedByCor.slice(0, 8).map((s) => {
            const dRet = s.after.retainedExpected - s.before.retainedExpected;
            const active = s.lever.id === leverId;
            return (
              <button
                key={s.lever.id}
                type="button"
                aria-pressed={active}
                onClick={() => setLeverId(s.lever.id)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left sm:flex-row sm:items-center sm:justify-between",
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-elevated hover:border-border-strong",
                )}
              >
                <span>
                  <span className="font-medium">{s.lever.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {leverAffects(s.lever, profile.riskVariables).slice(0, 3).join(" · ")}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular",
                    dRet < 0 ? "text-ok" : dRet > 0 ? "text-danger" : "text-muted",
                  )}
                >
                  Retained loss {formatEstimateUsdDelta(dRet)}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{selected.lever.label}</CardTitle>
          <CardDescription>{selected.overallVerdict}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {selected.deltas
              .filter((d) =>
                [
                  "retainedExpected",
                  "premiumAnnualNet",
                  "residualAverage",
                  "likelihoodMultiplier",
                  "timelineP50",
                  "discountPctApplied",
                  "grossExpected",
                ].includes(d.key),
              )
              .map((d) => (
                <div
                  key={d.key}
                  className="rounded-lg border border-border bg-elevated p-3 text-sm"
                >
                  <p className="text-xs tracking-wide text-subtle uppercase">{d.label}</p>
                  <p className="mt-1 tabular">
                    {formatMetric(d.key, d.before)} →{" "}
                    <span className="font-semibold">{formatMetric(d.key, d.after)}</span>
                  </p>
                  <Badge
                    variant={
                      d.direction === "improves"
                        ? "ok"
                        : d.direction === "worsens"
                          ? "danger"
                          : "default"
                    }
                    className="mt-1"
                  >
                    {d.direction} {formatMetricChange(d.key, d.delta)}
                  </Badge>
                </div>
              ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">
              Knock-on effects
            </p>
            <ul className="space-y-1.5 text-sm text-muted">
              {selected.secondOrderNotes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">
              What depends on what
            </p>
            <div className="flex flex-wrap gap-2">
              {all.dependencyMap.slice(0, 10).map((d) => (
                <span
                  key={`${d.from}-${d.to}-${d.effect}`}
                  className="rounded-full border border-border bg-elevated px-2.5 py-1 text-xs text-muted"
                >
                  {d.from} → {d.to}: {d.effect}
                </span>
              ))}
            </div>
          </div>

          <details className="text-xs text-subtle">
            <summary className="cursor-pointer text-muted">Every lever</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {CASCADE_LEVERS.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="text-left text-muted hover:text-fg"
                    onClick={() => setLeverId(l.id)}
                  >
                    {l.label} — {leverAffects(l, profile.riskVariables).slice(0, 2).join("; ")}
                    {leverUnavailableReason(l.id, profile.riskVariables)
                      ? " (enter your policy first)"
                      : ""}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

/** "usd" is a premium the owner's terms set, printed exactly; "estimate" is scenario dollars, rounded. */
type MetricUnit = "usd" | "estimate" | "factor" | "index" | "pct" | "days" | "count";

/** How each snapshot figure reads; a new MetricSnapshot key must name its unit here. */
const METRIC_UNIT: Record<keyof MetricSnapshot, MetricUnit> = {
  likelihoodMultiplier: "factor",
  grossSeverityMultiplier: "factor",
  detectionLagMultiplier: "factor",
  grossExpected: "estimate",
  retainedExpected: "estimate",
  transferredExpected: "estimate",
  premiumAnnualNet: "usd",
  discountPctApplied: "pct",
  expectedAnnualCostOfRisk: "estimate",
  eventPlusPremiumExpected: "estimate",
  timelineP50: "days",
  residualAverage: "index",
  residualCriticalPath: "count",
};

function formatMetric(key: keyof MetricSnapshot, n: number): string {
  switch (METRIC_UNIT[key]) {
    case "usd":
      return formatUsd(n);
    case "estimate":
      return formatEstimateUsd(n);
    case "factor":
    case "index":
      return n.toFixed(2);
    default:
      return String(Math.round(n * 10) / 10);
  }
}

/** The size of a change, after the badge's "improves" / "worsens". */
function formatMetricChange(key: keyof MetricSnapshot, delta: number): string {
  switch (METRIC_UNIT[key]) {
    case "usd":
      return formatUsd(Math.abs(delta));
    case "estimate":
      return formatEstimateUsd(Math.abs(delta));
    case "factor":
    case "index":
      return delta.toFixed(2);
    case "pct":
      return delta.toFixed(0);
    case "days":
      return `${Math.abs(Math.round(delta))} ${delta < 0 ? "fewer" : "more"} days`;
    case "count":
      return String(Math.abs(Math.round(delta)));
  }
}
