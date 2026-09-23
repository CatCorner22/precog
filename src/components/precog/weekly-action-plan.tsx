import { useMemo } from "react";
import { trackRegisterFreshness } from "@/lib/precog/continuity/register-state";
import { mapAssessed } from "@/lib/precog/builder/map-state";
import { usePractice } from "@/lib/precog/practice-context";
import { formatUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, CircleAlert, ListChecks } from "lucide-react";
import { buildWeeklyActions } from "@/components/precog/weekly-action-plan-data";
import { buildProcessMapGraph } from "@/lib/precog/process-graph";
import { localDateKey } from "@/lib/precog/decisions/follow-through";
import { useToday } from "@/lib/precog/decisions/use-today";

export function WeeklyActionPlan({
  onNavigate,
}: {
  onNavigate: (tab: string, processId?: string) => void;
}) {
  const { profile, template } = usePractice();
  const today = useToday();
  const trackFreshness = trackRegisterFreshness(profile, template);
  const mapReady = mapAssessed(profile);
  const actions = useMemo(() => {
    const { snapshots } = buildProcessMapGraph(template, profile.staff);
    return buildWeeklyActions({
      tpl: template,
      staff: profile.staff,
      dualRelease: profile.dualRelease,
      mapSnapshots: snapshots,
      today: localDateKey(today),
      trackFreshness,
      mapAssessed: mapReady,
      decisions: profile.decisions,
      plannedAbsences: profile.plannedAbsences,
    });
  }, [
    template,
    profile.staff,
    profile.dualRelease,
    trackFreshness,
    mapReady,
    profile.decisions,
    profile.plannedAbsences,
    today,
  ]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-primary" />
          This week&apos;s control priorities
        </CardTitle>
        <CardDescription>
          Actionable steps ranked by residual impact — not a compliance checklist.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 className="size-4" />
            Core controls look solid. Monitor leading indicators and journal reviews.
          </p>
        ) : (
          actions.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onNavigate(a.tab, a.processId)}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5 text-left transition-colors hover:border-border-strong"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{a.title}</span>
                  <Badge
                    variant={a.effort === "low" ? "ok" : a.effort === "high" ? "warn" : "default"}
                  >
                    {a.effort} effort
                  </Badge>
                </span>
                <span className="mt-0.5 block text-xs text-muted">{a.why}</span>
                {a.evidence && (
                  <span className="mt-1 block text-xs text-subtle">
                    {a.evidence.caseCount} prosecuted{" "}
                    {a.evidence.caseCount === 1 ? "case" : "cases"} in the library
                    {a.evidence.worst
                      ? `; the largest cost ${a.evidence.worst.lossIsFloor ? "at least " : ""}${formatUsd(a.evidence.worst.lossUsd)}.`
                      : "."}
                  </span>
                )}
              </span>
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted" />
            </button>
          ))
        )}
        <Button className="w-full" variant="secondary" onClick={() => onNavigate("pioneer")}>
          Ask Pioneer for a tailored brief
        </Button>
      </CardContent>
    </Card>
  );
}
