import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { buildPlan30, type PlanItem } from "@/lib/precog/builder/plan30";
import { summarizeEffectiveness } from "@/lib/precog/builder/effectiveness";
import { rankDepartureRisk } from "@/lib/precog/builder/departure";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "@/lib/precog/process-graph";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";

export function Plan30Card({
  onOpenBuilder,
  onOpenProcess,
  onOpenTab,
}: {
  onOpenBuilder: () => void;
  onOpenProcess: (id: string) => void;
  onOpenTab: (tab: string) => void;
}) {
  const { profile, mapCustomized, templateRevision, togglePlanItem } = usePractice();
  const tpl = useTemplate();
  const [collapsed, setCollapsed] = useState(false);

  const plan = useMemo(() => {
    const { snapshots } = buildProcessMapGraph(profile.staff);
    const issues = validateProcessMap(tpl.processes, tpl.people, new Set(tpl.controls.map((c) => c.id)), profile.mapLayout ?? {});
    const health = computeMapHealth(snapshots, issues, { customized: mapCustomized });
    return buildPlan30({
      profile,
      processes: tpl.processes,
      health,
      issues,
      effectiveness: summarizeEffectiveness(tpl.controls, tpl.processes, Date.now(), profile.controlTests ?? []),
      departures: rankDepartureRisk(tpl.processes, tpl.people, profile.staff),
    });
  }, [profile, tpl.processes, tpl.people, tpl.controls, mapCustomized, templateRevision]);

  const [week, setWeek] = useState<1 | 2 | 3 | 4>(plan.currentWeek);
  const pct = Math.round((plan.done / plan.total) * 100);
  const complete = plan.done === plan.total;
  const visible = plan.items.filter((i) => i.week === week);

  function go(item: PlanItem) {
    const t = item.target;
    if (t.kind === "builder") onOpenBuilder();
    else if (t.kind === "process") onOpenProcess(t.processId);
    else if (t.kind === "tab") onOpenTab(t.tab);
  }

  return (
    <Card className={cn(complete && "border-ok/40")}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="size-4 text-accent" />
              Your first 30 days
              <Badge variant={complete ? "ok" : "accent"}>
                {complete ? "complete" : `day ${Math.min(plan.dayNumber, 30)} · week ${plan.currentWeek}`}
              </Badge>
            </CardTitle>
            <CardDescription>
              A plan generated from your actual map. Items tick themselves when the map reflects them; tick the rest yourself.
            </CardDescription>
          </div>
          <button type="button" onClick={() => setCollapsed((v) => !v)} className="text-xs text-muted hover:text-fg">
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular text-muted">
            {plan.done}/{plan.total}
          </span>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
            {([1, 2, 3, 4] as const).map((w) => {
              const items = plan.items.filter((i) => i.week === w);
              const d = items.filter((i) => i.autoDone).length;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeek(w)}
                  className={cn(
                    "px-2.5 py-1",
                    w !== 1 && "border-l border-border",
                    week === w ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                    w === plan.currentWeek && "font-medium",
                  )}
                >
                  Week {w}
                  <span className="ml-1 text-[10px] tabular text-subtle">
                    {d}/{items.length}
                  </span>
                </button>
              );
            })}
          </div>
          <ul className="space-y-1.5">
            {visible.map((i) => (
              <li
                key={i.id}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
                  i.autoDone ? "border-ok/30 bg-ok/5" : "border-border bg-elevated",
                )}
              >
                <button
                  type="button"
                  onClick={() => togglePlanItem(i.id)}
                  className="mt-0.5 shrink-0 text-muted hover:text-fg"
                  aria-label={i.autoDone ? "Mark not done" : "Mark done"}
                >
                  {i.autoDone ? <CheckCircle2 className="size-4 text-ok" /> : <Circle className="size-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium text-fg", i.autoDone && "line-through decoration-ok/60")}>{i.title}</p>
                  <p className="text-muted">{i.why}</p>
                </div>
                <span className="shrink-0 text-[10px] text-subtle">~{i.minutes}m</span>
                {!i.autoDone &&
                  (i.target.kind === "route" ? (
                    <Link to={i.target.to} className="shrink-0 text-primary hover:underline" aria-label="Go">
                      <ArrowRight className="size-4" />
                    </Link>
                  ) : (
                    <button type="button" onClick={() => go(i)} className="shrink-0 text-primary hover:underline" aria-label="Go">
                      <ArrowRight className="size-4" />
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
