import { CoverageList, ImpactMetric } from "./power-map-parts";
import { withPlaces } from "./power-map-graph";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PowerMapBuilderModel } from "./use-power-map-builder";

export function PowerMapAbsenceCard({ model }: { model: PowerMapBuilderModel }) {
  const { assignments, placesOf, absentPersonId, setAbsentPersonId, absenceImpact } = model;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Absence stress test</CardTitle>
        <CardDescription>
          Temporarily remove one person from the model to see which duties stop and which lose
          backup coverage. This simulation does not change assignments.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <label className="block text-sm">
          <span className="text-muted">Who is unavailable?</span>
          <select
            value={absentPersonId}
            onChange={(event) => setAbsentPersonId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2"
          >
            <option value="">Select a person…</option>
            {assignments.map((person) => (
              <option key={person.personId} value={person.personId}>
                {person.personName} · {withPlaces(person.role, placesOf.get(person.personId))}
              </option>
            ))}
          </select>
        </label>
        {absenceImpact ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <ImpactMetric
              label="Continuity after absence"
              value={`${absenceImpact.remainingResilienceScore}/100`}
              detail={`${absenceImpact.scoreChange} points`}
              danger={absenceImpact.scoreChange < 0}
            />
            <ImpactMetric
              label="Duties stopped"
              value={String(absenceImpact.newlyUnassigned.length)}
              detail="No remaining assignee"
              danger={absenceImpact.newlyUnassigned.length > 0}
            />
            <ImpactMetric
              label="Backups lost"
              value={String(absenceImpact.newlySinglePoint.length)}
              detail="Now dependent on one person"
              danger={absenceImpact.newlySinglePoint.length > 0}
            />
          </div>
        ) : (
          <div className="flex min-h-20 items-center rounded-xl border border-dashed border-border px-4 text-sm text-subtle">
            Choose any employee, owner, or contractor to run a no-change continuity simulation.
          </div>
        )}
      </CardContent>
      {absenceImpact &&
        (absenceImpact.newlyUnassigned.length > 0 || absenceImpact.newlySinglePoint.length > 0) && (
          <CardContent className="grid gap-3 border-t border-border pt-4 lg:grid-cols-2">
            <CoverageList
              title="Work that stops"
              empty="No duties stop."
              items={absenceImpact.newlyUnassigned.map((item) => ({
                id: item.entitlementId,
                label: item.label,
                detail: "No remaining authorized owner",
              }))}
              danger
            />
            <CoverageList
              title="Work now at risk"
              empty="No new single points."
              items={absenceImpact.newlySinglePoint.map((item) => ({
                id: item.entitlementId,
                label: item.label,
                detail: `${item.assignees[0]?.personName} becomes the only remaining assignee`,
              }))}
            />
          </CardContent>
        )}
    </Card>
  );
}
