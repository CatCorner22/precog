import { useMemo, type ReactNode } from "react";
import {
  PracticeContextPublisher,
  type PracticeActions,
  type PracticeState,
  type PracticeSync,
} from "./practice-context";
import { resolveTemplate } from "./active-template";
import { normalizeProfile, summarizeBusiness, type PracticeProfile } from "./practice-profile";
import { isMapCustomized } from "./profile-actions";

/**
 * The same context the screens read, over a frozen profile: a locked report
 * version or a past revision. Every action is a no-op, so any component that
 * renders under it shows the business as it stood without being able to
 * change it. Nothing here touches storage or the account.
 */
export function ReadOnlyPracticeProvider({
  profile,
  children,
}: {
  profile: PracticeProfile;
  children: ReactNode;
}) {
  const state = useMemo<PracticeState>(() => {
    const frozen = normalizeProfile(profile);
    return {
      profile: frozen,
      ready: true,
      template: resolveTemplate(frozen),
      mapCustomized: isMapCustomized(frozen),
      setupReturnsTo: null,
      businesses: [summarizeBusiness(frozen)],
      switchingBusiness: false,
      canUndoMap: false,
      canRedoMap: false,
    };
  }, [profile]);
  return (
    <PracticeContextPublisher state={state} actions={READ_ONLY_ACTIONS} sync={READ_ONLY_SYNC}>
      {children}
    </PracticeContextPublisher>
  );
}

const noop = () => undefined;
const asyncNoop = async () => undefined;

const READ_ONLY_SYNC: PracticeSync = {
  syncStatus: "local",
  saveConflict: null,
  resolveSaveConflict: asyncNoop,
};

const READ_ONLY_ACTIONS: PracticeActions = {
  setPracticeName: noop,
  setIndustry: noop,
  setStaff: noop,
  setRiskVariables: noop,
  setDualRelease: noop,
  addDecision: noop,
  removeDecision: noop,
  reviewDecision: noop,
  replaceProfile: noop,
  setMonthlyReviews: noop,
  setAccessReconciliation: noop,
  markReportSent: noop,
  resetProfile: noop,
  completeOnboarding: noop,
  startOwnBusiness: noop,
  confirmLeaverAccess: noop,
  markLeaverPrompted: noop,
  cancelSetup: asyncNoop,
  setCustomProcesses: noop,
  setCustomPeople: noop,
  setCustomKnowledge: noop,
  setCustomRelations: noop,
  setPlannedAbsences: noop,
  setPlaces: noop,
  saveProcedure: () => false,
  verifyProcedure: noop,
  removeProcedure: noop,
  recordProcedureProof: noop,
  resetSegregationToDerived: noop,
  setMapLayout: noop,
  setSavedProcessBlocks: noop,
  recordMapHealth: noop,
  undoMap: noop,
  redoMap: noop,
  saveMapVersion: () => {
    throw new Error("This view is read-only");
  },
  deleteMapVersion: noop,
  restoreMapVersion: noop,
  switchBusiness: async () => ({ ok: false, reason: "This view is read-only" }),
  createBusiness: () => ({ ok: false, reason: "This view is read-only" }),
  deleteBusiness: asyncNoop,
};
