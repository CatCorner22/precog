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
import { registerTemplateCsv, registerToCsv } from "@/lib/precog/import/register-csv";

export function ContinuityPlanner({ initialKnowledgeId }: { initialKnowledgeId?: string | null }) {
  const p = useContinuityPlanner(initialKnowledgeId);

  return (
    <div className="space-y-4">
      <PlannerStats
        registerReady={p.registerReady}
        report={p.report}
        docs={p.docs}
        singlePoints={p.singlePoints}
        importantSinglePoints={p.importantSinglePoints}
        mostDepended={p.mostDepended}
      />

      <PlannerRegisterBanners
        registerFrom={p.registerFrom}
        industry={p.profile.industry}
        tpl={p.tpl}
        onClearStarter={() => p.setCustomKnowledge([])}
      />

      <PlannerRegisterCard
        registerFrom={p.registerFrom}
        tpl={p.tpl}
        importIssues={p.importIssues}
        setImportIssues={p.setImportIssues}
        addItem={p.addItem}
        draftName={p.draftName}
        setDraftName={p.setDraftName}
        draftKind={p.draftKind}
        setDraftKind={p.setDraftKind}
        draftCriticality={p.draftCriticality}
        setDraftCriticality={p.setDraftCriticality}
        people={p.people}
        report={p.report}
        safeItemPage={p.safeItemPage}
        setItemPage={p.setItemPage}
        itemPages={p.itemPages}
        safePeoplePage={p.safePeoplePage}
        setPeoplePage={p.setPeoplePage}
        peoplePages={p.peoplePages}
        visiblePeople={p.visiblePeople}
        visibleItems={p.visibleItems}
        selected={p.selected}
        setSelectedId={p.setSelectedId}
        trackFreshness={p.trackFreshness}
        staleIds={p.staleIds}
        setLevel={p.setLevel}
        removeItem={p.removeItem}
        onImportCsv={p.importCsv}
        onExportCsv={() => p.downloadCsv(registerToCsv(p.tpl), "precog-who-can-do-what.csv")}
        onExportTemplate={() =>
          p.downloadCsv(registerTemplateCsv(p.tpl), "precog-register-template.csv")
        }
        onReset={p.resetToTemplate}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <CrossTrainingPlanCard
            registerReady={p.registerReady}
            report={p.report}
            setSelectedId={p.setSelectedId}
            trackedBy={p.trackedBy}
            logMove={p.logMove}
          />
          <DocumentationPlanCard
            docs={p.docs}
            setSelectedId={p.setSelectedId}
            trackedBy={p.trackedBy}
            logGap={p.logGap}
          />
          <CheckInCard
            trackFreshness={p.trackFreshness}
            freshnessStaleCount={p.freshness.stale.length}
            checkIns={p.checkIns}
            checkInView={p.checkInView}
            setCheckInChoice={p.setCheckInChoice}
            activeCheckIn={p.activeCheckIn}
            checkInSetLevel={p.checkInSetLevel}
            confirmItems={p.confirmItems}
          />
          <CheckInDropsCard
            trackFreshness={p.trackFreshness}
            checkInDrops={p.checkInDrops}
            trackedBy={p.trackedBy}
            logMove={p.logMove}
            setCheckInBaseline={p.setCheckInBaseline}
          />
        </div>

        <div className="space-y-4">
          <SelectedKnowledgeCard
            selected={p.selected}
            updateItem={p.updateItem}
            trackFreshness={p.trackFreshness}
            today={p.today}
          />

          <OutTomorrowCard
            people={p.people}
            effectiveAbsentIds={p.effectiveAbsentIds}
            setAbsentIds={p.setAbsentIds}
            registerReady={p.registerReady}
            absence={p.absence}
            setSelectedId={p.setSelectedId}
            absenceStepTracked={p.absenceStepTracked}
            logAbsenceAction={p.logAbsenceAction}
          />

          <PlannedLeaveCard
            people={p.people}
            outTodayIds={p.outTodayIds}
            markOutToday={p.markOutToday}
            leavePersonId={p.leavePersonId}
            setLeavePersonId={p.setLeavePersonId}
            leaveFrom={p.leaveFrom}
            setLeaveFrom={p.setLeaveFrom}
            leaveTo={p.leaveTo}
            setLeaveTo={p.setLeaveTo}
            leaveFormValid={p.leaveFormValid}
            addLeave={p.addLeave}
            leave={p.leave}
            leaveHistory={p.leaveHistory}
            debriefs={p.debriefs}
            debriefed={p.debriefed}
            debriefKey={p.debriefKey}
            promoteStandIn={p.promoteStandIn}
            keepTraining={p.keepTraining}
            closeDebriefItem={p.closeDebriefItem}
            markDebriefed={p.markDebriefed}
            today={p.today}
            registerReady={p.registerReady}
            removeLeave={p.removeLeave}
            stillOutTomorrow={p.stillOutTomorrow}
            backAtWork={p.backAtWork}
            setSelectedId={p.setSelectedId}
            absenceStepTracked={p.absenceStepTracked}
            logAbsenceAction={p.logAbsenceAction}
            showPastLeave={p.showPastLeave}
            setShowPastLeave={p.setShowPastLeave}
            tpl={p.tpl}
          />

          <LeavingTeamCard
            staying={p.staying}
            leaverPersonId={p.leaverPersonId}
            setLeaverPersonId={p.setLeaverPersonId}
            leaverLastDay={p.leaverLastDay}
            setLeaverLastDay={p.setLeaverLastDay}
            leaverFormValid={p.leaverFormValid}
            recordLastDay={p.recordLastDay}
            leaving={p.leaving}
            today={p.today}
            registerReady={p.registerReady}
            setSelectedId={p.setSelectedId}
            changeLastDay={p.changeLastDay}
            cancelLeaving={p.cancelLeaving}
            markAsLeft={p.markAsLeft}
            absenceStepTracked={p.absenceStepTracked}
            logAbsenceAction={p.logAbsenceAction}
          />

          <DependenceCard registerReady={p.registerReady} report={p.report} />
        </div>
      </div>
    </div>
  );
}
