import { CoverageList } from "./power-map-parts";
import { StatTile } from "@/components/ui/stat-tile";
import { withPlaces } from "@/lib/precog/person-location";
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
          stand-in cover. This simulation does not change assignments.
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
            <StatTile
              label="Stand-in cover after absence"
              value={`${absenceImpact.remainingResilienceScore}/100`}
              hint={`${absenceImpact.scoreChange} points`}
              tone={absenceImpact.scoreChange < 0 ? "danger" : "ok"}
            />
            <StatTile
              label="Duties stopped"
              value={String(absenceImpact.newlyUnassigned.length)}
              hint="No remaining assignee"
              tone={absenceImpact.newlyUnassigned.length > 0 ? "danger" : "ok"}
            />
            <StatTile
              label="Stand-ins lost"
              value={String(absenceImpact.newlySinglePoint.length)}
              hint="Now dependent on one person"
              tone={absenceImpact.newlySinglePoint.length > 0 ? "danger" : "ok"}
            />
          </div>
        ) : (
          <div className="flex min-h-20 items-center rounded-xl border border-dashed border-border px-4 text-sm text-subtle">
            Choose anyone on the team, including the owner or a contractor, to run a no-change
            continuity simulation.
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
