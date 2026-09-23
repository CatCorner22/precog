import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import {
  CASCADE_LEVERS,
  leverAffects,
  leverUnavailableReason,
  simulateAllCascades,
  simulateCascadeLever,
  type CascadeLeverId,
} from "@/lib/precog/scoring/variable-cascade";
import { insuranceFigureNote } from "@/lib/precog/scoring/dynamic-variables";
import { isOwnBusiness } from "@/lib/precog/scoring/scope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd, cn } from "@/lib/utils";
import { GitBranch } from "lucide-react";

export function CascadePanel() {
  const { profile, template } = usePractice();
  const [leverId, setLeverId] = useState<CascadeLeverId>("enable_dual_control");

  const all = useMemo(
    () => simulateAllCascades(template, profile.riskVariables, profile.staff),
    [template, profile.riskVariables, profile.staff],
  );

  const selected = useMemo(
    () =>
      simulateCascadeLever(template, leverId, profile.riskVariables, profile.staff, all.scenarioId),
    [template, leverId, profile.riskVariables, profile.staff, all.scenarioId],
  );
  const waiting = CASCADE_LEVERS.filter((l) => leverUnavailableReason(l.id, profile.riskVariables));
  const policyNote = insuranceFigureNote(profile.riskVariables, isOwnBusiness(template));

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="accent">Cross-variable cascades</Badge>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <GitBranch className="size-5 text-primary" />
          Change one thing — see what else moves
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Dual control is not only a SoD fix. It also cuts likelihood, shrinks scheme size and
          changes the annual cost of risk, and on a policy you entered it can earn the credit your
          carrier quotes. The coach uses this same engine.
        </p>
        {policyNote && (
          <p className="mt-2 max-w-2xl text-xs text-subtle">
            Insurance figures here: {policyNote}.
          </p>
        )}
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
              {waiting.map((l) => l.label).join(", ")}: not modelled until you enter your policy on
              Dynamic variables, so they are not ranked.
            </p>
          )}
          {all.rankedByCor.slice(0, 8).map((s) => {
            const dCor = s.after.expectedAnnualCostOfRisk - s.before.expectedAnnualCostOfRisk;
            const active = s.lever.id === leverId;
            return (
              <button
                key={s.lever.id}
                type="button"
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
                    dCor < 0 ? "text-ok" : dCor > 0 ? "text-danger" : "text-muted",
                  )}
                >
                  Cost of risk {dCor > 0 ? "+" : dCor < 0 ? "−" : ""}
                  {formatUsd(Math.abs(dCor))}
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
                  "expectedAnnualCostOfRisk",
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
                  <p className="text-[10px] tracking-wide text-subtle uppercase">{d.label}</p>
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
                    {d.direction}{" "}
                    {d.key === "timelineP50"
                      ? `${Math.abs(Math.round(d.delta))} ${d.delta < 0 ? "fewer" : "more"} days`
                      : d.key.includes("Multiplier") || d.key === "residualAverage"
                        ? d.delta.toFixed(2)
                        : d.key.includes("discount")
                          ? d.delta.toFixed(0)
                          : formatUsd(Math.abs(d.delta))}
                  </Badge>
                </div>
              ))}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">
              Second-order notes
            </p>
            <ul className="space-y-1.5 text-sm text-muted">
              {selected.secondOrderNotes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">
              Dependency spine
            </p>
            <div className="flex flex-wrap gap-2">
              {all.dependencyMap.slice(0, 10).map((d) => (
                <span
                  key={`${d.from}-${d.to}-${d.effect}`}
                  className="rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] text-muted"
                >
                  {d.from} → {d.to}: {d.effect}
                </span>
              ))}
            </div>
          </div>

          <details className="text-xs text-subtle">
            <summary className="cursor-pointer text-muted">All levers in catalog</summary>
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

function formatMetric(key: string, n: number): string {
  if (
    key.includes("Expected") ||
    key.includes("premium") ||
    key.includes("Cost") ||
    key.includes("Premium")
  ) {
    return formatUsd(n);
  }
  if (key.includes("Multiplier") || key === "residualAverage") {
    return n.toFixed(2);
  }
  if (key.includes("timeline") || key.includes("discount") || key.includes("Critical")) {
    return String(Math.round(n * 10) / 10);
  }
  return String(n);
}
