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
  type BusinessSummary,
  type DecisionReviewOutcome,
  type MapVersion,
  type PlannedAbsence,
  type PracticeProfile,
} from "./practice-profile";
import type { SavedProcessBlock } from "./builder/process-blocks";
import { AccountLineage, LocalProfileStore, type UnreadableCopy } from "./save-conflict";
import { downloadText } from "@/lib/download";
import type { Departure } from "./continuity/access-removal";
import type { ReviewRecord } from "./firm/reviews";
import { profileReducer } from "./profile-reducer";
import { useMapHistory } from "./use-map-history";
import { useCloudSync, type SaveConflictReason, type SyncStatus } from "./use-cloud-sync";
import { usePortfolio, type SwitchResult } from "./use-portfolio";
import { DEFAULT_BUSINESS_ID } from "./business-id";
import { isMapCustomized, type DecisionInput } from "./profile-actions";
import { makeProfileEdits } from "./practice-edits";
import { localDateKey } from "./dates";
import type { Place, Procedure, ProcedureProof } from "./procedures/types";
import type { VerifyingAccount } from "./procedures/lifecycle";

export type { SyncStatus };

/**
 * The context is published in three parts so a component subscribes only to
 * what it reads: the working state (changes on every edit), the actions
 * (stable), and the sync state (changes as saves land). `usePractice()`
 * merges the first two; the few panels that show save state also call
 * `usePracticeSync()`, so a save landing re-renders only them.
 */
type PracticeContextValue = PracticeState & PracticeActions;

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
  /** Save the open business and this browser's copies as a recovery file. */
  downloadRecovery: () => void;
}

/** Every way of changing the business. */
export interface PracticeActions {
  /**
   * Rename the open business. With `businessId`, only while that business is
   * still the open one, so a late commit never renames the business opened
   * after it.
   */
  setPracticeName: (name: string, businessId?: string) => void;
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
  /** After a QuickBooks reading, refresh the compact drift snapshot on the profile. */
  setIntegrationDriftFromQbo: (
    drift: import("./integrations/qbo/model").IntegrationDrift | null,
  ) => void;
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
  /** `account` is the signed-in account that pressed the button, recorded with the verification. */
  verifyProcedure: (id: string, verifiedBy: string, account?: VerifyingAccount | null) => void;
  removeProcedure: (id: string) => void;
  /** Procedures tab: record that someone other than the usual person followed procedure `id`. */
  recordProcedureProof: (id: string, proof: Omit<ProcedureProof, "id">) => void;
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
  createBusiness: (industry: IndustryId, name?: string) => Promise<SwitchResult>;
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

/** The state and the actions in one object; save state is `usePracticeSync()`. */
export function usePractice(): PracticeContextValue {
  const state = usePracticeState();
  const actions = usePracticeActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
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
  const [localStore] = useState(
    () =>
      new LocalProfileStore(
        () => workspace.local,
        undefined,
        // After this commit: a <Toaster> mounted in the same commit misses a toast fired now.
        (copy) => void setTimeout(() => offerUnreadableCopy(copy), 0),
      ),
  );
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
    raiseConflict: cloud.raiseConflict,
    accountTook: cloud.accountTook,
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

  const edits = useMemo(
    () => makeProfileEdits({ setProfile, profileRef, pushUndo, clearHistory }),
    [pushUndo, clearHistory],
  );

  // ── Published parts ──────────────────────────────────────────────────────

  const actions = useMemo(
    () =>
      ({
        ...edits,
        completeOnboarding,
        startOwnBusiness,
        cancelSetup,
        undoMap,
        redoMap,
        switchBusiness,
        createBusiness,
        deleteBusiness,
      }) satisfies PracticeActions,
    [
      edits,
      completeOnboarding,
      startOwnBusiness,
      cancelSetup,
      undoMap,
      redoMap,
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

  const { saveConflict, resolveSaveConflict, syncStatus, downloadRecovery } = cloud;
  const sync = useMemo<PracticeSync>(
    () => ({
      syncStatus,
      saveConflict: saveConflict
        ? { remoteUpdatedAt: saveConflict.updatedAt, reason: saveConflict.reason }
        : null,
      resolveSaveConflict,
      downloadRecovery,
    }),
    [syncStatus, saveConflict, resolveSaveConflict, downloadRecovery],
  );

  return (
    <PracticeContextPublisher state={state} actions={actions} sync={sync}>
      {children}
    </PracticeContextPublisher>
  );
}

/**
 * The business stored on this device is one this build could not read: say
 * so, and offer its text as a file. Precog keeps the copy and does not save
 * over it, so the offer stays until the owner closes it.
 */
function offerUnreadableCopy(copy: UnreadableCopy): void {
  toast.error("Precog could not open the business saved on this device", {
    id: copy.key,
    duration: Infinity,
    description: "Precog kept the saved copy and does not save over it on this device.",
    action: {
      label: "Download the unreadable copy",
      onClick: () =>
        downloadText(
          `precog-unreadable-copy-${localDateKey(new Date())}.json`,
          copy.raw,
          "application/json",
        ),
    },
  });
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
