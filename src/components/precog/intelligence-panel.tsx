import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { scoreAnomalies } from "@/lib/precog/ml/anomaly";
import { scoreLeadingIndicators } from "@/lib/precog/ml/leading-indicators";
import { forecastResidualTrajectory } from "@/lib/precog/ml/forecast";
import { retrieveKnowledge } from "@/lib/precog/rag/retrieve";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, Brain, LineChart, Search } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function IntelligencePanel({
  onNavigate,
}: {
  onNavigate?: (tab: string) => void;
}) {
  const { profile } = usePractice();
  const [ragQuery, setRagQuery] = useState(
    "segregation of duties bank reconciliation residual risk",
  );

  const anomaly = useMemo(
    () => scoreAnomalies(profile.staff, profile.riskVariables),
    [profile.staff, profile.riskVariables],
  );
  const leading = useMemo(
    () => scoreLeadingIndicators(profile.staff, profile.riskVariables),
    [profile.staff, profile.riskVariables],
  );
  const forecast = useMemo(
    () => forecastResidualTrajectory(profile.staff, profile.riskVariables),
    [profile.staff, profile.riskVariables],
  );
  const rag = useMemo(() => retrieveKnowledge(ragQuery, { topK: 4 }), [ragQuery]);

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">ML + RAG</Badge>
          <Badge variant="primary">Classical models · offline</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Brain className="size-5 text-primary" />
          Intelligence layer
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Anomaly scoring vs healthy prior, leading-indicator pressure, 12-week residual
          forecast, and TF-IDF retrieval over COSO/SoD/Lean guidance. Pioneer agent calls the
          same engines.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Anomaly score"
          value={`${anomaly.overallScore}`}
          hint={anomaly.band}
          tone={
            anomaly.band === "critical" || anomaly.band === "stressed"
              ? "danger"
              : anomaly.band === "elevated"
                ? "warn"
                : "ok"
          }
        />
        <Metric
          label="Leading pressure"
          value={`${leading.pressureIndex}`}
          hint={leading.band}
          tone={
            leading.band === "red" || leading.band === "heat"
              ? "danger"
              : leading.band === "watch"
                ? "warn"
                : "ok"
          }
        />
        <Metric
          label="Week-12 residual (plan)"
          value={`${forecast.points.at(-1)?.residualWithPlan ?? "—"}`}
          hint={`neglect ${forecast.points.at(-1)?.residualDoNothing ?? "—"}`}
          tone="primary"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              Leading indicators
            </CardTitle>
            <CardDescription>{leading.method}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {leading.indicators.map((ind) => (
              <button
                key={ind.id}
                type="button"
                onClick={() => ind.linkedTab && onNavigate?.(ind.linkedTab)}
                className="flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2 text-left text-sm"
              >
                <span>
                  <span className="font-medium">{ind.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{ind.why}</span>
                </span>
                <Badge
                  variant={
                    ind.status === "breach"
                      ? "danger"
                      : ind.status === "watch"
                        ? "warn"
                        : "ok"
                  }
                >
                  {ind.value}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Anomaly findings
            </CardTitle>
            <CardDescription>{anomaly.method}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {anomaly.findings.length === 0 && (
              <p className="text-sm text-muted">No strong deviations from prior.</p>
            )}
            {anomaly.findings.map((f) => (
              <div
                key={f.feature}
                className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      f.severity === "alert"
                        ? "danger"
                        : f.severity === "watch"
                          ? "warn"
                          : "default"
                    }
                  >
                    z={f.z}
                  </Badge>
                  <span className="font-mono text-xs text-subtle">{f.feature}</span>
                </div>
                <p className="mt-1 text-muted">{f.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="size-4" />
            Residual forecast (12 weeks)
          </CardTitle>
          <CardDescription>
            {forecast.method} · plan: {forecast.planLabel}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RLineChart data={forecast.points}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="week"
                  tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                  label={{ value: "Week", position: "insideBottom", offset: -2 }}
                />
                <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="residualDoNothing"
                  name="Neglect residual"
                  stroke="var(--color-danger)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="residualWithPlan"
                  name="Plan residual"
                  stroke="var(--color-ok)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="anomalyDoNothing"
                  name="Neglect anomaly"
                  stroke="var(--color-warn)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
              </RLineChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {forecast.narrative.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-4" />
            Guidance retrieval (RAG)
          </CardTitle>
          <CardDescription>TF-IDF over curated COSO / SoD / Lean / fraud corpus</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              className="min-w-[240px] flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              placeholder="Search guidance…"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setRagQuery("write-off adjustments dual control dental cash fraud")
              }
            >
              Cash path
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRagQuery("COSO monitoring residual acceptance")}
            >
              COSO accept
            </Button>
          </div>
          {rag.map((h) => (
            <div
              key={h.chunk.id}
              className="rounded-xl border border-border bg-elevated px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">{h.chunk.domain}</Badge>
                <span className="text-xs tabular text-subtle">
                  score {h.score.toFixed(3)}
                </span>
              </div>
              <p className="mt-1 font-medium">{h.chunk.title}</p>
              <p className="mt-1 text-sm text-muted">{h.chunk.text}</p>
              <p className="mt-1 text-[11px] text-subtle">{h.chunk.source}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "danger" | "warn" | "ok" | "primary";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <Badge
          variant={
            tone === "danger"
              ? "danger"
              : tone === "warn"
                ? "warn"
                : tone === "ok"
                  ? "ok"
                  : "primary"
          }
        >
          {label}
        </Badge>
        <p className={cn("mt-2 text-2xl font-semibold tabular")}>{value}</p>
        <p className="text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}
