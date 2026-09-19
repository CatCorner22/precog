import { useEffect, useMemo } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
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
import { Activity, AlertTriangle, Hammer, Map, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { getAppetite } from "@/lib/precog/appetite";
import { templateBaselineHealth } from "@/lib/precog/builder/stress";
import { industryMeta } from "@/lib/precog/industry";

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
  if (band === "excellent" || band === "healthy") return "ok";
  if (band === "fair") return "warn";
  return "danger";
}

function scoreColor(score: number) {
  if (score >= 85) return "var(--color-ok)";
  if (score >= 70) return "var(--color-primary)";
  if (score >= 55) return "var(--color-warn)";
  return "var(--color-danger)";
}

export function MapHealthCard({
  onOpenMap,
  onBuildMap,
}: {
  onOpenMap: (processId?: string) => void;
  onBuildMap: () => void;
}) {
  const { profile, mapCustomized, templateRevision, recordMapHealth } = usePractice();
  const tpl = useTemplate();

  const health = useMemo(() => {
    const { snapshots } = buildProcessMapGraph(profile.staff);
    const issues = validateProcessMap(
      tpl.processes,
      tpl.people,
      new Set(tpl.controls.map((c) => c.id)),
      profile.mapLayout ?? {},
    );
    return computeMapHealth(snapshots, issues, { customized: mapCustomized });
  }, [
    profile.staff,
    profile.mapLayout,
    profile.industry,
    tpl.processes,
    tpl.people,
    tpl.controls,
    mapCustomized,
    templateRevision,
  ]);

  useEffect(() => {
    recordMapHealth(health.score);
  }, [health.score, recordMapHealth]);

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
  const appetite = getAppetite();
  const target = appetite.targetHealth;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseline = useMemo(() => templateBaselineHealth(), [profile.industry, templateRevision]);
  const vsBaseline = health.score - baseline.score;
  // The ring starts at 3 o'clock in SVG space; the -90° CSS rotation moves it to 12 o'clock.
  const targetAngle = (target / 100) * 360;
  const tx = 60 + 54 * Math.cos((targetAngle * Math.PI) / 180);
  const ty = 60 + 54 * Math.sin((targetAngle * Math.PI) / 180);
  const gap = target - health.score;

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
              {/* Target tick from risk appetite. */}
              <circle cx={tx} cy={ty} r="4" fill="var(--color-bg)" stroke="var(--color-fg)" strokeWidth="2" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold tabular tracking-tight">{health.score}</span>
              <span className="text-[10px] uppercase tracking-wide text-subtle">target {target}</span>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {health.summary}{" "}
                <span className={cn("text-xs", gap > 0 ? "text-warn" : "text-ok")}>
                  {gap > 0
                    ? `${gap} points below your ${appetite.label.toLowerCase()} target.`
                    : `Meets your ${appetite.label.toLowerCase()} target.`}
                </span>
              </p>
              {trendPoints.length >= 2 && (
                <div className="flex items-center gap-2">
                  <Sparkline points={trendPoints} color={scoreColor(health.score)} />
                  {delta !== null && delta !== 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[11px] font-medium tabular",
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
            {mapCustomized && (
              <p className="text-[11px] text-muted">
                <span className={cn("font-medium tabular", vsBaseline >= 0 ? "text-ok" : "text-warn")}>
                  {vsBaseline >= 0 ? "+" : ""}
                  {vsBaseline}
                </span>{" "}
                vs the {industryMeta(profile.industry).label} template baseline ({baseline.score}) — the
                grey tick on each bar.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {health.dimensions.map((d) => {
                const b = baseline.dimensions.find((x) => x.id === d.id);
                return (
                <div key={d.id} className="rounded-lg border border-border bg-elevated px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium text-fg">{d.label}</span>
                    <span className="tabular text-subtle">
                      {d.score}
                      {b && mapCustomized && b.score !== d.score && (
                        <span className={cn("ml-1", d.score >= b.score ? "text-ok" : "text-warn")}>
                          ({d.score >= b.score ? "+" : ""}
                          {d.score - b.score})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${d.score}%`,
                        background: scoreColor(d.score),
                      }}
                    />
                    {b && mapCustomized && (
                      <span
                        className="absolute top-0 h-full w-0.5 bg-fg/50"
                        style={{ left: `calc(${b.score}% - 1px)` }}
                        title={`Template baseline ${b.score}`}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-muted">{d.hint}</p>
                </div>
                );
              })}
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
                    "flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px]",
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

        <p className="mt-3 text-[10px] text-subtle">
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
