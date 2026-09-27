import { healthTone } from "@/lib/precog/scoring/bands";
import { useEffect } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { mapNotAssessedNote, mapSource, starterMapFacts } from "@/lib/precog/builder/map-state";
import type { ScoredMap } from "@/lib/precog/builder/scored-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Hammer,
  Map,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatDayShort } from "@/lib/precog/dates";
import { count } from "@/lib/precog/text";

/**
 * The dashboard's map health card. `map` is scored as the map page scores it
 * (untouched starter processes left out), computed once by the dashboard.
 */
export function MapHealthCard({
  map,
  onOpenMap,
  onBuildMap,
  onFixIssues,
}: {
  map: ScoredMap;
  onOpenMap: (processId?: string) => void;
  onBuildMap: () => void;
  /** Opens the builder with its Validate panel, which lists every issue. */
  onFixIssues: () => void;
}) {
  const { profile, mapCustomized, recordMapHealth } = usePractice();
  // The starter map with nobody assigned, or an empty map, has no health to
  // report; the card says what to do instead and records no history point.
  const notAssessed = mapNotAssessedNote(profile);
  const source = mapSource(profile);

  const { health, unscoredCount } = map;

  useEffect(() => {
    if (!notAssessed) recordMapHealth(health.score);
  }, [health.score, notAssessed, recordMapHealth]);

  const history = profile.mapHealthHistory ?? [];
  const trendPoints = history.map((h) => h.score);
  const previous = history.length >= 2 ? history[history.length - 2].score : null;
  const delta = previous === null ? null : health.score - previous;
  const firstAt = history[0]?.at;

  const color = `var(--color-${healthTone(health.score)})`;
  const topIssues = map.issues.filter((i) => i.severity !== "info").slice(0, 3);
  const issueCount = health.issueCount.errors + health.issueCount.warns;

  const circumference = 2 * Math.PI * 54;
  const dash = (health.score / 100) * circumference;

  if (notAssessed) {
    const starter = source === "starter" ? starterMapFacts(profile) : null;
    return (
      <Card className="overflow-hidden border-border">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-primary" />
                Map health score
              </CardTitle>
              <CardDescription>
                How complete and calm your value stream is: integrity, ownership, controls, written
                procedures and heat.
              </CardDescription>
            </div>
            <Badge variant="default">Not assessed yet</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted">{notAssessed}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={onBuildMap}>
              <Hammer className="size-3.5" />
              {starter ? "Assign owners" : "Build your map"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onOpenMap()}>
              <Map className="size-3.5" />
              Open process map
            </Button>
          </div>
          <p className="mt-3 text-xs text-subtle">
            {starter
              ? `${starter.count} sample processes · sample process map from the ${starter.example}`
              : "0 processes · your own map"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" />
              Map health score
            </CardTitle>
            <CardDescription>
              How complete and calm your value stream is: integrity, ownership, controls, written
              procedures and heat.
            </CardDescription>
          </div>
          <Badge variant={healthTone(health.score)}>{health.bandLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative mx-auto size-36 shrink-0 sm:mx-0">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="var(--color-border)"
                strokeWidth="10"
              />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold tabular tracking-tight">{health.score}</span>
              <span className="text-xs uppercase tracking-wide text-subtle">/ 100</span>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">{health.summary}</p>
              {trendPoints.length >= 2 && (
                <div className="flex items-center gap-2">
                  <Sparkline points={trendPoints} color={color} />
                  {delta !== null && delta !== 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-xs font-medium tabular",
                        delta > 0 ? "text-ok" : "text-danger",
                      )}
                    >
                      {delta > 0 ? (
                        <TrendingUp className="size-3" />
                      ) : (
                        <TrendingDown className="size-3" />
                      )}
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {health.dimensions.map((d) => (
                <div key={d.id} className="rounded-lg border border-border bg-elevated px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-fg">{d.label}</span>
                    <span className="tabular text-subtle">{d.score}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${d.score}%`,
                        background: `var(--color-${healthTone(d.score)})`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">{d.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {topIssues.length > 0 && (
          <ul className="mt-4 space-y-1">
            {topIssues.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => i.processId && onOpenMap(i.processId)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs",
                    i.severity === "error"
                      ? "border-danger/30 bg-danger/5 text-fg"
                      : "border-warn/30 bg-warn/5 text-fg",
                    i.processId && "hover:border-border-strong",
                  )}
                >
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warn" />
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onOpenMap()}>
            <Map className="size-3.5" />
            Open process map
          </Button>
          <Button size="sm" variant="secondary" onClick={onBuildMap}>
            <Hammer className="size-3.5" />
            {mapCustomized ? "Edit map" : "Build your map"}
          </Button>
          {issueCount > 0 && (
            <Button size="sm" variant="outline" onClick={onFixIssues}>
              <ShieldCheck className="size-3.5" />
              Fix {count(issueCount, "issue")}
            </Button>
          )}
        </div>

        <p className="mt-3 text-xs text-subtle">
          {health.processCount} processes · avg heat {health.avgHeat}
          {health.hotProcesses > 0 ? ` · ${health.hotProcesses} hot` : ""}
          {unscoredCount > 0 ? ` · ${unscoredCount} starter, not scored` : ""}
          {mapCustomized ? " · custom map" : " · industry template"}
          {firstAt && trendPoints.length >= 2 ? ` · tracked since ${formatDayShort(firstAt)}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const w = 160;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-40" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
