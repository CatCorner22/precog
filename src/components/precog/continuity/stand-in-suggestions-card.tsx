import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { CoveragePlanOption } from "@/components/precog/power-map-parts";
import { TeamLink } from "@/components/precog/team-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { usePracticeActions, usePracticeState } from "@/lib/precog/practice-context";
import { applyAssignmentsToPeople } from "@/lib/precog/sod/apply-assignments";
import { buildAssignments, type RoleAssignment } from "@/lib/precog/sod/detect";
import { seedDutyBaseline } from "@/lib/precog/sod/duty-baseline";
import { dutyStandInSuggestions } from "@/lib/precog/sod/stand-in-suggestions";
import { useWorkspace } from "@/lib/precog/workspace-context";

/**
 * Stand-in suggestions for the money duties only one person holds, on Who
 * knows what: a candidate per duty who already works in its process and
 * gains no duty conflict, or why nobody fits. Applying one writes the duty
 * to that person on Team, where Change review lists it until it is accepted.
 * Before the first change it stores today's duties as Change review's
 * baseline when none is stored yet, so Team never takes the changed duties
 * as the starting point.
 */
export function StandInSuggestionsCard() {
  const { template: tpl, profile } = usePracticeState();
  const workspace = useWorkspace();
  const { setCustomPeople } = usePracticeActions();
  const assignments = useMemo(() => buildAssignments(tpl), [tpl]);
  const { coverage, plans, program } = useMemo(
    () => dutyStandInSuggestions(assignments, tpl.id),
    [assignments, tpl.id],
  );

  function apply(next: RoleAssignment[], message: string) {
    seedDutyBaseline(workspace.local, profile.businessId, assignments);
    setCustomPeople((people) => applyAssignmentsToPeople(people, next));
    toast.success(message, {
      description: "Change review under Team lists it until you accept it.",
    });
  }

  if (plans.length === 0 && coverage.singlePoints.length === 0) return null;

  if (plans.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stand-in suggestions</CardTitle>
          <CardDescription>
            No stand-in to suggest for a money duty only one person holds. Everyone who works in
            these duties&apos; processes already holds a conflict, or would gain one by taking the
            duty on. Separate a conflict first, or write the procedure down so a stand-in or your
            outside accountant can follow it.
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
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div>
          <CardTitle>Stand-in suggestions</CardTitle>
          <CardDescription>
            For high-risk money duties only one person holds: people who already hold a duty of
            weight 4 or more in the same process and hold no conflict, where adding the duty creates
            no conflict the rules detect. Check each person can actually do the work before you
            assign it. Change review under <TeamLink>Team</TeamLink> can discard it.
          </CardDescription>
        </div>
        {program.steps.length > 1 && (
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              if (
                window.confirm(
                  `Assign all ${program.steps.length} suggested stand-ins? Check each person can do the work; Change review under Team can discard them.`,
                )
              ) {
                apply(program.nextAssignments, `Assigned ${program.steps.length} stand-ins`);
              }
            }}
          >
            <ShieldCheck className="size-3.5" />
            Assign all suggested stand-ins
          </Button>
        )}
      </CardHeader>
      {program.steps.length > 1 && (
        <CardContent className="grid gap-2 border-t border-border py-3 sm:grid-cols-3">
          <StatTile
            label="Suggested stand-ins"
            value={String(program.steps.length)}
            hint="Recalculated after each one"
            tone="ok"
          />
          <StatTile
            label="Projected stand-in cover"
            value={`${program.projectedScore}/100`}
            hint={`+${program.projectedScore - program.startingScore} points`}
            tone="ok"
          />
          <StatTile
            label="Still one holder"
            value={String(program.unresolvedGaps)}
            hint="Need someone outside, or a control"
            tone={program.unresolvedGaps > 0 ? "danger" : "ok"}
          />
        </CardContent>
      )}
      <CardContent className="space-y-3">
        {Array.from(new Set(plans.map((plan) => plan.entitlement)))
          .slice(0, 6)
          .map((entitlement) => {
            const options = plans.filter((plan) => plan.entitlement === entitlement);
            const first = options[0];
            return (
              <div
                key={entitlement}
                className="grid gap-3 rounded-xl border border-border bg-elevated p-3"
              >
                <div>
                  <Badge variant={first.reason === "unassigned" ? "danger" : "warn"}>
                    {first.reason === "unassigned" ? "Owner needed" : "Stand-in needed"}
                  </Badge>
                  <p className="mt-2 text-sm font-medium">{first.dutyLabel}</p>
                  <p className="mt-1 text-xs text-subtle">
                    Each candidate works in this duty&apos;s process already and adds no conflict
                    the rules detect.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((plan) => (
                    <CoveragePlanOption
                      key={plan.id}
                      plan={plan}
                      onApply={() =>
                        apply(
                          plan.nextAssignments,
                          `${plan.toPersonName} added for ${plan.dutyLabel}`,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
