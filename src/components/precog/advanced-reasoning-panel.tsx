import { useMemo } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { runAdvancedReasoning } from "@/lib/precog/llm/reasoning/engine";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import { Binary, GitBranch, Network, Search, Sparkles } from "lucide-react";

export function AdvancedReasoningPanel() {
  const { profile } = usePractice();
  const report = useMemo(
    () => runAdvancedReasoning(profile.staff, profile.riskVariables),
    [profile.staff, profile.riskVariables],
  );

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Advanced reasoning</Badge>
          <Badge variant="primary">{report.method.split(" + ").length} algorithms</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Sparkles className="size-5 text-primary" />
          Pioneer reasoning stack
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Bayesian posteriors, multi-hop causal paths, beam search over lever sequences,
          twin-world counterfactuals, and expected value of information. Educational decision
          math — not actuarial pricing.
        </p>
        <p className="mt-3 text-sm">
          Confidence:{" "}
          <span className="font-semibold">{report.confidence.score}</span>{" "}
          <span className="text-muted">({report.confidence.label})</span>
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Bayesian P(fail)"
          value={`${(report.bayesian.pFail * 100).toFixed(1)}%`}
          hint={`95% CI ${(report.bayesian.pFailCi.low * 100).toFixed(1)}–${(report.bayesian.pFailCi.high * 100).toFixed(1)}%`}
        />
        <Stat
          label="Bayesian EAL"
          value={formatUsd(report.bayesian.expectedAnnualLoss)}
          hint={`severity mean ${formatUsd(report.bayesian.severityMean)}`}
        />
        <Stat
          label="Beam residual"
          value={String(report.beam.residual)}
          hint={`utility ${report.beam.utility.toFixed(3)}`}
        />
        <Stat
          label="Beam CoR"
          value={formatUsd(report.beam.annualCor)}
          hint={report.beam.bestSequence || "status quo"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Binary className="size-4" />
            Bayesian updates
          </CardTitle>
          <CardDescription>
            Beta posterior on material control failure · lognormal severity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-muted">
            {report.bayesian.updates.map((u) => (
              <li key={u}>· {u}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="size-4" />
              Beam search frontier
            </CardTitle>
            <CardDescription>{report.beam.method}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.beam.frontier.map((f) => (
              <div
                key={f.sequence}
                className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{f.sequence}</span>
                  <Badge variant="primary">U {f.utility}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  residual {f.residual} · CoR {formatUsd(f.annualCor)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Twin-world counterfactuals
            </CardTitle>
            <CardDescription>
              Best twin: {report.counterfactual.bestIntervention}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.counterfactual.top.map((c) => (
              <div
                key={c.label}
                className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              >
                <p className="font-medium">{c.label}</p>
                <p className="mt-1 text-xs text-muted">{c.narrative}</p>
                <p className="mt-1 text-[11px] tabular text-subtle">
                  Δres {c.deltaResidual.toFixed(1)} · ΔCoR {formatUsd(c.deltaCor)} · ΔEAL{" "}
                  {formatUsd(c.deltaBayesEal)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="size-4" />
            Causal multi-hop → owner decision
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...report.causal]
            .sort((a, b) => Math.abs(b.netToDecision) - Math.abs(a.netToDecision))
            .map((c) => (
              <div
                key={c.intervention}
                className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{c.intervention}</Badge>
                  <span className="text-xs tabular text-muted">
                    net path score {c.netToDecision}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{c.topPath}</p>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-4" />
            Expected value of information
          </CardTitle>
          <CardDescription>
            Baseline EAL {formatUsd(report.evoi.baselineEal)} · measure high-EVOI items first
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.evoi.items.map((i) => (
            <div
              key={i.observation}
              className="flex flex-col gap-1 rounded-lg border border-border bg-elevated px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <span className="font-medium">{i.observation}</span>
                <span className="mt-0.5 block text-xs text-muted">{i.rationale}</span>
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="ok">{i.effort}</Badge>
                <span className="tabular font-semibold">{formatUsd(i.evoi)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Synthesis</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted">
            {report.synthesis.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm font-medium">
            Recommended sequence:{" "}
            {report.recommendedSequence.join(" → ") || "status quo"}
          </p>
        </CardContent>
      </Card>
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
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] tracking-wide text-subtle uppercase">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}
