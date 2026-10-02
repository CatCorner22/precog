import { useState } from "react";
import { BriefcaseBusiness } from "lucide-react";
import { AccessReconcile } from "@/components/precog/access-reconcile";
import { TeamEditor } from "@/components/precog/builder/team-editor";
import { JobCatalogSheet } from "@/components/precog/job-catalog-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePracticeActions, useTemplate } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import { tabLabel } from "@/lib/precog/navigation";

/**
 * The Team tab: who works here and which money duties each person holds,
 * edited in one place. Every other screen reads this list. The access and
 * payroll import checks it against the exports from the business's systems.
 */
export function TeamArea() {
  const tpl = useTemplate();
  const { setCustomPeople } = usePracticeActions();
  const { say } = usePresentation();
  const [showJobs, setShowJobs] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{tabLabel("team", say)}</h1>
          <p className="text-sm text-muted">
            Who works here and which money duties each person holds. Who controls what, Who knows
            what and the report all read this list.
          </p>
        </div>
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
          <JobCatalogSheet />
        </div>
      )}
      <Card>
        <CardContent className="p-4">
          <TeamEditor people={tpl.people} onChange={(next) => setCustomPeople(next)} />
        </CardContent>
      </Card>
      <AccessReconcile />
    </div>
  );
}
