import {
  CoverageList,
  CoveragePlanOption,
  ImpactMetric,
  Metric,
} from "./power-map-parts";
import { withPlaces } from "./power-map-graph";
import { AlertTriangle, Check, RotateCcw, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { JOB_CATALOG } from "@/lib/precog/onboarding/job-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PowerMapBuilderModel } from "./use-power-map-builder";

export function PowerMapOverviewSection({ model }: { model: PowerMapBuilderModel }) {
  const {
    assignments,
    coverage,
    report,
    criticalCount,
    pendingChanges,
    baseline,
    commit,
    acceptBaseline,
    setSelectedId,
    setHistory,
    powerIndex,
    selectedId,
    placesOf,
    coveragePlans,
    coverageProgram,
  } = model;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Users}
          label="People / jobs"
          value={assignments.length}
          detail={`${JOB_CATALOG.length} job titles to simulate a hire`}
        />
        <Metric
          icon={UserRoundCheck}
          label="Duty backup (this app's index, 0 to 100)"
          value={coverage.resilienceScore}
          detail={`${coverage.singlePoints.length} high-risk duties with one holder · ${coverage.unassigned.length} duties nobody holds (some may not apply)`}
          danger={coverage.unassigned.length > 0}
        />
        <Metric
          icon={AlertTriangle}
          label="Open conflicts"
          value={report.conflicts.length}
          detail={`${report.summary.peopleWithConflicts} people affected`}
          danger={report.conflicts.length > 0}
        />
        <Metric
          icon={ShieldCheck}
          label="Critical open"
          value={criticalCount}
          detail={`SoD health ${report.summary.segregationHealth}/100`}
          danger={criticalCount > 0}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Change review</CardTitle>
            <CardDescription>
              Review proposed grants, revocations, hires, and removals against the loaded baseline
              before treating the model as approved.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                commit(baseline);
                setSelectedId(baseline[0]?.personId ?? "");
              }}
              disabled={!pendingChanges.length}
            >
              <RotateCcw className="size-3.5" />
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => {
                acceptBaseline(assignments);
                setHistory([]);
              }}
              disabled={!pendingChanges.length}
            >
              <Check className="size-3.5" />
              Accept baseline
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pendingChanges.length ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="accent">{pendingChanges.length} pending</Badge>
                <Badge>
                  {pendingChanges.filter((item) => item.kind === "duty_granted").length} grants
                </Badge>
                <Badge>
                  {pendingChanges.filter((item) => item.kind === "duty_revoked").length} revocations
                </Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {pendingChanges.slice(0, 12).map((change) => (
                  <div
                    key={change.id}
                    className="rounded-lg border border-border bg-elevated p-2.5"
                  >
                    <p className="text-xs font-medium">{change.personName}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-xs",
                        change.kind === "duty_granted" || change.kind === "person_added"
                          ? "text-primary"
                          : "text-warn",
                      )}
                    >
                      {change.kind.replaceAll("_", " ")}{" "}
                      {change.dutyLabel ? `· ${change.dutyLabel}` : `· ${change.role}`}
                    </p>
                  </div>
                ))}
              </div>
              {pendingChanges.length > 12 && (
                <p className="mt-2 text-xs text-subtle">
                  +{pendingChanges.length - 12} additional pending changes.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-ok">
              No pending model changes. Current assignments match the accepted baseline.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authority concentration</CardTitle>
          <CardDescription>
            A comparative index of risk-weighted powers, duty-family breadth, exclusive
            capabilities, and active conflicts. Use it to prioritize oversight—not as a finding by
            itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 lg:grid-cols-2">
          {powerIndex.slice(0, 8).map((person) => (
            <button
              key={person.personId}
              type="button"
              onClick={() => setSelectedId(person.personId)}
              className={cn(
                "rounded-xl border p-3 text-left",
                selectedId === person.personId
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-elevated",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{person.personName}</p>
                  <p className="text-xs text-subtle">
                    {withPlaces(person.role, placesOf.get(person.personId))}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-lg font-semibold tabular",
                    person.authorityIndex >= 75
                      ? "text-danger"
                      : person.authorityIndex >= 50
                        ? "text-warn"
                        : "text-primary",
                  )}
                >
                  {person.authorityIndex}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
                <div
                  className={cn(
                    "h-full rounded-full",
                    person.authorityIndex >= 75
                      ? "bg-danger"
                      : person.authorityIndex >= 50
                        ? "bg-warn"
                        : "bg-primary",
                  )}
                  style={{ width: `${person.authorityIndex}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-subtle">
                {person.familyCount} duty families · {person.exclusiveDutyCount} exclusive powers ·{" "}
                {person.conflictCount} conflicts
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage & continuity</CardTitle>
          <CardDescription>
            SoD asks whether powers are safely separated. Continuity asks whether essential work has
            an owner and a trained backup. Address both before implementing the model.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          <CoverageList
            title="Unassigned duties"
            empty="Every duty has an owner."
            items={coverage.unassigned.map((item) => ({
              id: item.entitlementId,
              label: item.label,
              detail: `Risk ${item.riskWeight}/5 · assign a primary owner`,
            }))}
            danger
          />
          <CoverageList
            title="Critical single points"
            empty="High-risk duties have backup coverage."
            items={coverage.singlePoints.map((item) => ({
              id: item.entitlementId,
              label: item.label,
              detail: `${item.assignees[0]?.personName} is the only assignee · designate a trained backup`,
            }))}
          />
          <CoverageList
            title="Power concentration"
            empty="No person holds four or more high-risk powers."
            items={coverage.highRiskConcentration.map((item) => ({
              id: item.personId,
              label: item.personName,
              detail: `${item.count} high-risk powers · review scope and monitoring`,
            }))}
          />
        </CardContent>
      </Card>

      {coveragePlans.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Backup suggestions</CardTitle>
              <CardDescription>
                For high-risk duties only one person holds: people who already hold a significant
                duty in the same process and hold no conflict, where adding the duty creates no
                conflict the rules detect. Check each person can actually do the work before you
                assign it; undo is one click.
              </CardDescription>
            </div>
            {coverageProgram.steps.length > 1 && (
              <Button
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      `Assign all ${coverageProgram.steps.length} suggested backups? Check each person can do the work; you can undo.`,
                    )
                  ) {
                    commit(coverageProgram.nextAssignments);
                  }
                }}
              >
                <ShieldCheck className="size-3.5" />
                Assign all suggested backups
              </Button>
            )}
          </CardHeader>
          {coverageProgram.steps.length > 1 && (
            <CardContent className="grid gap-2 border-t border-border py-3 sm:grid-cols-3">
              <ImpactMetric
                label="Suggested backups"
                value={String(coverageProgram.steps.length)}
                detail="Recalculated after each one"
              />
              <ImpactMetric
                label="Projected duty backup"
                value={`${coverageProgram.projectedScore}/100`}
                detail={`+${coverageProgram.projectedScore - coverageProgram.startingScore} points`}
              />
              <ImpactMetric
                label="Still one holder"
                value={String(coverageProgram.unresolvedGaps)}
                detail="Need someone outside, or a control"
                danger={coverageProgram.unresolvedGaps > 0}
              />
            </CardContent>
          )}
          <CardContent className="space-y-3">
            {Array.from(new Set(coveragePlans.map((plan) => plan.entitlement)))
              .slice(0, 6)
              .map((entitlement) => {
                const options = coveragePlans.filter((plan) => plan.entitlement === entitlement);
                const first = options[0];
                return (
                  <div
                    key={entitlement}
                    className="grid gap-3 rounded-xl border border-border bg-elevated p-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)]"
                  >
                    <div>
                      <Badge variant={first.reason === "unassigned" ? "danger" : "warn"}>
                        {first.reason === "unassigned" ? "Owner needed" : "Backup needed"}
                      </Badge>
                      <p className="mt-2 text-sm font-medium">{first.dutyLabel}</p>
                      <p className="mt-1 text-xs text-subtle">
                        Each candidate works in this duty&apos;s process already and adds no
                        conflict the rules detect.
                      </p>
                    </div>
                    <div className="grid gap-2 xl:grid-cols-3">
                      {options.map((plan) => (
                        <CoveragePlanOption
                          key={plan.id}
                          plan={plan}
                          onApply={() => {
                            setSelectedId(plan.toPersonId);
                            commit(plan.nextAssignments);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {coveragePlans.length === 0 && coverage.singlePoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backup suggestions</CardTitle>
            <CardDescription>
              No backup to suggest. Everyone who works in these duties&apos; processes already holds
              a conflict, or would gain one by taking the duty on. Separate a conflict first, or
              write the procedure down so a stand-in or your outside accountant can follow it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {coverage.singlePoints.map((duty) => (
              <Badge key={duty.entitlementId} variant="warn">
                {duty.label} · only {duty.assignees[0]?.personName ?? "one person"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
