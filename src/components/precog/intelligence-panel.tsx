import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { scoreAnomalies } from "@/lib/precog/ml/anomaly";
import { scoreLeadingIndicators } from "@/lib/precog/ml/leading-indicators";
import { forecastResidualTrajectory } from "@/lib/precog/ml/forecast";
import { retrieveKnowledge } from "@/lib/precog/rag/retrieve";
import { AdvancedReasoningPanel } from "@/components/precog/advanced-reasoning-panel";
import { MetaAnalysisPanel } from "@/components/precog/meta-analysis-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, Brain, LineChart, Radar, Search, Sparkles } from "lucide-react";
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
  const [view, setView] = useState<"signals" | "reasoning" | "meta">("meta");
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
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={view === "meta" ? "default" : "secondary"}
          onClick={() => setView("meta")}
        >
          <Radar className="size-3.5" />
          Meta / unknowns
        </Button>
        <Button
          size="sm"
          variant={view === "reasoning" ? "default" : "secondary"}
          onClick={() => setView("reasoning")}
        >
          <Sparkles className="size-3.5" />
          Advanced reasoning
        </Button>
        <Button
          size="sm"
          variant={view === "signals" ? "default" : "secondary"}
          onClick={() => setView("signals")}
        >
          <Brain className="size-3.5" />
          ML + RAG signals
        </Button>
      </div>

      {view === "meta" && (
        <MetaAnalysisPanel onNavigate={(t) => onNavigate?.(t)} />
      )}

      {view === "reasoning" && <AdvancedReasoningPanel />}

      {view === "signals" && (
        <>
          <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">ML + RAG</Badge>
              <Badge variant="primary">Classical models · offline</Badge>
            </div>
            <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Brain className="size-5 text-primary" />
              Intelligence signals
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Anomaly scoring, leading indicators, residual forecast, and TF-IDF retrieval.
              Pioneer calls these plus the advanced reasoning stack and meta-analysis.
            </p>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <Badge variant={anomaly.overallScore >= 60 ? "danger" : "ok"}>
                  Anomaly
                </Badge>
                <p className="mt-2 text-2xl font-semibold tabular">
                  {anomaly.overallScore}
                </p>
                <p className="text-xs text-muted">{anomaly.band}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <Badge variant={leading.pressureIndex >= 60 ? "warn" : "primary"}>
                  Leading pressure
                </Badge>
                <p className="mt-2 text-2xl font-semibold tabular">
                  {leading.pressureIndex}
                </p>
                <p className="text-xs text-muted">{leading.band}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <Badge variant="default">Forecast w12</Badge>
                <p className="mt-2 text-2xl font-semibold tabular">
                  {forecast.points.at(-1)?.residualDoNothing ?? "—"}
                </p>
                <p className="text-xs text-muted">
                  neglect vs plan {forecast.points.at(-1)?.residualWithPlan ?? "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <LineChart className="size-4" />
                Residual trajectory
              </CardTitle>
              <CardDescription>Do-nothing vs recommended plan</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RLineChart data={forecast.points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="week" stroke="var(--color-muted)" fontSize={11} />
                  <YAxis stroke="var(--color-muted)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="residualDoNothing"
                    name="Neglect"
                    stroke="var(--color-danger)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="residualWithPlan"
                    name="With plan"
                    stroke="var(--color-ok)"
                    strokeWidth={2}
                    dot={false}
                  />
                </RLineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="size-4" />
                Guidance retrieval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <input
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                />
                <Button size="sm" variant="secondary" onClick={() => onNavigate?.("pioneer")}>
                  <Activity className="size-3.5" />
                  Ask Pioneer
                </Button>
              </div>
              <ul className="space-y-2">
                {rag.map((h) => (
                  <li
                    key={h.chunk.id}
                    className={cn(
                      "rounded-lg border border-border bg-elevated px-3 py-2 text-sm",
                    )}
                  >
                    <div className="flex flex-wrap gap-2">
                      <span className="font-medium">{h.chunk.title}</span>
                      <Badge variant="default">{h.chunk.source}</Badge>
                      <span className="text-[11px] text-subtle">
                        score {(h.score * 100).toFixed(0)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted line-clamp-3">{h.chunk.text}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
