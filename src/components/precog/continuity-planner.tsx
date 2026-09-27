import {
  DependenceCard,
  LeavingTeamCard,
  OutTomorrowCard,
  PlannedLeaveCard,
} from "@/components/precog/continuity/planner-panels";
import { PlannerRegisterBanners, PlannerStats } from "@/components/precog/continuity/planner-stats";
import { PlannerRegisterCard } from "@/components/precog/continuity/planner-register-card";
import {
  CheckInCard,
  CheckInDropsCard,
  CrossTrainingPlanCard,
  DocumentationPlanCard,
  SelectedKnowledgeCard,
} from "@/components/precog/continuity/planner-register-panels";
import { useContinuityPlanner } from "@/components/precog/continuity/use-continuity-planner";

/** The Who knows what tab: the register, the plans built from it, and absence planning. */
export function ContinuityPlanner({ initialKnowledgeId }: { initialKnowledgeId?: string | null }) {
  const p = useContinuityPlanner(initialKnowledgeId);
  const select = p.register.select;

  return (
    <div className="space-y-4">
      <PlannerStats
        registerAssessed={p.registerAssessed}
        report={p.report}
        docs={p.docs}
        figures={p.figures}
      />

      <PlannerRegisterBanners register={p.register} industry={p.industry} tpl={p.tpl} />

      <PlannerRegisterCard
        register={p.register}
        report={p.report}
        tpl={p.tpl}
        trackFreshness={p.trackFreshness}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <CrossTrainingPlanCard
            registerAssessed={p.registerAssessed}
            report={p.report}
            journal={p.journal}
            onSelect={select}
          />
          <DocumentationPlanCard docs={p.docs} journal={p.journal} onSelect={select} />
          <CheckInCard checkIn={p.checkIn} trackFreshness={p.trackFreshness} />
          <CheckInDropsCard
            checkIn={p.checkIn}
            trackFreshness={p.trackFreshness}
            journal={p.journal}
          />
        </div>

        <div className="space-y-4">
          <SelectedKnowledgeCard register={p.register} trackFreshness={p.trackFreshness} />
          <OutTomorrowCard
            whatIf={p.whatIf}
            people={p.people}
            registerAssessed={p.registerAssessed}
            journal={p.journal}
            onSelect={select}
          />
          <PlannedLeaveCard
            leave={p.leave}
            people={p.people}
            tpl={p.tpl}
            today={p.today}
            journal={p.journal}
            onSelect={select}
          />
          <LeavingTeamCard
            leaving={p.leaving}
            today={p.today}
            journal={p.journal}
            onSelect={select}
          />
          <DependenceCard registerAssessed={p.registerAssessed} report={p.report} />
        </div>
      </div>
    </div>
  );
}
