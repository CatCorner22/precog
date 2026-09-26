import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { type DetectedConflict, type RoleAssignment } from "@/lib/precog/sod/detect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildResolutionPlans, type ResolutionPlan } from "@/lib/precog/sod/resolution-planner";
import { type CoveragePlan } from "@/lib/precog/sod/coverage-planner";

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
        +{plan.continuityGain} duty backup · no new conflicts
      </span>
    </button>
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
  // Planning re-runs detection several times per candidate: only when the map or the conflict changes.
  const plans = useMemo(() => buildResolutionPlans(assignments, conflict), [assignments, conflict]);
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
