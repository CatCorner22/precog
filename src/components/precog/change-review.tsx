import { useMemo } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { applyAssignmentsToPeople } from "@/lib/precog/sod/apply-assignments";
import { diffAssignments, type AssignmentChange } from "@/lib/precog/sod/assignment-diff";
import { buildAssignments } from "@/lib/precog/sod/detect";
import { UNREADABLE_BASELINE_MESSAGE } from "@/lib/precog/sod/duty-baseline";
import { useDutyBaseline } from "./use-duty-baseline";
import { count } from "@/lib/precog/text";
import { cn } from "@/lib/utils";

/**
 * Change review on Team: every grant, removal, hire and departure since the
 * owner last accepted the team's duties, with Accept and Discard.
 */
export function ChangeReviewCard() {
  const tpl = useTemplate();
  const { profile, setCustomPeople } = usePractice();
  const assignments = useMemo(() => buildAssignments(tpl), [tpl]);
  const { baseline, acceptBaseline } = useDutyBaseline(assignments, profile.businessId);
  // An unreadable stored baseline lists no changes and says so: today's
  // duties are not the accepted ones, and Discard has nothing to go back to.
  const pendingChanges = useMemo(
    () => (baseline ? diffAssignments(baseline, assignments) : []),
    [baseline, assignments],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Change review</CardTitle>
          <CardDescription>
            What changed since you last accepted the team&apos;s duties. Accept it as the new
            baseline, or discard it.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const count = pendingChanges.length;
              if (
                window.confirm(
                  `Discard ${count} pending change${count === 1 ? "" : "s"} and go back to the duties you last accepted? You cannot undo this.`,
                )
              ) {
                if (baseline)
                  setCustomPeople((people) => applyAssignmentsToPeople(people, baseline));
              }
            }}
            disabled={!pendingChanges.length}
          >
            <RotateCcw className="size-3.5" />
            Discard
          </Button>
          <Button
            size="sm"
            onClick={() => acceptBaseline(assignments)}
            disabled={baseline !== undefined && !pendingChanges.length}
          >
            <Check className="size-3.5" />
            Accept baseline
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!baseline ? (
          <p className="text-sm text-warn">{UNREADABLE_BASELINE_MESSAGE}</p>
        ) : pendingChanges.length ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant="accent">{pendingChanges.length} pending</Badge>
              {changeCounts(pendingChanges).map((label) => (
                <Badge key={label}>{label}</Badge>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pendingChanges.slice(0, 12).map((change) => (
                <div key={change.id} className="rounded-lg border border-border bg-elevated p-2.5">
                  <p className="text-xs font-medium">{change.personName}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-xs",
                      change.kind === "duty_granted" || change.kind === "person_added"
                        ? "text-primary"
                        : "text-warn",
                    )}
                  >
                    {CHANGE_LABEL[change.kind]} {change.dutyLabel ?? change.role}
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
            No pending changes. The team&apos;s duties match the accepted baseline.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Change review's verb for each kind of change: "Removes Reconcile the bank account". */
const CHANGE_LABEL: Record<AssignmentChange["kind"], string> = {
  duty_granted: "Adds",
  duty_revoked: "Removes",
  person_added: "New person:",
  person_removed: "Left the team:",
};

/**
 * The pending changes counted in plain words, zero counts left out:
 * "2 duties added", "1 duty removed", "1 person added", "1 person left".
 */
function changeCounts(changes: readonly AssignmentChange[]): string[] {
  const of = (kind: AssignmentChange["kind"]) => changes.filter((c) => c.kind === kind).length;
  const rows: [number, string, string, string][] = [
    [of("duty_granted"), "duty", "duties", "added"],
    [of("duty_revoked"), "duty", "duties", "removed"],
    [of("person_added"), "person", "people", "added"],
    [of("person_removed"), "person", "people", "left"],
  ];
  return rows
    .filter(([n]) => n > 0)
    .map(([n, one, many, what]) => `${count(n, one, many)} ${what}`);
}
