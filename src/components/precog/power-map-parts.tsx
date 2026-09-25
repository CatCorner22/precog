import { ArrowRight, Users } from "lucide-react";
import { ENTITLEMENTS, type EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { type DetectedConflict, type RoleAssignment } from "@/lib/precog/sod/detect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildResolutionPlans, type ResolutionPlan } from "@/lib/precog/sod/resolution-planner";
import { type CoveragePlan } from "@/lib/precog/sod/coverage-planner";
import { locationText } from "@/lib/precog/person-location";
import { FAMILY_META, withPlaces } from "./power-map-graph";

export function ResponsibilityMatrix({
  assignments,
  conflicts,
  conflictsOnly,
  processId,
  placesOf,
  onToggle,
}: {
  assignments: RoleAssignment[];
  conflicts: DetectedConflict[];
  conflictsOnly: boolean;
  processId: string;
  placesOf: ReadonlyMap<string, string[]>;
  onToggle: (personId: string, entitlement: EntitlementId) => void;
}) {
  const conflictKeys = new Set(
    conflicts.flatMap((item) => [
      `${item.personId}:${item.entitlementA}`,
      `${item.personId}:${item.entitlementB}`,
    ]),
  );
  const conflictedPeople = new Set(conflicts.map((item) => item.personId));
  const conflictedDuties = new Set(
    conflicts.flatMap((item) => [item.entitlementA, item.entitlementB]),
  );
  const shownPeople = conflictsOnly
    ? assignments.filter((item) => conflictedPeople.has(item.personId))
    : assignments;
  const duties = ENTITLEMENTS.filter(
    (item) =>
      item.id !== "view_reports_only" &&
      (!conflictsOnly || conflictedDuties.has(item.id)) &&
      (processId === "all" || item.processIds.includes(processId)),
  );
  return (
    <div className="max-h-[720px] overflow-auto rounded-xl border border-border bg-bg">
      <table className="min-w-max border-separate border-spacing-0 text-xs">
        <caption className="sr-only">
          Responsibility assignment matrix. Rows are duties and columns are people. Select a cell to
          add or remove an assignment.
        </caption>
        <thead className="sticky top-0 z-20 bg-surface">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-30 min-w-64 border-b border-r border-border bg-surface p-3 text-left"
            >
              Power / duty
            </th>
            {shownPeople.map((person) => (
              <th
                key={person.personId}
                scope="col"
                className="h-36 w-16 border-b border-border p-2 align-bottom"
              >
                <span
                  className="block max-w-32 -rotate-45 origin-bottom-left whitespace-nowrap text-left font-medium text-muted"
                  title={`${person.personName} · ${withPlaces(person.role, placesOf.get(person.personId))}`}
                >
                  {person.personName}
                  {placesOf.has(person.personId) && (
                    <span className="block text-[10px] font-normal text-subtle">
                      {locationText(placesOf.get(person.personId) ?? [])}
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
                  {FAMILY_META[duty.family].label} · risk {duty.riskWeight}/5
                </span>
              </th>
              {shownPeople.map((person) => {
                const active = person.entitlements.includes(duty.id);
                const conflict = conflictKeys.has(`${person.personId}:${duty.id}`);
                return (
                  <td key={person.personId} className="border-b border-border p-1 text-center">
                    <button
                      type="button"
                      aria-label={`${active ? "Remove" : "Assign"} ${duty.label} ${active ? "from" : "to"} ${person.personName}${conflict ? "; participates in a conflict" : ""}`}
                      aria-pressed={active}
                      onClick={() => onToggle(person.personId, duty.id)}
                      className={cn(
                        "mx-auto flex size-8 items-center justify-center rounded-md border text-sm",
                        conflict
                          ? "border-danger bg-danger/20 text-danger"
                          : active
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-border text-transparent hover:border-primary/40 hover:text-subtle",
                      )}
                      title={`${person.personName} · ${duty.label}${conflict ? " · conflict" : ""}`}
                    >
                      {conflict ? "!" : active ? "✓" : "+"}
                    </button>
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

export function CoverageList({
  title,
  empty,
  items,
  danger,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; label: string; detail: string }>;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</p>
        <Badge variant={items.length ? (danger ? "danger" : "warn") : "ok"}>{items.length}</Badge>
      </div>
      {items.length ? (
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-bg p-2">
              <p className="text-xs font-medium">{item.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-subtle">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ok">{empty}</p>
      )}
    </div>
  );
}

export function CoveragePlanOption({ plan, onApply }: { plan: CoveragePlan; onApply: () => void }) {
  return (
    <button
      type="button"
      onClick={onApply}
      className="rounded-lg border border-border bg-bg p-2.5 text-left hover:border-primary/50"
    >
      <span className="block text-xs font-medium">{plan.toPersonName}</span>
      <span className="block text-xs text-subtle">
        {plan.toRole} · {plan.currentWorkload} current duties
      </span>
      <span className="mt-1 block text-xs font-medium text-ok">
        +{plan.continuityGain} continuity · no new conflicts
      </span>
    </button>
  );
}

export function ImpactMetric({
  label,
  value,
  detail,
  danger,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-elevated p-3",
        danger ? "border-danger/40" : "border-ok/30",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular">{value}</p>
      <p className={cn("text-xs", danger ? "text-danger" : "text-ok")}>{detail}</p>
    </div>
  );
}

export function Metric({
  icon: Icon,
  label,
  value,
  detail,
  danger,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-3",
        danger ? "border-danger/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon className={cn("size-3.5", danger ? "text-danger" : "text-primary")} />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
      <p className="text-xs text-subtle">{detail}</p>
    </div>
  );
}

export function ConflictCard({ conflict }: { conflict: DetectedConflict }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        conflict.dualReleaseMitigated
          ? "border-ok/30 bg-ok/5"
          : conflict.severity === "critical"
            ? "border-danger/30 bg-danger/5"
            : "border-warn/30 bg-warn/5",
      )}
    >
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={
            conflict.dualReleaseMitigated
              ? "ok"
              : conflict.severity === "critical"
                ? "danger"
                : "warn"
          }
        >
          {conflict.severity} · {conflict.score}
        </Badge>
        {conflict.dualReleaseMitigated && <Badge variant="ok">dual-release mitigated</Badge>}
      </div>
      <p className="mt-2 text-sm font-medium">{conflict.title}</p>
      <p className="mt-1 text-xs text-muted">
        {conflict.labelA} × {conflict.labelB}
      </p>
      <p className="mt-1 text-xs text-subtle">{conflict.why}</p>
      <p className="mt-2 text-xs text-ok">
        Fallback: {conflict.compensatingControls.slice(0, 2).join("; ")}
      </p>
    </div>
  );
}

export function ResolutionOptions({
  assignments,
  conflict,
  onApply,
}: {
  assignments: RoleAssignment[];
  conflict: DetectedConflict;
  onApply: (plan: ResolutionPlan) => void;
}) {
  const plans = buildResolutionPlans(assignments, conflict);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">
        Clean resolution paths
      </p>
      {plans.length ? (
        plans.slice(0, 3).map((plan, index) => (
          <div
            key={plan.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-bg p-2.5"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{plan.summary}</p>
              <p className="mt-0.5 text-xs text-subtle">
                Resolves {plan.conflictsResolved} conflict{plan.conflictsResolved === 1 ? "" : "s"}{" "}
                · creates no new conflicts
                {plan.toPersonName
                  ? " · preserves duty coverage"
                  : " · verify coverage before implementation"}
              </p>
            </div>
            <Button
              size="sm"
              variant={index === 0 ? "default" : "secondary"}
              onClick={() => onApply(plan)}
            >
              Apply <ArrowRight className="size-3.5" />
            </Button>
          </div>
        ))
      ) : (
        <p className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-xs text-muted">
          No clean reassignment is available. Use an independent reviewer or the compensating
          control shown for this conflict.
        </p>
      )}
    </div>
  );
}
