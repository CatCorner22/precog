import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "./types";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import type { DualReleasePolicy } from "./controls/dual-release";
import type { AccessReconciliation } from "./firm/reconcile";
import type { IndustryId } from "./industry";
import type { IntegrationDrift } from "./integrations/qbo/model";
import { resolveTemplate } from "./active-template";
import {
  defaultProfile,
  makeDecisionId,
  normalizeProfile,
  type DecisionReviewOutcome,
  type MapVersion,
  type PlannedAbsence,
  type PracticeProfile,
} from "./practice-profile";
import type { SavedProcessBlock } from "./builder/process-blocks";
import { processesToEdit, replacesSampleTeam } from "./business-lifecycle";
import type { ReviewRecord } from "./firm/reviews";
import type { ProfileAction } from "./profile-reducer";
import type { PracticeActions } from "./practice-context";
import {
  currentPeople,
  decisionsTrimmedBy,
  decisionsTrimmedNotice,
  makeMapVersion,
  resolveUpdate,
  withAccessReconciliation,
  withIntegrationDriftSummary,
  withDecision,
  withDecisionReview,
  withDualRelease,
  withIndustry,
  withKnowledge,
  withLeaversConfirmed,
  withMapHealth,
  withMapLayout,
  withMapVersion,
  withMonthlyReviews,
  withoutDecision,
  withoutMapVersion,
  withPeople,
  withPlaces,
  withPlannedAbsences,
  withPracticeName,
  withProcedure,
  withProcedureVerified,
  withProcedureProof,
  withoutProcedure,
  procedureFits,
  withProcesses,
  withRelations,
  withReportSent,
  withRestoredVersion,
  withRiskVariables,
  withSavedBlocks,
  withStaff,
  type DecisionInput,
} from "./profile-actions";
import { localDateKey } from "./dates";
import type { Place, Procedure, ProcedureProof } from "./procedures/types";
import type { VerifyingAccount } from "./procedures/lifecycle";

/**
 * The edits of `PracticeActions`: every action that changes the open
 * business in place. The eight lifecycle and history actions (setup, undo
 * and redo, the portfolio) stay with the hooks that own them.
 */
export type ProfileEdits = Omit<
  PracticeActions,
  | "completeOnboarding"
  | "startOwnBusiness"
  | "cancelSetup"
  | "undoMap"
  | "redoMap"
  | "switchBusiness"
  | "createBusiness"
  | "deleteBusiness"
>;

/** What the edits need from the provider. */
export interface ProfileEditDeps {
  /** The profile reducer's dispatch. */
  setProfile: Dispatch<ProfileAction>;
  /** The profile as last rendered, for edits that read it outside the updater. */
  profileRef: { readonly current: PracticeProfile };
  /** Map undo: snapshot the map before an edit the builder can undo. */
  pushUndo: () => void;
  /** Map undo: drop the stacks when the whole business changes. */
  clearHistory: () => void;
}

/**
 * Each edit is the matching pure function in `./profile-actions` wrapped in a
 * state update. Built once per provider; the functions hold no state of their
 * own, so they stay stable for as long as `pushUndo` and `clearHistory` do.
 */
export function makeProfileEdits({
  setProfile,
  profileRef,
  pushUndo,
  clearHistory,
}: ProfileEditDeps): ProfileEdits {
  const setPracticeName = (name: string, businessId?: string) => {
    setProfile((p) => withPracticeName(p, name, businessId));
  };

  const setIndustry = (industry: IndustryId) => {
    clearHistory();
    setProfile((p) => withIndustry(p, industry));
  };

  const setStaff = (staff: SetStateAction<StaffComposition>) => {
    setProfile((p) => withStaff(p, resolveUpdate(staff, p.staff)));
  };

  const setRiskVariables = (v: SetStateAction<RiskVariableState>) => {
    setProfile((p) => withRiskVariables(p, resolveUpdate(v, p.riskVariables)));
  };

  const setDualRelease = (v: SetStateAction<DualReleasePolicy>) => {
    setProfile((p) => withDualRelease(p, resolveUpdate(v, p.dualRelease), new Date()));
  };

  /** Told once, outside the update: logging these entries trims older ones from the journal. */
  const noteTrimmedDecisions = (added: Parameters<typeof decisionsTrimmedBy>[1]) => {
    const dropped = decisionsTrimmedBy(profileRef.current, added);
    if (dropped > 0) toast(decisionsTrimmedNotice(dropped), { duration: Infinity });
  };

  const addDecision = (input: DecisionInput) => {
    const id = makeDecisionId();
    noteTrimmedDecisions([input]);
    setProfile((p) => withDecision(p, input, id, new Date()));
  };

  const removeDecision = (id: string) => {
    setProfile((p) => withoutDecision(p, id));
  };

  const reviewDecision = (
    id: string,
    outcome: DecisionReviewOutcome,
    note?: string,
    extendDays = 90,
  ) => {
    setProfile((p) => withDecisionReview(p, id, outcome, note, extendDays, new Date()));
  };

  const confirmLeaverAccess = (checkIds: string[]) => {
    if (checkIds.length === 0) return;
    const ids = new Set(checkIds);
    noteTrimmedDecisions(
      (profileRef.current.leaverAccessChecks ?? [])
        .filter((check) => ids.has(check.id) && !check.confirmedOn)
        .map(() => ({ kind: "remediate" as const })),
    );
    setProfile((p) => withLeaversConfirmed(p, checkIds, localDateKey(new Date())));
  };

  const replaceProfile = (next: PracticeProfile) => {
    clearHistory();
    setProfile(normalizeProfile(next));
  };

  const setMonthlyReviews = (v: SetStateAction<ReviewRecord[]>) => {
    setProfile((p) => withMonthlyReviews(p, resolveUpdate(v, p.monthlyReviews ?? [])));
  };

  const setAccessReconciliation = (v: SetStateAction<AccessReconciliation | undefined>) => {
    setProfile((p) => {
      const next = resolveUpdate(v, p.accessReconciliation);
      return next ? withAccessReconciliation(p, next) : p;
    });
  };

  const setIntegrationDriftFromQbo = (drift: IntegrationDrift | null) => {
    setProfile((p) => withIntegrationDriftSummary(p, drift));
  };

  const markReportSent = () => {
    setProfile((p) => withReportSent(p, new Date()));
  };

  const resetProfile = () => {
    clearHistory();
    setProfile((p) => ({ ...defaultProfile(p.industry), businessId: p.businessId }));
  };

  const setCustomPeople = (v: Person[] | null | ((current: Person[]) => Person[] | null)) => {
    pushUndo();
    // Told once, outside the update: the owner's people replacing the sample's.
    const before = profileRef.current;
    if (replacesSampleTeam(before, resolveUpdate(v, currentPeople(before)))) {
      toast("Your team replaced the sample team", {
        description:
          "The sample's supplier waiver and its who-holds-it marks are gone. Name your business in the business menu.",
      });
    }
    setProfile((p) => withPeople(p, resolveUpdate(v, currentPeople(p)), localDateKey(new Date())));
  };

  const setCustomProcesses = (
    v: ProcessNode[] | null | ((current: ProcessNode[]) => ProcessNode[] | null),
  ) => {
    pushUndo();
    setProfile((p) => withProcesses(p, resolveUpdate(v, processesToEdit(p))));
  };

  const setCustomKnowledge = (
    v: KnowledgeItem[] | null | ((current: KnowledgeItem[]) => KnowledgeItem[] | null),
  ) => {
    setProfile((p) => withKnowledge(p, resolveUpdate(v, resolveTemplate(p).knowledge)));
  };

  const setCustomRelations = (
    v: KnowledgeRelation[] | null | ((current: KnowledgeRelation[]) => KnowledgeRelation[] | null),
  ) => {
    setProfile((p) => withRelations(p, resolveUpdate(v, resolveTemplate(p).relations)));
  };

  const setPlannedAbsences = (v: SetStateAction<PlannedAbsence[]>) => {
    setProfile((p) => withPlannedAbsences(p, resolveUpdate(v, p.plannedAbsences ?? [])));
  };

  const setPlaces = (v: SetStateAction<Place[]>) => {
    setProfile((p) => withPlaces(p, resolveUpdate(v, p.places ?? [])));
  };

  const saveProcedure = (next: Procedure) => {
    const today = localDateKey(new Date());
    if (!procedureFits(profileRef.current, next, today)) return false;
    setProfile((p) => withProcedure(p, next, today));
    return true;
  };

  const verifyProcedure = (id: string, verifiedBy: string, account?: VerifyingAccount | null) => {
    setProfile((p) => withProcedureVerified(p, id, verifiedBy, localDateKey(new Date()), account));
  };

  const recordProcedureProof = (id: string, proof: Omit<ProcedureProof, "id">) => {
    setProfile((p) => withProcedureProof(p, id, proof));
  };

  const removeProcedure = (id: string) => {
    setProfile((p) => withoutProcedure(p, id));
  };

  const setMapLayout = (v: SetStateAction<Record<string, { x: number; y: number }>>) => {
    pushUndo();
    setProfile((p) => withMapLayout(p, resolveUpdate(v, p.mapLayout ?? {})));
  };

  const setSavedProcessBlocks = (v: SetStateAction<SavedProcessBlock[]>) => {
    setProfile((p) => withSavedBlocks(p, resolveUpdate(v, p.savedProcessBlocks ?? [])));
  };

  const recordMapHealth = (score: number) => {
    // Derived from the map, not an owner's edit: it must not stamp updatedAt.
    setProfile({ derive: (p) => withMapHealth(p, score, new Date()) });
  };

  const saveMapVersion = (name: string, healthScore: number): MapVersion => {
    const version = makeMapVersion(profileRef.current, name, healthScore);
    setProfile((p) => withMapVersion(p, version));
    return version;
  };

  const deleteMapVersion = (id: string) => {
    setProfile((p) => withoutMapVersion(p, id));
  };

  const restoreMapVersion = (id: string) => {
    const v = profileRef.current.mapVersions?.find((x) => x.id === id);
    if (!v) return;
    pushUndo();
    setProfile((p) => withRestoredVersion(p, v, localDateKey(new Date())));
  };

  return {
    setPracticeName,
    setIndustry,
    setStaff,
    setRiskVariables,
    setDualRelease,
    addDecision,
    removeDecision,
    reviewDecision,
    replaceProfile,
    setMonthlyReviews,
    setAccessReconciliation,
    setIntegrationDriftFromQbo,
    markReportSent,
    resetProfile,
    confirmLeaverAccess,
    setCustomProcesses,
    setCustomPeople,
    setCustomKnowledge,
    setCustomRelations,
    setPlannedAbsences,
    setPlaces,
    saveProcedure,
    verifyProcedure,
    removeProcedure,
    recordProcedureProof,
    setMapLayout,
    setSavedProcessBlocks,
    recordMapHealth,
    saveMapVersion,
    deleteMapVersion,
    restoreMapVersion,
  };
}
