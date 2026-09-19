import { useEffect, useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { scoreLeadingIndicators } from "@/lib/precog/ml/leading-indicators";
import { retrieveKnowledge } from "@/lib/precog/rag/retrieve";
import { defaultRagQuery } from "@/lib/precog/rag/industry-queries";
import { AdvancedReasoningPanel } from "@/components/precog/advanced-reasoning-panel";
import { MetaAnalysisPanel } from "@/components/precog/meta-analysis-panel";
import { JohariPanel } from "@/components/precog/johari-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, Brain, ExternalLink, Grid2x2, Radar, Search, Sparkles } from "lucide-react";

function rank(status: "ok" | "watch" | "breach"): number {
  return status === "breach" ? 2 : status === "watch" ? 1 : 0;
}

export function IntelligencePanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { profile } = usePractice();
  const [view, setView] = useState<"signals" | "reasoning" | "meta" | "johari">("johari");
  const [ragQuery, setRagQuery] = useState(() => defaultRagQuery(profile.industry));
  useEffect(() => {
    setRagQuery(defaultRagQuery(profile.industry));
  }, [profile.industry]);

  const leading = useMemo(
    () => scoreLeadingIndicators(profile.staff, profile.riskVariables),
    [profile.staff, profile.riskVariables],
  );
  const rag = useMemo(() => retrieveKnowledge(ragQuery, { topK: 4 }), [ragQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={view === "johari" ? "default" : "secondary"}
          onClick={() => setView("johari")}
        >
          <Grid2x2 className="size-3.5" />
          Johari
        </Button>
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
          Lever ordering
        </Button>
        <Button
          size="sm"
          variant={view === "signals" ? "default" : "secondary"}
          onClick={() => setView("signals")}
        >
          <Brain className="size-3.5" />
          Signals + guidance
        </Button>
      </div>

      {view === "johari" && <JohariPanel onNavigate={(t) => onNavigate?.(t)} />}

      {view === "meta" && <MetaAnalysisPanel onNavigate={(t) => onNavigate?.(t)} />}

      {view === "reasoning" && <AdvancedReasoningPanel />}

      {view === "signals" && (
        <>
          <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">Signals</Badge>
              <Badge variant="primary">Rule-based · runs locally</Badge>
            </div>
            <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Brain className="size-5 text-primary" />
              Conditions this app watches
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Each condition below is a setting or pattern that, in the prosecuted cases this app
              draws on, preceded a loss. The thresholds are set in this app; they are not
              benchmarks, and none of this is a prediction.
            </p>
          </section>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Watched conditions</CardTitle>
              <CardDescription>
                {leading.indicators.filter((i) => i.status === "breach").length} breached ·{" "}
                {leading.indicators.filter((i) => i.status === "watch").length} at watch ·{" "}
                {leading.indicators.filter((i) => i.status === "ok").length} clear
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...leading.indicators]
                .sort((a, b) => rank(b.status) - rank(a.status))
                .map((i) => (
                  <div
                    key={i.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      i.status === "breach"
                        ? "border-danger/30 bg-danger/5"
                        : i.status === "watch"
                          ? "border-warn/30 bg-warn/5"
                          : "border-border bg-elevated",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          i.status === "breach" ? "danger" : i.status === "watch" ? "warn" : "ok"
                        }
                      >
                        {i.status === "ok" ? "clear" : i.status}
                      </Badge>
                      <span className="font-medium">{i.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{i.why}</p>
                  </div>
                ))}
              {leading.topActions.length > 0 && (
                <p className="pt-1 text-xs text-subtle">
                  First move if any are breached: {leading.topActions[0]}
                </p>
              )}
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
                    className={cn("rounded-lg border border-border bg-elevated px-3 py-2 text-sm")}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{h.chunk.title}</span>
                      {h.chunk.basis.kind === "cited" ? (
                        <a
                          href={h.chunk.basis.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={h.chunk.basis.document}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          {h.chunk.basis.publisher}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-xs text-subtle" title={h.chunk.basis.note}>
                          Practitioner guidance, no single source
                        </span>
                      )}
                      {h.chunk.caseIds?.length ? (
                        <span className="text-xs text-subtle">
                          · shown in {h.chunk.caseIds.length} prosecuted{" "}
                          {h.chunk.caseIds.length === 1 ? "case" : "cases"} on Start here
                        </span>
                      ) : null}
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
