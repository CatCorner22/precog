import { useMemo, type ReactNode } from "react";
import { PracticeContext, type PracticeContextValue } from "./practice-context";
import { resolveTemplate } from "./active-template";
import { normalizeProfile, summarizeBusiness, type PracticeProfile } from "./practice-profile";

/**
 * The same context the screens read, over a frozen profile: a locked report
 * version or a past revision. Every action is a no-op, so any component that
 * renders under it shows the business as it stood without being able to
 * change it. Nothing here touches storage or the account.
 */
const noop = () => undefined;
const asyncNoop = async () => undefined;

export function ReadOnlyPracticeProvider({
  profile,
  children,
}: {
  profile: PracticeProfile;
  children: ReactNode;
}) {
  const value = useMemo<PracticeContextValue>(() => {
    const frozen = normalizeProfile(profile);
    return {
      profile: frozen,
      ready: true,
      syncStatus: "local",
      saveConflict: null,
      resolveSaveConflict: asyncNoop,
      template: resolveTemplate(frozen),
      setPracticeName: noop,
      setIndustry: noop,
      setStaff: noop,
      setRiskVariables: noop,
      setDualRelease: noop,
      addDecision: noop,
      removeDecision: noop,
      replaceProfile: noop,
      reviewDecision: noop,
      resetProfile: noop,
      completeOnboarding: noop,
      startOwnBusiness: noop,
      confirmLeaverAccess: noop,
      markLeaverPrompted: noop,
      cancelSetup: asyncNoop,
      setupReturnsTo: null,
      setCustomProcesses: noop,
      setCustomPeople: noop,
      setCustomKnowledge: noop,
      setCustomRelations: noop,
      setPlannedAbsences: noop,
      resetSegregationToDerived: noop,
      setMapLayout: noop,
      mapCustomized: Boolean(
        frozen.customProcesses ||
        frozen.customPeople ||
        Object.keys(frozen.mapLayout ?? {}).length > 0,
      ),
      setSavedProcessBlocks: noop,
      recordMapHealth: noop,
      undoMap: noop,
      redoMap: noop,
      canUndoMap: false,
      canRedoMap: false,
      saveMapVersion: () => {
        throw new Error("This view is read-only");
      },
      deleteMapVersion: noop,
      restoreMapVersion: noop,
      businesses: [summarizeBusiness(frozen)],
      switchBusiness: asyncNoop,
      createBusiness: () => ({ ok: false, reason: "This view is read-only" }),
      deleteBusiness: asyncNoop,
      switchingBusiness: false,
    };
  }, [profile]);
  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}
