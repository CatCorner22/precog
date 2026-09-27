import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import { scoreLeadingIndicators, statusRank } from "@/lib/precog/ml/leading-indicators";
import { retrieveKnowledge } from "@/lib/precog/rag/retrieve";
import { defaultRagQuery } from "@/lib/precog/rag/industry-queries";
import { tabLabel, type NavFn } from "@/lib/precog/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, Brain, ExternalLink, Search } from "lucide-react";

/**
 * The Patterns tab's "Signals + guidance" view: the conditions this app
 * watches, worst first, with the first move, and a search of the guidance
 * library. The parent keys it on the industry, so the search starts again
 * from that industry's default query when the business changes.
 */
export function SignalsPanel({ onNavigate }: { onNavigate?: NavFn }) {
  const { profile, template } = usePractice();
  const { say } = usePresentation();
  const defaultQuery = defaultRagQuery(profile.industry);
  const [ragQuery, setRagQuery] = useState(defaultQuery);

  const leading = useMemo(
    () => scoreLeadingIndicators(template, profile.staff, profile.riskVariables),
    [template, profile.staff, profile.riskVariables],
  );
  const rag = useMemo(
    () => retrieveKnowledge(ragQuery, { topK: 4, industry: template.id }),
    [ragQuery, template.id],
  );
  const counts = {
    breach: leading.indicators.filter((i) => i.status === "breach").length,
    watch: leading.indicators.filter((i) => i.status === "watch").length,
    ok: leading.indicators.filter((i) => i.status === "ok").length,
  };

  return (
    <>
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Signals</Badge>
          <Badge variant="primary">Rule-based · runs locally</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Brain className="size-5 text-primary" aria-hidden />
          Conditions this app watches
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Each condition below is either a setting in your profile that the prosecuted cases on
          Start here turned on, or one of this app&rsquo;s own indices crossing a line this app
          chose. The thresholds are set in this app; they are not benchmarks, and none of this is a
          prediction.
        </p>
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Watched conditions</CardTitle>
          <CardDescription>
            {counts.breach} breached · {counts.watch} at watch · {counts.ok} clear
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...leading.indicators]
            .sort((a, b) => statusRank(b.status) - statusRank(a.status))
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
            <p className="pt-1 text-xs text-subtle">First move: {leading.topActions[0]}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-4" aria-hidden />
            Guidance library
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              aria-label="Search the guidance library"
              placeholder={defaultQuery}
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              className="min-w-[200px] flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
            />
            <Button size="sm" variant="secondary" onClick={() => onNavigate?.("pioneer")}>
              <Activity className="size-3.5" aria-hidden />
              Open {tabLabel("pioneer", say)}
            </Button>
          </div>
          <ul className="space-y-2">
            {rag.map((h) => (
              <li
                key={h.chunk.id}
                className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
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
                <p className="mt-1 line-clamp-3 text-xs text-muted">{h.chunk.text}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
