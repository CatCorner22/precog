import { HEALTH_SCALE } from "@/lib/precog/scoring/bands";
import { IndexBasis } from "@/components/precog/index-basis";
import { useEffect, useMemo } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { mapNotAssessedNote, mapSource, starterMapFacts } from "@/lib/precog/builder/map-state";
import {
  buildProcessMapGraph,
  computeMapHealth,
  validateProcessMap,
  type MapHealthBand,
} from "@/lib/precog/process-graph";
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

function bandTone(band: MapHealthBand): "ok" | "primary" | "warn" | "danger" {
  if (band === "healthy") return "ok";
  if (band === "fair") return "warn";
  return "danger";
}

function scoreColor(score: number) {
  if (score >= HEALTH_SCALE.strong) return "var(--color-ok)";
  if (score >= HEALTH_SCALE.adequate) return "var(--color-primary)";
  if (score >= HEALTH_SCALE.weak) return "var(--color-warn)";
  return "var(--color-danger)";
}

export function MapHealthCard({
  onOpenMap,
  onBuildMap,
}: {
  onOpenMap: (processId?: string) => void;
  onBuildMap: () => void;
}) {
  const { profile, mapCustomized, recordMapHealth } = usePractice();
  const tpl = useTemplate();
  // The starter map with nobody assigned, or an empty map, has no health to
  // report; the card says what to do instead and records no history point.
  const notAssessed = mapNotAssessedNote(profile);
  const source = mapSource(profile);

  const health = useMemo(() => {
    const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
    const issues = validateProcessMap(
      tpl.processes,
      tpl.people,
      new Set(tpl.controls.map((c) => c.id)),
      profile.mapLayout ?? {},
    );
    return computeMapHealth(snapshots, issues, { customized: mapCustomized });
  }, [tpl, profile.staff, profile.mapLayout, mapCustomized]);

  useEffect(() => {
    if (!notAssessed) recordMapHealth(health.score);
  }, [health.score, notAssessed, recordMapHealth]);

  const history = profile.mapHealthHistory ?? [];
  const trendPoints = history.map((h) => h.score);
  const previous = history.length >= 2 ? history[history.length - 2].score : null;
  const delta = previous === null ? null : health.score - previous;
  const firstAt = history[0]?.at;

  const tone = bandTone(health.band);
  const topIssues = useMemo(() => {
    const issues = validateProcessMap(
      tpl.processes,
      tpl.people,
      new Set(tpl.controls.map((c) => c.id)),
      profile.mapLayout ?? {},
    );
    return issues.filter((i) => i.severity !== "info").slice(0, 3);
  }, [tpl.processes, tpl.people, tpl.controls, profile.mapLayout]);

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
                How complete and calm your value stream is — owners, controls, integrity, heat.
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
              ? `${starter.count} starter processes · starter map from the ${starter.example}`
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
              How complete and calm your value stream is — owners, controls, integrity, heat.
            </CardDescription>
          </div>
          <Badge variant={tone}>{health.bandLabel}</Badge>
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
                stroke={scoreColor(health.score)}
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
              <IndexBasis className="mt-1" />
              {trendPoints.length >= 2 && (
                <div className="flex items-center gap-2">
                  <Sparkline points={trendPoints} color={scoreColor(health.score)} />
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
                        background: scoreColor(d.score),
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
          {health.issueCount.errors + health.issueCount.warns > 0 && (
            <Button size="sm" variant="outline" onClick={onBuildMap}>
              <ShieldCheck className="size-3.5" />
              Fix {health.issueCount.errors + health.issueCount.warns} issue(s)
            </Button>
          )}
        </div>

        <p className="mt-3 text-xs text-subtle">
          {health.processCount} processes · avg heat {health.avgHeat}
          {health.hotProcesses > 0 ? ` · ${health.hotProcesses} hot` : ""}
          {mapCustomized ? " · custom map" : " · industry template"}
          {firstAt && trendPoints.length >= 2
            ? ` · tracked since ${new Date(firstAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}
