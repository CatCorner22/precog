import { useMemo } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { runAdvancedReasoning } from "@/lib/precog/llm/reasoning/engine";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, Network, Search, Sparkles } from "lucide-react";

/**
 * Orders the control and insurance levers by how much they move this app's
 * own residual index and cost-of-risk figure.
 *
 * The engine behind this computes probabilities, intervals, expected losses,
 * and utilities. None of them is a measurement of the business — every one
 * rests on a weight this app chose — so the panel shows the order and the
 * reasons and withholds the decimals. An earlier version printed them as
 * "Bayesian P(fail) 41.3% (95% CI …)" and "EAL $…", which read as findings.
 */
export function AdvancedReasoningPanel() {
  const { profile, template } = usePractice();
  const report = useMemo(
    () => runAdvancedReasoning(template, profile.staff, profile.riskVariables),
    [template, profile.staff, profile.riskVariables],
  );
  const causal = [...report.causal].sort(
    (a, b) => Math.abs(b.netToDecision) - Math.abs(a.netToDecision),
  );

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Lever ordering</Badge>
          <Badge variant="primary">This app&rsquo;s model</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Sparkles className="size-5 text-primary" />
          Which lever first, and why
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          This page orders the control and insurance levers by how much they move this app&rsquo;s
          own residual index and cost-of-risk figure. Every number behind it is one of this
          app&rsquo;s weights, not a measurement of your business, so the order is worth reading and
          the decimals are not shown.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="size-4" />
            Suggested order
          </CardTitle>
          <CardDescription>
            Sequences the model compared, best first. Each entry names what it would switch on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.recommendedSequence.length > 0 ? (
            <ol className="space-y-1.5 text-sm">
              {report.recommendedSequence.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated font-mono text-xs text-muted">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">
              No lever improves on the current setup in this model.
            </p>
          )}
          {report.beam.frontier.length > 1 && (
            <div className="pt-2">
              <p className="text-xs font-medium tracking-wide text-subtle uppercase">
                Other sequences considered
              </p>
              <ul className="mt-1 space-y-1 text-xs text-muted">
                {report.beam.frontier.slice(1, 4).map((f) => (
                  <li key={f.sequence}>· {f.sequence || "status quo"}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">One lever at a time</CardTitle>
            <CardDescription>
              Each lever switched on alone, against the current setup. Best single lever:{" "}
              {report.counterfactual.bestIntervention}
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
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="size-4" />
              How each lever reaches the decision
            </CardTitle>
            <CardDescription>Strongest path first</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {causal.map((c) => (
              <div
                key={c.intervention}
                className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              >
                <Badge variant="default">{c.intervention}</Badge>
                <p className="mt-1 text-xs text-muted">{c.topPath}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-4" />
            What to verify next
          </CardTitle>
          <CardDescription>
            The checks that would most change this ordering if they came back differently than the
            model assumes. Most useful first.
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
              <Badge variant="ok">{i.effort}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">In short</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted">
            {report.synthesis.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
