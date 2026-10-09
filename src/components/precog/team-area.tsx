import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import { AccessReconcile } from "@/components/precog/access-reconcile";
import { ChangeReviewCard } from "@/components/precog/change-review";
import { TeamEditor } from "@/components/precog/builder/team-editor";
import { WorkloadView } from "@/components/precog/builder/workload-view";
import { JobCatalogSheet } from "@/components/precog/job-catalog-sheet";
import { LeaverAccessList } from "@/components/precog/leaver-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reassignOwner, undoOwnerChange } from "@/lib/precog/builder/stand-in-owner";
import { analyzeWorkload } from "@/lib/precog/builder/workload";
import { usePracticeActions, usePracticeState } from "@/lib/precog/practice-context";
import { tabLabel } from "@/lib/precog/navigation";
import { parseTeamFocus } from "@/lib/precog/start-here/layout";
import { usePresentation } from "@/lib/precog/presentation";
import { PageIntro } from "./page-intro";

/**
 * The Team tab: who works here and which money duties each person holds,
 * edited in one place. Every other screen reads this list. Under it, the
 * people who left and whose pay and sign-ins are still to check. Change review
 * shows what changed since the owner last accepted the team's duties,
 * Workload who carries the processes, and the access and payroll import
 * checks the list against the exports from the business's systems.
 */
export function TeamArea({ item = null }: { item?: string | null }) {
  const { template: tpl, profile } = usePracticeState();
  const { setCustomPeople, setCustomProcesses } = usePracticeActions();
  const navigate = useNavigate();
  const { say } = usePresentation();
  const [showJobs, setShowJobs] = useState(false);
  const focus = useMemo(() => parseTeamFocus(item), [item]);
  const workload = useMemo(
    () => analyzeWorkload(tpl, tpl.processes, tpl.people, profile.staff, profile.dualRelease),
    [tpl, profile.staff, profile.dualRelease],
  );

  function reassign(fromId: string, processId: string) {
    const change = reassignOwner(tpl, tpl.processes, fromId, processId);
    if (!change) {
      toast.error("Nobody else on the team can take this on yet.");
      return;
    }
    setCustomProcesses(change.next);
    toast.success(`${change.process.name} reassigned to ${change.person.name}`, {
      action: {
        label: "Undo",
        onClick: () => setCustomProcesses((current) => undoOwnerChange(current, change)),
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageIntro
          tab="team"
          purpose="Who works here and which money duties each person holds."
          method={
            <p>
              {tabLabel("sod", say)}, {tabLabel("knowledge", say)} and the report all read this
              list. A title from the role list brings that job&rsquo;s usual duties; change them to
              match what each person really does. When someone leaves, press &ldquo;Left the
              business&rdquo; and give their last day: their record stays in history without
              counting as cover, and Precog lists their pay and sign-ins to check.
            </p>
          }
        />
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={showJobs}
          aria-controls="team-common-jobs"
          onClick={() => setShowJobs((v) => !v)}
        >
          <BriefcaseBusiness className="size-4" aria-hidden />
          Add a common job
        </Button>
      </div>
      {showJobs && (
        <div id="team-common-jobs" className="space-y-2">
          <p className="text-sm text-muted">
            Pick a title from the role list below to add people with that job&rsquo;s usual duties,
            then change the duties to match what each person really does.
          </p>
          <JobCatalogSheet defaultOpen />
        </div>
      )}
      <Card>
        <CardContent className="p-4">
          <TeamEditor
            people={tpl.people}
            onChange={(next) => setCustomPeople(next)}
            focus={focus}
          />
        </CardContent>
      </Card>
      <LeaverAccessList explainOnSample />
      <ChangeReviewCard />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workload</CardTitle>
          <CardDescription>
            Who carries the processes, the duties and the duty conflicts. Press a process to open it
            on the process map.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkloadView
            rows={workload}
            processCount={tpl.processes.length}
            onSelectProcess={(id) => void navigate({ to: "/", search: { tab: "map", item: id } })}
            onReassign={reassign}
          />
        </CardContent>
      </Card>
      <AccessReconcile />
    </div>
  );
}
