import { useMemo } from "react";
import type { DetectedConflict, RoleAssignment } from "@/lib/precog/sod/detect";
import { FAMILY_META } from "@/lib/precog/sod/duty-families";
import { roleWithPlaces } from "@/lib/precog/person-location";
import { joinWithAnd } from "@/lib/precog/text";
import { cn } from "@/lib/utils";
import { mapSlice } from "./power-map-graph";
import { WEIGHT_TITLE } from "./power-map-words";

/** Who holds which duty, read-only: Team is where the duties change. */
export function ResponsibilityMatrix({
  assignments,
  conflicts,
  conflictsOnly,
  processId,
  placesOf,
}: {
  assignments: RoleAssignment[];
  conflicts: DetectedConflict[];
  conflictsOnly: boolean;
  processId: string;
  placesOf: ReadonlyMap<string, string[]>;
}) {
  const {
    shownPeople,
    shownDuties: duties,
    conflictKeys,
  } = useMemo(
    () => mapSlice(assignments, conflicts, conflictsOnly, processId),
    [assignments, conflicts, conflictsOnly, processId],
  );
  return (
    <div className="max-h-[720px] overflow-auto rounded-xl border border-border bg-bg">
      <table className="min-w-max border-separate border-spacing-0 text-xs">
        <caption className="sr-only">
          Duty assignment matrix. Rows are duties and columns are people. Team changes who holds
          each duty.
        </caption>
        <thead className="sticky top-0 z-20 bg-surface">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-30 min-w-64 border-b border-r border-border bg-surface p-3 text-left"
            >
              Duty
            </th>
            {shownPeople.map((person) => (
              <th
                key={person.personId}
                scope="col"
                className="h-36 w-16 border-b border-border p-2 align-bottom"
              >
                <span
                  className="block max-w-32 -rotate-45 origin-bottom-left whitespace-nowrap text-left font-medium text-muted"
                  title={`${person.personName} · ${roleWithPlaces(person.role, placesOf.get(person.personId))}`}
                >
                  {person.personName}
                  {placesOf.has(person.personId) && (
                    <span className="block text-[10px] font-normal text-subtle">
                      {joinWithAnd(placesOf.get(person.personId) ?? [])}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {duties.map((duty) => (
            <tr key={duty.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-r border-border bg-surface p-2 text-left"
              >
                <span className="block font-medium">{duty.label}</span>
                <span className="text-xs font-normal text-subtle">
                  {FAMILY_META[duty.family].label} ·{" "}
                  <span title={WEIGHT_TITLE}>weight {duty.riskWeight} of 5</span>
                </span>
              </th>
              {shownPeople.map((person) => {
                const active = person.entitlements.includes(duty.id);
                const conflict = conflictKeys.has(`${person.personId}:${duty.id}`);
                return (
                  <td key={person.personId} className="border-b border-border p-1 text-center">
                    <span
                      role="img"
                      aria-label={`${person.personName} ${active ? "holds" : "does not hold"} ${duty.label}${conflict ? "; part of a duty conflict" : ""}`}
                      className={cn(
                        "mx-auto flex size-8 items-center justify-center rounded-md border text-sm",
                        conflict
                          ? "border-danger bg-danger/20 text-danger"
                          : active
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-transparent text-transparent",
                      )}
                      title={`${person.personName} · ${duty.label}${conflict ? " · duty conflict" : ""}`}
                    >
                      {conflict ? "!" : active ? "✓" : ""}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
