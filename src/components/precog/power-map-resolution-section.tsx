import { ResolutionOptions } from "./power-map-parts";
import { ConflictSummary } from "./sod-conflict-summary";
import { FAMILY_META } from "@/lib/precog/sod/duty-families";
import { ENTITLEMENTS, isOperatingDuty } from "@/lib/precog/sod/conflict-rules";
import { applyResolutionPlan } from "@/lib/precog/sod/resolution-planner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ControlMeasuresMatrix } from "./power-map-control-measures";
import type { PowerMapBuilderModel } from "./use-power-map-builder";

export function PowerMapResolutionSection({ model }: { model: PowerMapBuilderModel }) {
  const { selectedConflicts, selected, assignments, commit, guidanceByDuty, visibleEntitlements } =
    model;

  return (
    <>
      {selectedConflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolution planner · {selected?.personName}</CardTitle>
            <CardDescription>
              Compare moves that end a conflict without creating a new one before you change the
              map. Apply one, check the new segregation health, and undo at any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedConflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="grid gap-2 rounded-xl border border-border bg-elevated p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
              >
                <ConflictSummary conflict={conflict}>
                  <p className="mt-2 text-xs text-muted">
                    Until different people hold the duties:{" "}
                    {conflict.compensatingControls.slice(0, 2).join("; ")}
                  </p>
                </ConflictSummary>
                <ResolutionOptions
                  assignments={assignments}
                  conflict={conflict}
                  onApply={(plan) => commit(applyResolutionPlan(assignments, plan))}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ControlMeasuresMatrix duties={visibleEntitlements} industry={model.profile.industry} />

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Duty charter · {selected.personName}</CardTitle>
            <CardDescription>
              A review-ready definition of each assigned power, its expected evidence, and its
              boundary.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 lg:grid-cols-2">
            {selected.entitlements.filter(isOperatingDuty).map((id) => {
              const entitlement = ENTITLEMENTS.find((item) => item.id === id);
              const guidance = guidanceByDuty[id];
              return (
                <div key={id} className="rounded-xl border border-border bg-elevated p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{entitlement?.label}</p>
                    <Badge>{entitlement ? FAMILY_META[entitlement.family].label : "Duty"}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted">{guidance.purpose}</p>
                  <p className="mt-2 text-xs text-subtle">
                    <strong className="text-muted">Evidence:</strong> {guidance.evidence}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    <strong className="text-muted">Boundary:</strong> {guidance.boundary}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
