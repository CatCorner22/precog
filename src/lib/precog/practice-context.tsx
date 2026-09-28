/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  identityLockReason,
  subscribeIdentity,
  type IdentityLock,
} from "@/lib/auth/identity-change";
import { ACCOUNT_CHANGED_MESSAGE } from "@/lib/auth/expected-account";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
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
import type { AccessReconciliation } from "./firm/reconcile";
import type { IndustryId } from "./industry";
import { confirmedControlIds, controlsInPlace, resolveTemplate } from "./active-template";
import type { IndustryTemplate } from "./templates";
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
import type { ReviewRecord } from "./firm/reviews";
import { profileReducer } from "./profile-reducer";
import { useMapHistory } from "./use-map-history";
import { useCloudSync, type SaveConflictReason, type SyncStatus } from "./use-cloud-sync";
import { usePortfolio, type SwitchResult } from "./use-portfolio";
import { DEFAULT_BUSINESS_ID } from "./business-id";
import {
  currentPeople,
  isMapCustomized,
  makeMapVersion,
  resolveUpdate,
  withAccessReconciliation,
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

export type { SyncStatus };

/**
 * The context is published in three parts so a component subscribes only to
 * what it reads: the working state (changes on every edit), the actions
 * (stable), and the sync state (changes as saves land). `usePractice()`
 * merges them for callers that read across all three.
 */
type PracticeContextValue = PracticeState & PracticeActions & PracticeSync;

/** The working state of the open business and what derives from it. */
export interface PracticeState {
  profile: PracticeProfile;
  ready: boolean;
  /** Industry template with this profile's custom people/processes applied. */
  template: IndustryTemplate;
  /** True when the process map differs from the industry template. */
  mapCustomized: boolean;
  /** The business to go back to from setup; null on a first visit. */
  setupReturnsTo: BusinessSummary | null;
  /** Multi-business portfolio (advisors, multi-location owners). */
  businesses: BusinessSummary[];
  switchingBusiness: boolean;
  canUndoMap: boolean;
  canRedoMap: boolean;
}

/** Whether the open business is saved, and the conflict waiting on the owner, if any. */
export interface PracticeSync {
  syncStatus: SyncStatus;
  saveConflict: { remoteUpdatedAt: string; reason: SaveConflictReason } | null;
  resolveSaveConflict: (choice: "reload" | "overwrite") => Promise<void>;
}

/** Every way of changing the business. */
export interface PracticeActions {
  setPracticeName: (name: string) => void;
  setIndustry: (industry: IndustryId) => void;
  setStaff: (staff: SetStateAction<StaffComposition>) => void;
  setRiskVariables: (v: SetStateAction<RiskVariableState>) => void;
  setDualRelease: (v: SetStateAction<DualReleasePolicy>) => void;
  addDecision: (input: DecisionInput) => void;
  removeDecision: (id: string) => void;
  reviewDecision: (
    id: string,
    outcome: DecisionReviewOutcome,
    note?: string,
    extendDays?: number,
  ) => void;
  /**
   * Swaps in a whole business (a restored snapshot, a past version) and
   * clears map undo. Never for changing one field: use the narrow action.
   */
  replaceProfile: (profile: PracticeProfile) => void;
  /** Monthly close: replace the list of results (value or updater). */
  setMonthlyReviews: (v: SetStateAction<ReviewRecord[]>) => void;
  /** The user and vendor export compared with the duty map (value or updater); keeps map undo. */
  setAccessReconciliation: (v: SetStateAction<AccessReconciliation | undefined>) => void;
  /** The owner sent the report; the first stamp is kept. */
  markReportSent: () => void;
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
  /** Procedures tab: the software platforms and physical places procedures are done in. */
  setPlaces: (v: SetStateAction<Place[]>) => void;
  /**
   * Procedures tab: save a procedure (a change to its steps clears its
   * verification). False, and nothing saved, when it would not fit.
   */
  saveProcedure: (next: Procedure) => boolean;
  /** Procedures tab: record that `verifiedBy` (a person id, or "owner") confirmed the steps today. */
  verifyProcedure: (id: string, verifiedBy: string) => void;
  removeProcedure: (id: string) => void;
  /** Procedures tab: record that someone other than the usual person followed procedure `id`. */
  recordProcedureProof: (id: string, proof: Omit<ProcedureProof, "id">) => void;
  resetSegregationToDerived: () => void;
  /** Map builder: pin canvas positions for process nodes. */
  setMapLayout: (v: SetStateAction<Record<string, { x: number; y: number }>>) => void;
  /** Save or replace user-defined reusable process blocks. */
  setSavedProcessBlocks: (v: SetStateAction<SavedProcessBlock[]>) => void;
  /** Append a map health snapshot when the score changes (deduped, capped). */
  recordMapHealth: (score: number) => void;
  /** Map builder undo/redo over processes + team edits. */
  undoMap: () => void;
  redoMap: () => void;
  /** Named map snapshots. */
  saveMapVersion: (name: string, healthScore: number) => MapVersion;
  deleteMapVersion: (id: string) => void;
  restoreMapVersion: (id: string) => void;
  /** Opens another business; when it cannot, says why. */
  switchBusiness: (id: string) => Promise<SwitchResult>;
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
}

/**
 * The working state of the open business and every way of changing it. The
 * provider composes three hooks — map undo/redo, saving (local, portfolio,
 * account, other tabs), and the portfolio of businesses — and wraps the pure
 * profile edits in `./profile-actions` as state updates.
 */
export function PracticeProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const lock = useSyncExternalStore(subscribeIdentity, identityLockReason, () => null);
  if (isPending || lock)
    return (
      <main className="p-6">
        <p role="status">{lock ? IDENTITY_LOCK_TEXT[lock] : "Checking your account…"}</p>
        {(lock === "other-tab" || lock === "changed") && (
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Reload
          </button>
        )}
      </main>
    );
  const accountId = user?.id ?? null;
  return (
    <WorkspaceProvider key={accountId ?? "guest"} accountId={accountId}>
      <AccountPracticeProvider>{children}</AccountPracticeProvider>
    </WorkspaceProvider>
  );
}

/** This tab's own sign-in or sign-out needs no reload; another tab's change does. */
const IDENTITY_LOCK_TEXT: Record<IdentityLock, string> = {
  "signing-in": "Signing you in…",
  "signing-out": "Signing you out…",
  "other-tab": "Another tab is signing in or out. This page continues when it finishes.",
  changed: ACCOUNT_CHANGED_MESSAGE,
};

/** Publishes the three parts as three contexts (also used by the read-only provider). */
export function PracticeContextPublisher({
  state,
  actions,
  sync,
  children,
}: {
  state: PracticeState;
  actions: PracticeActions;
  sync: PracticeSync;
  children: ReactNode;
}) {
  return (
    <PracticeStateContext.Provider value={state}>
      <PracticeActionsContext.Provider value={actions}>
        <PracticeSyncContext.Provider value={sync}>{children}</PracticeSyncContext.Provider>
      </PracticeActionsContext.Provider>
    </PracticeStateContext.Provider>
  );
}

/** The working state: profile, template and what derives from them. Re-renders on every edit. */
export function usePracticeState(): PracticeState {
  return required(useContext(PracticeStateContext), "usePracticeState");
}

/** The active profile's industry template with its custom people and processes applied. */
export function useTemplate(): IndustryTemplate {
  return usePracticeState().template;
}

/** Every way of changing the business. Stable, so a control that only edits never re-renders on edits. */
export function usePracticeActions(): PracticeActions {
  return required(useContext(PracticeActionsContext), "usePracticeActions");
}

/** Whether the open business is saved, and the conflict waiting on the owner, if any. */
export function usePracticeSync(): PracticeSync {
  return required(useContext(PracticeSyncContext), "usePracticeSync");
}

/** All three parts in one object, for components that read across them. */
export function usePractice(): PracticeContextValue {
  const state = usePracticeState();
  const actions = usePracticeActions();
  const sync = usePracticeSync();
  return useMemo(() => ({ ...state, ...actions, ...sync }), [state, actions, sync]);
}

const PracticeStateContext = createContext<PracticeState | null>(null);
const PracticeActionsContext = createContext<PracticeActions | null>(null);
const PracticeSyncContext = createContext<PracticeSync | null>(null);

function AccountPracticeProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const workspace = useWorkspace();
  const userId = user?.id;
  const userIsDevFallback = user?.isDevFallback;
  const [profile, setProfile] = useReducer(profileReducer, undefined, defaultProfile);
  const [ready, setReady] = useState(false);
  const [switchingBusiness, setSwitchingBusiness] = useState(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  // This browser's copy of the open business, shared by every tab.
  const [localStore] = useState(() => new LocalProfileStore(() => workspace.local));
  // The versions this tab builds on, so an account save made from another
  // tab of the same version is not mistaken for a change on another device.
  const [lineage] = useState(() => new AccountLineage());

  const history = useMapHistory(profileRef, setProfile);
  const { pushUndo, clearHistory, undoMap, redoMap, canUndoMap, canRedoMap } = history;

  /** Swap the whole active business — template, overrides, history, profile. */
  const activateProfile = useCallback(
    (next: PracticeProfile) => {
      clearHistory();
      lineage.start(next.businessId ?? DEFAULT_BUSINESS_ID, next.updatedAt);
      setProfile({ load: next });
    },
    [lineage, clearHistory],
  );

  const cloud = useCloudSync({
    workspace,
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

  const {
    businesses,
    switchBusiness,
    createBusiness,
    deleteBusiness,
    setupReturnsTo,
    cancelSetup,
    completeOnboarding,
    startOwnBusiness,
  } = usePortfolio({
    workspace,
    profile,
    profileRef,
    setProfile,
    activateProfile,
    clearHistory,
    localStore,
    cloudUser: cloud.cloudUser,
    cloudRevision: cloud.cloudRevision,
    saveConflictRef: cloud.saveConflictRef,
    flushLocal: cloud.flushLocal,
    flushActive: cloud.flushActive,
    openedFromAccount: cloud.openedFromAccount,
    remoteBusinesses: cloud.remoteBusinesses,
    setRemoteBusinesses: cloud.setRemoteBusinesses,
    portfolioVersion: cloud.portfolioVersion,
    bumpPortfolio: cloud.bumpPortfolio,
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

  const removeDecision = useCallback((id: string) => {
    setProfile((p) => withoutDecision(p, id));
  }, []);

  const reviewDecision = useCallback(
    (id: string, outcome: DecisionReviewOutcome, note?: string, extendDays = 90) => {
      setProfile((p) => withDecisionReview(p, id, outcome, note, extendDays, new Date()));
    },
    [],
  );

  const confirmLeaverAccess = useCallback((checkIds: string[]) => {
    if (checkIds.length === 0) return;
    setProfile((p) => withLeaversConfirmed(p, checkIds, localDateKey(new Date())));
  }, []);

  const markLeaverPrompted = useCallback((checkIds: string[]) => {
    if (checkIds.length === 0) return;
    setProfile((p) => withLeaversPrompted(p, checkIds));
  }, []);

  const replaceProfile = useCallback(
    (next: PracticeProfile) => {
      clearHistory();
      setProfile(normalizeProfile(next));
    },
    [clearHistory],
  );

  const setMonthlyReviews = useCallback((v: SetStateAction<ReviewRecord[]>) => {
    setProfile((p) => withMonthlyReviews(p, resolveUpdate(v, p.monthlyReviews ?? [])));
  }, []);

  const setAccessReconciliation = useCallback(
    (v: SetStateAction<AccessReconciliation | undefined>) => {
      setProfile((p) => {
        const next = resolveUpdate(v, p.accessReconciliation);
        return next ? withAccessReconciliation(p, next) : p;
      });
    },
    [],
  );

  const markReportSent = useCallback(() => {
    setProfile((p) => withReportSent(p, new Date()));
  }, []);

  const resetProfile = useCallback(() => {
    clearHistory();
    setProfile((p) => ({ ...defaultProfile(p.industry), businessId: p.businessId }));
  }, [clearHistory]);

  const setCustomPeople = useCallback(
    (v: Person[] | null | ((current: Person[]) => Person[] | null)) => {
      pushUndo();
      // Told once, outside the update: the owner's people replacing the sample's.
      const before = profileRef.current;
      if (replacesSampleTeam(before, resolveUpdate(v, currentPeople(before)))) {
        toast("Your team replaced the sample team", {
          description:
            "The sample's supplier waiver and its who-holds-it marks are gone. Name your business in the business menu.",
        });
      }
      setProfile((p) =>
        withPeople(p, resolveUpdate(v, currentPeople(p)), localDateKey(new Date())),
      );
    },
    [pushUndo],
  );

  const setCustomProcesses = useCallback(
    (v: ProcessNode[] | null | ((current: ProcessNode[]) => ProcessNode[] | null)) => {
      pushUndo();
      setProfile((p) => withProcesses(p, resolveUpdate(v, processesToEdit(p))));
    },
    [pushUndo],
  );

  const setCustomKnowledge = useCallback(
    (v: KnowledgeItem[] | null | ((current: KnowledgeItem[]) => KnowledgeItem[] | null)) => {
      setProfile((p) => withKnowledge(p, resolveUpdate(v, resolveTemplate(p).knowledge)));
    },
    [],
  );

  const setCustomRelations = useCallback(
    (
      v:
        KnowledgeRelation[] | null | ((current: KnowledgeRelation[]) => KnowledgeRelation[] | null),
    ) => {
      setProfile((p) => withRelations(p, resolveUpdate(v, resolveTemplate(p).relations)));
    },
    [],
  );

  const setPlannedAbsences = useCallback((v: SetStateAction<PlannedAbsence[]>) => {
    setProfile((p) => withPlannedAbsences(p, resolveUpdate(v, p.plannedAbsences ?? [])));
  }, []);

  const setPlaces = useCallback((v: SetStateAction<Place[]>) => {
    setProfile((p) => withPlaces(p, resolveUpdate(v, p.places ?? [])));
  }, []);

  const saveProcedure = useCallback((next: Procedure) => {
    if (!procedureFits(profileRef.current, next)) return false;
    setProfile((p) => withProcedure(p, next, localDateKey(new Date())));
    return true;
  }, []);

  const verifyProcedure = useCallback((id: string, verifiedBy: string) => {
    setProfile((p) => withProcedureVerified(p, id, verifiedBy, localDateKey(new Date())));
  }, []);

  const recordProcedureProof = useCallback((id: string, proof: Omit<ProcedureProof, "id">) => {
    setProfile((p) => withProcedureProof(p, id, proof));
  }, []);

  const removeProcedure = useCallback((id: string) => {
    setProfile((p) => withoutProcedure(p, id));
  }, []);

  const resetSegregationToDerived = useCallback(() => {
    setProfile((p) => withDerivedSegregation(p));
  }, []);

  const setMapLayout = useCallback(
    (v: SetStateAction<Record<string, { x: number; y: number }>>) => {
      pushUndo();
      setProfile((p) => withMapLayout(p, resolveUpdate(v, p.mapLayout ?? {})));
    },
    [pushUndo],
  );

  const setSavedProcessBlocks = useCallback((v: SetStateAction<SavedProcessBlock[]>) => {
    setProfile((p) => withSavedBlocks(p, resolveUpdate(v, p.savedProcessBlocks ?? [])));
  }, []);

  const recordMapHealth = useCallback((score: number) => {
    // Derived from the map, not an owner's edit: it must not stamp updatedAt.
    setProfile({ derive: (p) => withMapHealth(p, score, new Date()) });
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
      setProfile((p) => withRestoredVersion(p, v, localDateKey(new Date())));
    },
    [pushUndo],
  );

  // ── Published parts ──────────────────────────────────────────────────────

  const actions = useMemo<PracticeActions>(
    () => ({
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
      markReportSent,
      resetProfile,
      completeOnboarding,
      startOwnBusiness,
      confirmLeaverAccess,
      markLeaverPrompted,
      cancelSetup,
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
      resetSegregationToDerived,
      setMapLayout,
      setSavedProcessBlocks,
      recordMapHealth,
      undoMap,
      redoMap,
      saveMapVersion,
      deleteMapVersion,
      restoreMapVersion,
      switchBusiness,
      createBusiness,
      deleteBusiness,
    }),
    [
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
      markReportSent,
      resetProfile,
      completeOnboarding,
      startOwnBusiness,
      confirmLeaverAccess,
      markLeaverPrompted,
      cancelSetup,
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
      resetSegregationToDerived,
      setMapLayout,
      setSavedProcessBlocks,
      recordMapHealth,
      undoMap,
      redoMap,
      saveMapVersion,
      deleteMapVersion,
      restoreMapVersion,
      switchBusiness,
      createBusiness,
      deleteBusiness,
    ],
  );

  const template = useActiveTemplate(profile);
  const mapCustomized = isMapCustomized(profile);
  const state = useMemo<PracticeState>(
    () => ({
      profile,
      ready,
      template,
      mapCustomized,
      setupReturnsTo,
      businesses,
      switchingBusiness,
      canUndoMap,
      canRedoMap,
    }),
    [
      profile,
      ready,
      template,
      mapCustomized,
      setupReturnsTo,
      businesses,
      switchingBusiness,
      canUndoMap,
      canRedoMap,
    ],
  );

  const { saveConflict, resolveSaveConflict, syncStatus } = cloud;
  const sync = useMemo<PracticeSync>(
    () => ({
      syncStatus,
      saveConflict: saveConflict
        ? { remoteUpdatedAt: saveConflict.updatedAt, reason: saveConflict.reason }
        : null,
      resolveSaveConflict,
    }),
    [syncStatus, saveConflict, resolveSaveConflict],
  );

  return (
    <PracticeContextPublisher state={state} actions={actions} sync={sync}>
      {children}
    </PracticeContextPublisher>
  );
}

/**
 * The template every engine reads. Keyed on the confirmed control ids, not
 * the whole journal, so an unrelated journal entry does not rebuild it.
 */
function useActiveTemplate(profile: PracticeProfile): IndustryTemplate {
  const { industry, customProcesses, customPeople, customKnowledge, customRelations, procedures } =
    profile;
  const confirmedControlsKey = confirmedControlIds(profile.decisions, industry).join("|");
  const controlsInPlaceKey = JSON.stringify(controlsInPlace(profile.decisions, industry));
  return useMemo(
    () =>
      resolveTemplate({
        industry,
        customProcesses,
        customPeople,
        customKnowledge,
        customRelations,
        confirmedControlIds: confirmedControlsKey ? confirmedControlsKey.split("|") : [],
        controlsInPlace: JSON.parse(controlsInPlaceKey) as Record<string, string[]>,
        procedures,
      }),
    [
      industry,
      customProcesses,
      customPeople,
      customKnowledge,
      customRelations,
      confirmedControlsKey,
      controlsInPlaceKey,
      procedures,
    ],
  );
}

function required<T>(value: T | null, hook: string): T {
  if (!value) throw new Error(`${hook} requires PracticeProvider`);
  return value;
}
