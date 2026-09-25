/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "./types";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import type { DualReleasePolicy } from "./controls/dual-release";
import type { IndustryId } from "./industry";
import { confirmedControlIds, controlsInPlace, resolveTemplate } from "./active-template";
import type { IndustryTemplate } from "./templates";
import { localDateKey } from "./decisions/follow-through";
import {
  defaultProfile,
  makeDecisionId,
  normalizeProfile,
  type BusinessSummary,
  type DecisionReviewOutcome,
  type MapVersion,
  type PlannedAbsence,
  type PracticeProfile,
} from "./practice-profile";
import type { SavedProcessBlock } from "./builder/process-blocks";
import { processesToEdit, replacesSampleTeam } from "./business-lifecycle";
import { AccountLineage, LocalProfileStore } from "./save-conflict";
import type { Departure } from "./continuity/access-removal";
import { profileReducer } from "./profile-reducer";
import { useMapHistory } from "./use-map-history";
import { useCloudSync, type SaveConflictReason, type SyncStatus } from "./use-cloud-sync";
import { usePortfolio } from "./use-portfolio";
import {
  currentPeople,
  isMapCustomized,
  makeMapVersion,
  resolveUpdate,
  withDecision,
  withDecisionReview,
  withDerivedSegregation,
  withDualRelease,
  withIndustry,
  withKnowledge,
  withLeaversConfirmed,
  withLeaversPrompted,
  withMapHealth,
  withMapLayout,
  withMapVersion,
  withoutDecision,
  withoutMapVersion,
  withPeople,
  withPlannedAbsences,
  withPracticeName,
  withProcesses,
  withRelations,
  withRestoredVersion,
  withRiskVariables,
  withSavedBlocks,
  withStaff,
  type DecisionInput,
} from "./profile-actions";

export type { SaveConflictReason, SyncStatus };

export interface PracticeContextValue {
  profile: PracticeProfile;
  ready: boolean;
  syncStatus: SyncStatus;
  saveConflict: { remoteUpdatedAt: string; reason: SaveConflictReason } | null;
  resolveSaveConflict: (choice: "reload" | "overwrite") => Promise<void>;
  /** Industry template with this profile's custom people/processes applied. */
  template: IndustryTemplate;
  setPracticeName: (name: string) => void;
  setIndustry: (industry: IndustryId) => void;
  setStaff: (staff: SetStateAction<StaffComposition>) => void;
  setRiskVariables: (v: SetStateAction<RiskVariableState>) => void;
  setDualRelease: (v: SetStateAction<DualReleasePolicy>) => void;
  addDecision: (input: DecisionInput) => void;
  removeDecision: (id: string) => void;
  replaceProfile: (profile: PracticeProfile) => void;
  reviewDecision: (
    id: string,
    outcome: DecisionReviewOutcome,
    note?: string,
    extendDays?: number,
  ) => void;
  resetProfile: () => void;
  /** Setup dialog: load the sample as a business of its own. */
  completeOnboarding: (industry: IndustryId) => void;
  /** Setup dialog: the owner's name and people become a business of its own. */
  startOwnBusiness: (input: {
    industry: IndustryId;
    practiceName: string;
    people: Person[];
    /** People the pasted roster left out as terminated or inactive. */
    leftOut?: Departure[];
  }) => void;
  /**
   * The owner confirmed these leavers are off payroll and their logins are
   * removed: closes their checks and records each in the decisions log.
   */
  confirmLeaverAccess: (checkIds: string[]) => void;
  /** The owner has seen the prompt for these leavers; it is not shown again. */
  markLeaverPrompted: (checkIds: string[]) => void;
  /** Setup dialog: leave setup and go back to the business open before it, when there is one. */
  cancelSetup: () => Promise<void>;
  /** The business to go back to from setup; null on a first visit. */
  setupReturnsTo: BusinessSummary | null;
  /** Map builder: replace the process map (null = back to industry template). */
  setCustomProcesses: (
    v: ProcessNode[] | null | ((current: ProcessNode[]) => ProcessNode[] | null),
  ) => void;
  /** Map builder: replace the demo team with real people (null = template people). */
  setCustomPeople: (v: Person[] | null | ((current: Person[]) => Person[] | null)) => void;
  /** Continuity planner: replace the duty/task/knowledge register (null = template items). */
  setCustomKnowledge: (
    v: KnowledgeItem[] | null | ((current: KnowledgeItem[]) => KnowledgeItem[] | null),
  ) => void;
  /** Continuity planner: replace who-holds-what (null = template relations). */
  setCustomRelations: (
    v: KnowledgeRelation[] | null | ((current: KnowledgeRelation[]) => KnowledgeRelation[] | null),
  ) => void;
  /** Continuity planner: known leave (who, from, to). */
  setPlannedAbsences: (v: SetStateAction<PlannedAbsence[]>) => void;
  resetSegregationToDerived: () => void;
  /** Map builder: pin canvas positions for process nodes. */
  setMapLayout: (v: SetStateAction<Record<string, { x: number; y: number }>>) => void;
  /** True when the process map differs from the industry template. */
  mapCustomized: boolean;
  /** Save or replace user-defined reusable process blocks. */
  setSavedProcessBlocks: (v: SetStateAction<SavedProcessBlock[]>) => void;
  /** Append a map health snapshot when the score changes (deduped, capped). */
  recordMapHealth: (score: number) => void;
  /** Map builder undo/redo over processes + team edits. */
  undoMap: () => void;
  redoMap: () => void;
  canUndoMap: boolean;
  canRedoMap: boolean;
  /** Named map snapshots. */
  saveMapVersion: (name: string, healthScore: number) => MapVersion;
  deleteMapVersion: (id: string) => void;
  restoreMapVersion: (id: string) => void;
  /** Multi-business portfolio (advisors, multi-location owners). */
  businesses: BusinessSummary[];
  switchBusiness: (id: string) => Promise<void>;
  /**
   * Opens setup for a new business (its name and line of business filled
   * in). Refused, with the reason to show, while a save conflict waits for
   * the owner or when a signed-in account already holds its limit.
   */
  createBusiness: (
    industry: IndustryId,
    name?: string,
  ) => { ok: true } | { ok: false; reason: string };
  deleteBusiness: (id: string) => Promise<void>;
  switchingBusiness: boolean;
}

export const PracticeContext = createContext<PracticeContextValue | null>(null);

/**
 * The working state of the open business and every way of changing it. The
 * provider composes three hooks — map undo/redo, saving (local, portfolio,
 * account, other tabs), and the portfolio of businesses — and wraps the pure
 * profile edits in `./profile-actions` as state updates.
 */
export function PracticeProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const userIsDevFallback = user?.isDevFallback;
  const [profile, setProfile] = useReducer(profileReducer, undefined, defaultProfile);
  const [ready, setReady] = useState(false);
  const [switchingBusiness, setSwitchingBusiness] = useState(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  // This browser's copy of the open business, shared by every tab.
  const [localStore] = useState(() => new LocalProfileStore());
  // The versions this tab builds on, so an account save made from another
  // tab of the same version is not mistaken for a change on another device.
  const [lineage] = useState(() => new AccountLineage());

  const history = useMapHistory(profileRef, setProfile);
  const { pushUndo, clearHistory } = history;

  /** Swap the whole active business — template, overrides, history, profile. */
  const activateProfile = useCallback(
    (next: PracticeProfile) => {
      clearHistory();
      lineage.start(next.businessId ?? "biz_default", next.updatedAt);
      setProfile({ load: next });
    },
    [lineage, clearHistory],
  );

  const sync = useCloudSync({
    profile,
    profileRef,
    setProfile,
    ready,
    setReady,
    isPending,
    userId,
    userIsDevFallback,
    localStore,
    lineage,
    activateProfile,
    clearHistory,
  });

  const portfolio = usePortfolio({
    profile,
    profileRef,
    setProfile,
    activateProfile,
    clearHistory,
    localStore,
    cloudUser: sync.cloudUser,
    cloudRevision: sync.cloudRevision,
    saveConflictRef: sync.saveConflictRef,
    flushActive: sync.flushActive,
    remoteBusinesses: sync.remoteBusinesses,
    setRemoteBusinesses: sync.setRemoteBusinesses,
    portfolioVersion: sync.portfolioVersion,
    bumpPortfolio: sync.bumpPortfolio,
    setSwitching: setSwitchingBusiness,
  });

  // ── Edits: each is the matching pure function wrapped in a state update ──

  const setPracticeName = useCallback((name: string) => {
    setProfile((p) => withPracticeName(p, name));
  }, []);

  const setIndustry = useCallback(
    (industry: IndustryId) => {
      clearHistory();
      setProfile((p) => withIndustry(p, industry));
    },
    [clearHistory],
  );

  const setStaff = useCallback((staff: SetStateAction<StaffComposition>) => {
    setProfile((p) => withStaff(p, resolveUpdate(staff, p.staff)));
  }, []);

  const setRiskVariables = useCallback((v: SetStateAction<RiskVariableState>) => {
    setProfile((p) => withRiskVariables(p, resolveUpdate(v, p.riskVariables)));
  }, []);

  const setDualRelease = useCallback((v: SetStateAction<DualReleasePolicy>) => {
    setProfile((p) => withDualRelease(p, resolveUpdate(v, p.dualRelease), new Date()));
  }, []);

  const addDecision = useCallback((input: DecisionInput) => {
    const id = makeDecisionId();
    setProfile((p) => withDecision(p, input, id, new Date()));
  }, []);

  const confirmLeaverAccess = useCallback((checkIds: string[]) => {
    if (checkIds.length === 0) return;
    setProfile((p) => withLeaversConfirmed(p, checkIds, localDateKey(new Date())));
  }, []);

  const markLeaverPrompted = useCallback((checkIds: string[]) => {
    if (checkIds.length === 0) return;
    setProfile((p) => withLeaversPrompted(p, checkIds));
  }, []);

  const removeDecision = useCallback((id: string) => {
    setProfile((p) => withoutDecision(p, id));
  }, []);

  const reviewDecision = useCallback(
    (id: string, outcome: DecisionReviewOutcome, note?: string, extendDays = 90) => {
      setProfile((p) => withDecisionReview(p, id, outcome, note, extendDays, new Date()));
    },
    [],
  );

  const resetProfile = useCallback(() => {
    clearHistory();
    setProfile((p) => ({ ...defaultProfile(p.industry), businessId: p.businessId }));
  }, [clearHistory]);

  const setCustomPeople = useCallback(
    (v: Person[] | null | ((current: Person[]) => Person[] | null)) => {
      pushUndo();
      // Told once, outside the update: the owner's people replacing the sample's.
      const before = profileRef.current;
      const preview = typeof v === "function" ? v(currentPeople(before)) : v;
      if (replacesSampleTeam(before, preview)) {
        toast("Your team replaced the sample team", {
          description:
            "The sample's supplier waiver and its who-knows-what marks are gone. Name your business in the business menu.",
        });
      }
      setProfile((p) =>
        withPeople(p, typeof v === "function" ? v(currentPeople(p)) : v, localDateKey(new Date())),
      );
    },
    [pushUndo],
  );

  const setCustomProcesses = useCallback(
    (v: ProcessNode[] | null | ((current: ProcessNode[]) => ProcessNode[] | null)) => {
      pushUndo();
      setProfile((p) => withProcesses(p, typeof v === "function" ? v(processesToEdit(p)) : v));
    },
    [pushUndo],
  );

  const setCustomKnowledge = useCallback(
    (v: KnowledgeItem[] | null | ((current: KnowledgeItem[]) => KnowledgeItem[] | null)) => {
      setProfile((p) =>
        withKnowledge(p, typeof v === "function" ? v(resolveTemplate(p).knowledge) : v),
      );
    },
    [],
  );

  const setCustomRelations = useCallback(
    (
      v:
        KnowledgeRelation[] | null | ((current: KnowledgeRelation[]) => KnowledgeRelation[] | null),
    ) => {
      setProfile((p) =>
        withRelations(p, typeof v === "function" ? v(resolveTemplate(p).relations) : v),
      );
    },
    [],
  );

  const setPlannedAbsences = useCallback((v: SetStateAction<PlannedAbsence[]>) => {
    setProfile((p) => withPlannedAbsences(p, resolveUpdate(v, p.plannedAbsences ?? [])));
  }, []);

  const resetSegregationToDerived = useCallback(() => {
    setProfile((p) => withDerivedSegregation(p));
  }, []);

  const replaceProfile = useCallback(
    (next: PracticeProfile) => {
      clearHistory();
      setProfile(normalizeProfile(next));
    },
    [clearHistory],
  );

  const setMapLayout = useCallback(
    (v: SetStateAction<Record<string, { x: number; y: number }>>) => {
      setProfile((p) => withMapLayout(p, resolveUpdate(v, p.mapLayout ?? {})));
    },
    [],
  );

  const setSavedProcessBlocks = useCallback((v: SetStateAction<SavedProcessBlock[]>) => {
    setProfile((p) => withSavedBlocks(p, resolveUpdate(v, p.savedProcessBlocks ?? [])));
  }, []);

  const recordMapHealth = useCallback((score: number) => {
    setProfile((p) => withMapHealth(p, score, new Date()));
  }, []);

  const saveMapVersion = useCallback((name: string, healthScore: number): MapVersion => {
    const version = makeMapVersion(profileRef.current, name, healthScore);
    setProfile((p) => withMapVersion(p, version));
    return version;
  }, []);

  const deleteMapVersion = useCallback((id: string) => {
    setProfile((p) => withoutMapVersion(p, id));
  }, []);

  const restoreMapVersion = useCallback(
    (id: string) => {
      const v = profileRef.current.mapVersions?.find((x) => x.id === id);
      if (!v) return;
      pushUndo();
      setProfile((p) => withRestoredVersion(p, v));
    },
    [pushUndo],
  );

  // ── Derived ──────────────────────────────────────────────────────────────

  const { industry, customProcesses, customPeople, customKnowledge, customRelations } = profile;
  // Keyed on the confirmed ids, not the whole journal, so an unrelated entry
  // does not rebuild the template every engine reads.
  const confirmedControlsKey = confirmedControlIds(profile.decisions, industry).join("|");
  const controlsInPlaceKey = JSON.stringify(controlsInPlace(profile.decisions, industry));
  const template = useMemo(
    () =>
      resolveTemplate({
        industry,
        customProcesses,
        customPeople,
        customKnowledge,
        customRelations,
        confirmedControlIds: confirmedControlsKey ? confirmedControlsKey.split("|") : [],
        controlsInPlace: JSON.parse(controlsInPlaceKey) as Record<string, string[]>,
      }),
    [
      industry,
      customProcesses,
      customPeople,
      customKnowledge,
      customRelations,
      confirmedControlsKey,
      controlsInPlaceKey,
    ],
  );

  const mapCustomized = isMapCustomized(profile);
  const { saveConflict, resolveSaveConflict, syncStatus } = sync;
  const { canUndoMap, canRedoMap, undoMap, redoMap, historyVersion } = history;

  const value = useMemo<PracticeContextValue>(
    () => ({
      profile,
      ready,
      syncStatus,
      saveConflict: saveConflict
        ? { remoteUpdatedAt: saveConflict.updatedAt, reason: saveConflict.reason }
        : null,
      resolveSaveConflict,
      template,
      setPracticeName,
      setIndustry,
      setStaff,
      setRiskVariables,
      setDualRelease,
      addDecision,
      removeDecision,
      replaceProfile,
      reviewDecision,
      resetProfile,
      completeOnboarding: portfolio.completeOnboarding,
      startOwnBusiness: portfolio.startOwnBusiness,
      confirmLeaverAccess,
      markLeaverPrompted,
      cancelSetup: portfolio.cancelSetup,
      setupReturnsTo: portfolio.setupReturnsTo,
      setCustomProcesses,
      setCustomPeople,
      setCustomKnowledge,
      setCustomRelations,
      setPlannedAbsences,
      resetSegregationToDerived,
      setMapLayout,
      mapCustomized,
      setSavedProcessBlocks,
      recordMapHealth,
      undoMap,
      redoMap,
      canUndoMap,
      canRedoMap,
      saveMapVersion,
      deleteMapVersion,
      restoreMapVersion,
      businesses: portfolio.businesses,
      switchBusiness: portfolio.switchBusiness,
      createBusiness: portfolio.createBusiness,
      deleteBusiness: portfolio.deleteBusiness,
      switchingBusiness,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- historyVersion updates ref-backed undo state.
    [
      profile,
      ready,
      syncStatus,
      saveConflict,
      resolveSaveConflict,
      template,
      setPracticeName,
      setIndustry,
      setStaff,
      setRiskVariables,
      setDualRelease,
      addDecision,
      removeDecision,
      replaceProfile,
      reviewDecision,
      resetProfile,
      portfolio,
      confirmLeaverAccess,
      markLeaverPrompted,
      setCustomProcesses,
      setCustomPeople,
      setCustomKnowledge,
      setCustomRelations,
      setPlannedAbsences,
      resetSegregationToDerived,
      setMapLayout,
      mapCustomized,
      setSavedProcessBlocks,
      recordMapHealth,
      undoMap,
      redoMap,
      canUndoMap,
      canRedoMap,
      saveMapVersion,
      deleteMapVersion,
      restoreMapVersion,
      switchingBusiness,
      historyVersion,
    ],
  );

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice() {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error("usePractice requires PracticeProvider");
  return ctx;
}
