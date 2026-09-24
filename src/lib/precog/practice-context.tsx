/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  useReducer,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type {
  KnowledgeItem,
  KnowledgeRelation,
  Person,
  ProcessNode,
  StaffComposition,
} from "./types";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import {
  mergeDualReleasePolicy,
  mitigatedSodRuleIds,
  staffFlagsFromDualRelease,
  type DualReleasePolicy,
} from "./controls/dual-release";
import { INDUSTRIES, industryMeta, type IndustryId } from "./industry";
import {
  deleteBusiness as deleteBusinessRemote,
  listBusinesses,
  loadBusiness,
  loadBusinessProfile,
  saveBusinessProfile,
} from "./profile-server";
import { confirmedControlIds, controlsInPlace, resolveTemplate } from "./active-template";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import { deriveStaffFromTeam } from "./sod/derive-staff";
import { soleOwnerCriticalCount, type ContinuityStep } from "./continuity/coverage";
import {
  applyDecisionReview,
  captureDecisionSnapshot,
  linkedKnowledgeId,
  localDateKey,
} from "./decisions/follow-through";
import {
  defaultProfile,
  ACTIVE_PROFILE_KEY,
  hasUserWork,
  loadPortfolio,
  makeBusinessId,
  makeDecisionId,
  normalizeProfile,
  removePortfolioEntry,
  savePortfolioEntry,
  summarizeBusiness,
  type BusinessSummary,
  type DecisionEntry,
  type DecisionKind,
  type DecisionReviewOutcome,
  type MapVersion,
  type PlannedAbsence,
  type PracticeProfile,
} from "./practice-profile";
import type { SavedProcessBlock } from "./builder/process-blocks";
import { removeValueProof } from "./value-proof-store";
import {
  adoptOwnTeam,
  atBusinessLimit,
  MAX_BUSINESSES_PER_ACCOUNT,
  newBusinessProfile,
  ownSetupProfile,
  processesToEdit,
  replacesSampleTeam,
  sampleSetupProfile,
  unfinishedBusinessToKeep,
} from "./business-lifecycle";
import { AccountLineage, LocalProfileStore } from "./save-conflict";
import { canKeepLocalData } from "./local-data";

export type SyncStatus =
  "idle" | "loading" | "synced" | "local" | "local-error" | "error" | "conflict";

/**
 * Why the conflict banner is up: another writer beat us to the account copy,
 * a sign-in met local work, or another tab in this browser saved this
 * business since this tab last did.
 */
export type SaveConflictReason = "remote-edit" | "sign-in" | "other-tab";

interface SaveConflictState {
  reason: SaveConflictReason;
  remote: PracticeProfile;
  /** The account copy's revision; null for another tab's copy, which has none. */
  revision: number | null;
  updatedAt: string;
}

interface PracticeContextValue {
  profile: PracticeProfile;
  ready: boolean;
  syncStatus: SyncStatus;
  saveConflict: { remoteUpdatedAt: string; reason: SaveConflictReason } | null;
  resolveSaveConflict: (choice: "reload" | "overwrite") => Promise<void>;
  /** Industry template with this profile's custom people/processes applied. */
  template: IndustryTemplate;
  setPracticeName: (name: string) => void;
  setIndustry: (industry: IndustryId) => void;
  setStaff: (staff: StaffComposition | ((s: StaffComposition) => StaffComposition)) => void;
  setRiskVariables: (v: RiskVariableState | ((r: RiskVariableState) => RiskVariableState)) => void;
  setDualRelease: (v: DualReleasePolicy | ((d: DualReleasePolicy) => DualReleasePolicy)) => void;
  addDecision: (input: {
    subject: string;
    kind: DecisionKind;
    note: string;
    reviewBy?: string;
    residualAtDecision?: number;
    linkedTab?: string;
    linkedId?: string;
    linkedStep?: ContinuityStep;
    linkedPersonId?: string;
    linkedAbsenceId?: string;
  }) => void;
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
  }) => void;
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
  setPlannedAbsences: (
    v: PlannedAbsence[] | ((current: PlannedAbsence[]) => PlannedAbsence[]),
  ) => void;
  resetSegregationToDerived: () => void;
  /** Map builder: pin canvas positions for process nodes. */
  setMapLayout: (
    v:
      | Record<string, { x: number; y: number }>
      | ((l: Record<string, { x: number; y: number }>) => Record<string, { x: number; y: number }>),
  ) => void;
  /** True when the process map differs from the industry template. */
  mapCustomized: boolean;
  /** Save or replace user-defined reusable process blocks. */
  setSavedProcessBlocks: (
    v: SavedProcessBlock[] | ((blocks: SavedProcessBlock[]) => SavedProcessBlock[]),
  ) => void;
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

const MAX_VERSIONS = 12;

/**
 * Re-derive the staff figures that depend on the register. With a real team
 * everything derivable is derived; with template people only the sole-owner
 * count moves, read from the register in use (the sample's own register
 * included), so every screen shows the same figure.
 */
function deriveContinuityStaff(p: PracticeProfile): StaffComposition {
  const tpl = resolveTemplate(p);
  if (p.customPeople) {
    return deriveStaffFromTeam(tpl, p.staff, {
      dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, tpl),
    });
  }
  return { ...p.staff, soleOwnerKnowledgeCount: soleOwnerCriticalCount(tpl) };
}

interface MapSnapshot {
  customProcesses: ProcessNode[] | null | undefined;
  customPeople: Person[] | null | undefined;
}

const MAX_UNDO = 50;
const MAX_HEALTH_POINTS = 90;

const PracticeContext = createContext<PracticeContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 1200;

type ProfileAction =
  | SetStateAction<PracticeProfile>
  | { load: PracticeProfile }
  | { adopt: PracticeProfile; ifState: PracticeProfile };

/**
 * Every edit stamps `updatedAt` in state, not only in localStorage, so the
 * sign-in merge compares the real time of the last local edit against the
 * server row. A `{ load }` action swaps the profile in without a stamp. An
 * `{ adopt }` action (another tab's save) applies only when no edit has landed
 * since it was read, so it can never swallow one.
 */
function profileReducer(state: PracticeProfile, action: ProfileAction): PracticeProfile {
  if (typeof action === "object" && action !== null && "load" in action) return action.load;
  if (typeof action === "object" && action !== null && "adopt" in action) {
    return state === action.ifState ? action.adopt : state;
  }
  const next = typeof action === "function" ? action(state) : action;
  return next === state ? state : { ...next, updatedAt: new Date().toISOString() };
}

/** Copies the owner can go back to, named for where they came from. */
function copyName(name: string, from: string): string {
  const suffix = ` (${from})`;
  return `${name.slice(0, 80 - suffix.length).trim()}${suffix}`;
}

export function PracticeProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const userIsDevFallback = user?.isDevFallback;
  const [profile, setProfile] = useReducer(profileReducer, undefined, defaultProfile);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudRevision = useRef<Map<string, number>>(new Map());
  const saveConflictRef = useRef<SaveConflictState | null>(null);
  const skipNextCloudSave = useRef(false);
  const cloudLoadedFor = useRef<string | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const undoStack = useRef<MapSnapshot[]>([]);
  const redoStack = useRef<MapSnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [remoteBusinesses, setRemoteBusinesses] = useState<BusinessSummary[]>([]);
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const [switchingBusiness, setSwitchingBusiness] = useState(false);
  const [saveConflict, setSaveConflict] = useState<SaveConflictState | null>(null);
  saveConflictRef.current = saveConflict;
  // This browser's copy of the open business, shared by every tab.
  const [localStore] = useState(() => new LocalProfileStore());
  // The versions this tab builds on, so an account save made from another
  // tab of the same version is not mistaken for a change on another device.
  const [lineage] = useState(() => new AccountLineage());
  // Whether the last write of the open business to this browser went through.
  const lastLocalWrite = useRef<"saved" | "failed" | "none">("none");
  // The profile object this browser's copy holds, so a tab knows when it has
  // nothing unsaved and can take another tab's save.
  const storedProfile = useRef<PracticeProfile | null>(null);
  // Read from this browser at start-up: already stored, so not written again.
  const loadedFromStorage = useRef<PracticeProfile | null>(null);
  // Another tab's save this tab took; stored already, so not written again.
  const adopted = useRef<{ profile: PracticeProfile; rev: string | null } | null>(null);
  // The last account-save failure shown to the owner, so a retry does not repeat it.
  const lastCloudError = useRef<string | null>(null);
  // The business open before "Add a business", which cancelling setup returns to.
  const openBeforeSetup = useRef<string | null>(null);

  const pushUndo = useCallback(() => {
    const p = profileRef.current;
    undoStack.current.push({
      customProcesses: p.customProcesses,
      customPeople: p.customPeople,
    });
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const applySnapshot = useCallback((snap: MapSnapshot) => {
    setProfile((p) => ({
      ...p,
      customProcesses: snap.customProcesses ?? null,
      customPeople: snap.customPeople ?? null,
    }));
  }, []);

  const undoMap = useCallback(() => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    const p = profileRef.current;
    redoStack.current.push({
      customProcesses: p.customProcesses,
      customPeople: p.customPeople,
    });
    applySnapshot(snap);
    setHistoryVersion((v) => v + 1);
  }, [applySnapshot]);

  const redoMap = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    const p = profileRef.current;
    undoStack.current.push({
      customProcesses: p.customProcesses,
      customPeople: p.customPeople,
    });
    applySnapshot(snap);
    setHistoryVersion((v) => v + 1);
  }, [applySnapshot]);

  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  /** Swap the whole active business — template, overrides, history, profile. */
  const activateProfile = useCallback(
    (next: PracticeProfile) => {
      undoStack.current = [];
      redoStack.current = [];
      setHistoryVersion((v) => v + 1);
      lineage.start(next.businessId ?? "biz_default", next.updatedAt);
      setProfile({ load: next });
    },
    [lineage],
  );

  const saveCloud = useCallback(
    async (current: PracticeProfile) => {
      const id = current.businessId ?? "biz_default";
      const save = () =>
        saveBusinessProfile({
          data: {
            profile: current,
            industry: current.industry,
            baseRevision: cloudRevision.current.get(id) ?? null,
            today: localDateKey(new Date()),
          },
        });
      let result = await save();
      // Refused as stale, but the account holds a version this tab already
      // builds on (another tab of this browser saved it, and this tab took
      // it): nothing would be lost, so save on top of it. Once only; a
      // second refusal means someone else saved in between.
      if (!result.ok && lineage.buildsOn(id, result.profile.updatedAt)) {
        cloudRevision.current.set(id, result.revision);
        result = await save();
      }
      if (result.ok) {
        cloudRevision.current.set(id, result.revision);
        lineage.add(id, current.updatedAt);
        lastCloudError.current = null;
        setSyncStatus("synced");
        return true;
      }
      const nextConflict: SaveConflictState = {
        reason: "remote-edit",
        remote: normalizeProfile(result.profile),
        revision: result.revision,
        updatedAt: result.updatedAt,
      };
      saveConflictRef.current = nextConflict;
      setSaveConflict(nextConflict);
      setSyncStatus("conflict");
      return false;
    },
    [lineage],
  );

  /**
   * A save to the account failed. The badge says so; the reason (the
   * account's business limit, a lost connection) is shown once, not on
   * every retry.
   */
  const reportCloudError = useCallback((error: unknown) => {
    setSyncStatus("error");
    const raw = error instanceof Error ? error.message.trim() : "";
    const message =
      !raw || /fetch|network|load failed/i.test(raw)
        ? "Could not reach the server. Your work is saved in this browser and syncs on your next change."
        : raw;
    if (message === lastCloudError.current) return;
    lastCloudError.current = message;
    toast.error("Not saved to your account", { description: message });
  }, []);

  /** Stop writing and ask the owner: another tab saved this business since this tab did. */
  const raiseTabConflict = useCallback((theirs: PracticeProfile) => {
    const conflict: SaveConflictState = {
      reason: "other-tab",
      remote: theirs,
      revision: null,
      updatedAt: theirs.updatedAt,
    };
    saveConflictRef.current = conflict;
    setSaveConflict(conflict);
    setSyncStatus("conflict");
  }, []);

  // Bootstrap: local first, then cloud when signed in
  useEffect(() => {
    const { profile: loaded, stored } = localStore.load();
    if (stored) {
      loadedFromStorage.current = loaded;
      lastLocalWrite.current = "saved";
    } else if (!canKeepLocalData()) {
      // Nothing stored and nothing can be: say so from the start rather than
      // "Saved on this device".
      lastLocalWrite.current = "failed";
    }
    activateProfile(loaded);
    setReady(true);
  }, [activateProfile, localStore]);

  useEffect(() => {
    if (!ready || isPending) return;
    if (!authEnabled || !userId || userIsDevFallback) {
      setSyncStatus(lastLocalWrite.current === "failed" ? "local-error" : "local");
      cloudLoadedFor.current = null;
      cloudRevision.current.clear();
      saveConflictRef.current = null;
      setSaveConflict(null);
      return;
    }
    if (cloudLoadedFor.current === userId) return;

    let cancelled = false;
    setSyncStatus("loading");
    void Promise.all([
      loadBusinessProfile({ data: { today: localDateKey(new Date()) } }),
      listBusinesses().catch(() => []),
    ])
      .then(async ([res, list]) => {
        if (cancelled) return;
        cloudLoadedFor.current = userId;
        const local = profileRef.current;
        const localId = local.businessId ?? "biz_default";
        if (res.found && res.profile) {
          // Cloud rows skip the client normaliser on the way in unless we run it here.
          const remoteProfile = normalizeProfile(res.profile);
          const id = remoteProfile.businessId ?? "biz_default";
          if (res.revision === null) cloudRevision.current.delete(id);
          else cloudRevision.current.set(id, res.revision);

          if (
            id !== localId &&
            local.onboardingComplete !== false &&
            hasUserWork(local) &&
            !list.some((b) => b.id === localId)
          ) {
            // Work done signed-out under a different business id: keep it as
            // its own business in the account instead of dropping it. Awaited
            // so the account's active-business pointer ends on the remote
            // business activated below, not on this one.
            cloudRevision.current.delete(localId);
            await saveCloud(local).catch(() => undefined);
            if (cancelled) return;
          }

          if (id === localId && hasUserWork(local) && res.revision !== null) {
            const localNewer =
              new Date(local.updatedAt).getTime() > new Date(res.updatedAt).getTime();
            if (localNewer) {
              // Same business, edited here before signing in: let the user
              // choose instead of silently replacing their work.
              const conflict: SaveConflictState = {
                reason: "sign-in",
                remote: remoteProfile,
                revision: res.revision,
                updatedAt: res.updatedAt,
              };
              saveConflictRef.current = conflict;
              setSaveConflict(conflict);
              setRemoteBusinesses(list);
              setSyncStatus("conflict");
              return;
            }
          }

          // The save effect writes it to this browser as the open business.
          activateProfile(remoteProfile);
          savePortfolioEntry(remoteProfile);
        } else {
          cloudRevision.current.delete(localId);
        }
        setRemoteBusinesses(list);
        setSyncStatus("synced");
      })
      .catch(() => {
        if (!cancelled) setSyncStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [ready, isPending, userId, userIsDevFallback, activateProfile, saveCloud]);

  // The active profile is written locally on every change, so a cleared
  // store or a closed tab never resurrects stale state. The portfolio (every
  // business, in full) and the cloud copy are debounced: re-serialising and
  // re-parsing the whole portfolio on each keystroke measurably lagged typing.
  useEffect(() => {
    if (!ready) return;
    const cloud = Boolean(authEnabled && userId && !userIsDevFallback);
    const took = adopted.current;
    if (took && took.profile === profile) {
      // Another tab's save, already stored; that tab also keeps the portfolio
      // and the account copy, so nothing is written from here.
      adopted.current = null;
      localStore.accept(took.rev, profile.updatedAt);
      lineage.add(profile.businessId ?? "biz_default", profile.updatedAt);
      storedProfile.current = profile;
      lastLocalWrite.current = "saved";
      if (!cloud) setSyncStatus("local");
      toast("Updated with changes saved in another tab.");
      return;
    }
    // Waiting for the owner to choose between this tab's version and another
    // tab's: writing now would overwrite theirs.
    if (saveConflictRef.current?.reason === "other-tab") return;
    if (profile === loadedFromStorage.current) {
      loadedFromStorage.current = null;
      storedProfile.current = profile;
    } else {
      const result = localStore.write(profile);
      if (result.kind === "conflict") {
        raiseTabConflict(result.theirs);
        return;
      }
      lastLocalWrite.current = result.kind;
      if (result.kind === "saved") storedProfile.current = profile;
    }
    if (!cloud) setSyncStatus(lastLocalWrite.current === "failed" ? "local-error" : "local");
    // A business whose setup is not finished is the sample behind the setup
    // dialog: kept as the open business for a reload, but not listed or synced.
    if (profile.onboardingComplete === false) return;

    const skipOnce = skipNextCloudSave.current;
    skipNextCloudSave.current = false;
    // Never push before the account's copy has been read: a save with no
    // base revision would create a second, template-only business or trip a
    // spurious conflict against the row still in flight.
    const loaded = cloudLoadedFor.current === userId;
    const skipCloud = !cloud || !loaded || Boolean(saveConflictRef.current) || skipOnce;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      savePortfolioEntry(profile);
      setPortfolioVersion((v) => v + 1);
      if (skipCloud || saveConflictRef.current) return;
      void saveCloud(profile).catch(reportCloudError);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    profile,
    ready,
    userId,
    userIsDevFallback,
    saveCloud,
    localStore,
    lineage,
    raiseTabConflict,
    reportCloudError,
  ]);

  // Another tab saved the open business. When it built on this tab's copy
  // and nothing here is unsaved, take it (a toast says so); otherwise stop
  // and let the owner choose, so neither tab's work is overwritten unseen.
  useEffect(() => {
    if (!ready) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVE_PROFILE_KEY) return;
      const current = profileRef.current;
      const tabConflict = saveConflictRef.current?.reason === "other-tab";
      const unsaved = storedProfile.current !== current;
      const clean = !tabConflict && !unsaved && lastLocalWrite.current !== "failed";
      const change = localStore.receive(event.newValue, current, clean);
      if (change.kind === "adopt") {
        adopted.current = { profile: change.profile, rev: change.rev };
        undoStack.current = [];
        redoStack.current = [];
        setHistoryVersion((v) => v + 1);
        // Applies only if no edit landed here meanwhile; the toast comes
        // with the save effect once it has.
        setProfile({ adopt: change.profile, ifState: current });
        return;
      }
      if (change.kind !== "conflict") return;
      // An edit made here is about to be written; that write finds the
      // newer copy and raises the conflict itself.
      if (unsaved && !tabConflict && lastLocalWrite.current !== "failed") return;
      raiseTabConflict(change.theirs);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [ready, localStore, raiseTabConflict]);

  // A pending debounced save must not die with the tab. On hide, write the
  // portfolio now and push the cloud copy immediately (best effort: the
  // browser may still cancel the request, but the local copy is safe).
  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (saveConflictRef.current?.reason === "other-tab") return;
      const cur = profileRef.current;
      if (cur.onboardingComplete === false) return;
      savePortfolioEntry(cur);
      const cloud = Boolean(authEnabled && userId && !userIsDevFallback);
      if (cloud && cloudLoadedFor.current === userId && !saveConflictRef.current) {
        void saveCloud(cur).catch(reportCloudError);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, userId, userIsDevFallback, saveCloud, reportCloudError]);

  const setPracticeName = useCallback((name: string) => {
    setProfile((p) => ({ ...p, practiceName: name.slice(0, 80) }));
  }, []);

  const setIndustry = useCallback(
    (industry: IndustryId) => {
      clearHistory();
      const meta = industryMeta(industry);
      const fresh = defaultProfile(industry);
      setProfile((p) => ({
        ...fresh,
        practiceName: DEMO_NAMES.has(p.practiceName) ? meta.demoName : p.practiceName,
        decisions: p.decisions,
        businessId: p.businessId,
        onboardingComplete: true,
      }));
    },
    [clearHistory],
  );

  const setStaff = useCallback(
    (staff: StaffComposition | ((s: StaffComposition) => StaffComposition)) => {
      setProfile((p) => {
        const raw = typeof staff === "function" ? staff(p.staff) : staff;
        const scoreSet =
          p.customPeople && raw.segregationScore !== p.staff.segregationScore
            ? { ...raw, segregationSource: "manual" as const }
            : raw;
        // Flipping the bank-reconciliation flag by hand keeps it: later team
        // edits no longer re-read it from the duties.
        const next =
          p.customPeople && raw.independentBankRec !== p.staff.independentBankRec
            ? { ...scoreSet, bankRecSource: "manual" as const }
            : scoreSet;
        const dualRelease = {
          ...p.dualRelease,
          enabled: next.dualControlPayments,
        };
        return {
          ...p,
          staff: next,
          dualRelease,
          riskVariables: {
            ...p.riskVariables,
            hasDualControl: next.dualControlPayments,
            hasIndependentBankRec: next.independentBankRec,
          },
        };
      });
    },
    [],
  );

  const setRiskVariables = useCallback(
    (v: RiskVariableState | ((r: RiskVariableState) => RiskVariableState)) => {
      setProfile((p) => {
        const next = typeof v === "function" ? v(p.riskVariables) : v;
        return {
          ...p,
          riskVariables: next,
          staff: {
            ...p.staff,
            dualControlPayments: next.hasDualControl,
            independentBankRec: next.hasIndependentBankRec,
            ...(p.customPeople && next.hasIndependentBankRec !== p.staff.independentBankRec
              ? { bankRecSource: "manual" as const }
              : {}),
          },
          dualRelease: {
            ...p.dualRelease,
            enabled: next.hasDualControl,
          },
        };
      });
    },
    [],
  );

  const setDualRelease = useCallback(
    (v: DualReleasePolicy | ((d: DualReleasePolicy) => DualReleasePolicy)) => {
      setProfile((p) => {
        const raw = typeof v === "function" ? v(p.dualRelease) : v;
        const dualRelease = mergeDualReleasePolicy(resolveTemplate(p), raw, p.staff);
        const flags = staffFlagsFromDualRelease(dualRelease);
        return {
          ...p,
          dualRelease: {
            ...dualRelease,
            updatedAt: new Date().toISOString(),
          },
          staff: {
            ...p.staff,
            dualControlPayments: flags.dualControlPayments,
          },
          riskVariables: {
            ...p.riskVariables,
            hasDualControl: flags.dualControlPayments,
          },
        };
      });
    },
    [],
  );

  const addDecision = useCallback(
    (input: {
      subject: string;
      kind: DecisionKind;
      note: string;
      reviewBy?: string;
      residualAtDecision?: number;
      linkedTab?: string;
      linkedId?: string;
      linkedStep?: ContinuityStep;
      linkedPersonId?: string;
      linkedAbsenceId?: string;
    }) => {
      const id = makeDecisionId();
      setProfile((p) => {
        const snapshot = captureDecisionSnapshot(
          resolveTemplate(p),
          p.staff,
          p.dualRelease,
          input.subject,
          new Date(),
          input.linkedTab === "knowledge" ? input.linkedId : undefined,
        );
        const entry: DecisionEntry = {
          id,
          createdAt: new Date().toISOString(),
          subject: input.subject.slice(0, 120),
          kind: input.kind,
          note: input.note.slice(0, 800),
          reviewBy: input.reviewBy,
          residualAtDecision: input.residualAtDecision ?? snapshot.subjectResidual,
          linkedTab: input.linkedTab,
          linkedId: input.linkedId,
          ...(input.linkedId ? { linkedIndustry: p.industry } : {}),
          ...(input.linkedStep ? { linkedStep: input.linkedStep } : {}),
          ...(input.linkedPersonId ? { linkedPersonId: input.linkedPersonId } : {}),
          ...(input.linkedAbsenceId ? { linkedAbsenceId: input.linkedAbsenceId } : {}),
          snapshot,
        };
        return { ...p, decisions: [entry, ...p.decisions].slice(0, 100) };
      });
    },
    [],
  );

  const removeDecision = useCallback((id: string) => {
    setProfile((p) => ({
      ...p,
      decisions: p.decisions.filter((d) => d.id !== id),
    }));
  }, []);

  const reviewDecision = useCallback(
    (id: string, outcome: DecisionReviewOutcome, note?: string, extendDays = 90) => {
      setProfile((p) => {
        const decision = p.decisions.find((d) => d.id === id);
        if (!decision) return p;
        const snapshot = captureDecisionSnapshot(
          resolveTemplate(p),
          p.staff,
          p.dualRelease,
          decision.subject,
          new Date(),
          linkedKnowledgeId(decision, p.industry),
        );
        const trimmedNote = note?.trim();
        const reviewed = applyDecisionReview(
          decision,
          {
            at: snapshot.at,
            outcome,
            ...(trimmedNote ? { note: trimmedNote } : {}),
            snapshot,
          },
          extendDays,
        );
        return {
          ...p,
          decisions: p.decisions.map((d) => (d.id === id ? reviewed : d)),
        };
      });
    },
    [],
  );

  const resetProfile = useCallback(() => {
    clearHistory();
    setProfile((p) => ({ ...defaultProfile(p.industry), businessId: p.businessId }));
  }, [clearHistory]);

  /**
   * The unfinished business a setup replaces goes away (it is only the
   * sample behind the dialog), unless an older version of the app saved real
   * work under it; then it stays as a business of its own.
   */
  const retireUnfinished = useCallback((previous: PracticeProfile) => {
    const keep = unfinishedBusinessToKeep(previous);
    const id = previous.businessId ?? "biz_default";
    if (keep) savePortfolioEntry(keep);
    // Older versions listed the unfinished sample in the portfolio; a finished
    // business under the same id (another tab's) is left alone.
    else if (loadPortfolio()[id]?.onboardingComplete === false) removePortfolioEntry(id);
    setPortfolioVersion((v) => v + 1);
  }, []);

  const completeOnboarding = useCallback(
    (industry: IndustryId) => {
      clearHistory();
      const previous = profileRef.current;
      if (previous.onboardingComplete === false) retireUnfinished(previous);
      openBeforeSetup.current = null;
      setProfile((p) => sampleSetupProfile(industry, p));
    },
    [clearHistory, retireUnfinished],
  );

  const startOwnBusiness = useCallback(
    (input: { industry: IndustryId; practiceName: string; people: Person[] }) => {
      clearHistory();
      const previous = profileRef.current;
      if (previous.onboardingComplete === false) retireUnfinished(previous);
      openBeforeSetup.current = null;
      setProfile(() => ownSetupProfile(input));
    },
    [clearHistory, retireUnfinished],
  );

  const setCustomPeople = useCallback(
    (v: Person[] | null | ((current: Person[]) => Person[] | null)) => {
      pushUndo();
      // Told once, outside the update: the owner's people replacing the sample's.
      const before = profileRef.current;
      const preview =
        typeof v === "function"
          ? v(before.customPeople ?? getIndustryTemplate(before.industry).people)
          : v;
      if (replacesSampleTeam(before, preview)) {
        toast("Your team replaced the sample team", {
          description:
            "The sample's supplier waiver and its who-knows-what marks are gone. Name your business in the business menu.",
        });
      }
      setProfile((p) => {
        const current = p.customPeople ?? getIndustryTemplate(p.industry).people;
        const next = typeof v === "function" ? v(current) : v;
        // Replacing the sample's people with the owner's gives the same clean
        // slate as setup; editing the sample's people keeps the sample.
        const base = next && replacesSampleTeam(p, next) ? adoptOwnTeam(p, next) : p;
        const nextTemplate = next ? resolveTemplate({ ...base, customPeople: next }) : null;
        const staff = nextTemplate
          ? deriveStaffFromTeam(nextTemplate, base.staff, {
              dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(base.dualRelease, nextTemplate),
            })
          : base.staff;
        return { ...base, customPeople: next, staff };
      });
    },
    [pushUndo],
  );

  const setCustomProcesses = useCallback(
    (v: ProcessNode[] | null | ((current: ProcessNode[]) => ProcessNode[] | null)) => {
      pushUndo();
      setProfile((p) => {
        const current = processesToEdit(p);
        const next = typeof v === "function" ? v(current) : v;
        const nextTemplate = p.customPeople
          ? resolveTemplate({ ...p, customProcesses: next })
          : null;
        const staff = nextTemplate
          ? deriveStaffFromTeam(nextTemplate, p.staff, {
              dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, nextTemplate),
            })
          : p.staff;
        return { ...p, customProcesses: next, staff };
      });
    },
    [pushUndo],
  );

  const setCustomKnowledge = useCallback(
    (v: KnowledgeItem[] | null | ((current: KnowledgeItem[]) => KnowledgeItem[] | null)) => {
      setProfile((p) => {
        const current = resolveTemplate(p).knowledge;
        const next = typeof v === "function" ? v(current) : v;
        const withRegister = { ...p, customKnowledge: next };
        return { ...withRegister, staff: deriveContinuityStaff(withRegister) };
      });
    },
    [],
  );

  const setCustomRelations = useCallback(
    (
      v:
        KnowledgeRelation[] | null | ((current: KnowledgeRelation[]) => KnowledgeRelation[] | null),
    ) => {
      setProfile((p) => {
        const current = resolveTemplate(p).relations;
        const next = typeof v === "function" ? v(current) : v;
        const withRegister = { ...p, customRelations: next };
        return { ...withRegister, staff: deriveContinuityStaff(withRegister) };
      });
    },
    [],
  );

  const setPlannedAbsences = useCallback(
    (v: PlannedAbsence[] | ((current: PlannedAbsence[]) => PlannedAbsence[])) => {
      setProfile((p) => {
        const current = p.plannedAbsences ?? [];
        return { ...p, plannedAbsences: typeof v === "function" ? v(current) : v };
      });
    },
    [],
  );

  const resetSegregationToDerived = useCallback(() => {
    setProfile((p) => ({
      ...p,
      staff: deriveStaffFromTeam(
        resolveTemplate(p),
        { ...p.staff, segregationSource: "derived" },
        { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, resolveTemplate(p)) },
      ),
    }));
  }, []);

  const replaceProfile = useCallback(
    (next: PracticeProfile) => {
      clearHistory();
      setProfile(normalizeProfile(next));
    },
    [clearHistory],
  );

  const setMapLayout = useCallback(
    (
      v:
        | Record<string, { x: number; y: number }>
        | ((
            l: Record<string, { x: number; y: number }>,
          ) => Record<string, { x: number; y: number }>),
    ) => {
      setProfile((p) => {
        const cur = p.mapLayout ?? {};
        const next = typeof v === "function" ? v(cur) : v;
        return { ...p, mapLayout: next };
      });
    },
    [],
  );

  const mapCustomized = Boolean(
    profile.customProcesses ||
    profile.customPeople ||
    Object.keys(profile.mapLayout ?? {}).length > 0,
  );

  const setSavedProcessBlocks = useCallback(
    (v: SavedProcessBlock[] | ((blocks: SavedProcessBlock[]) => SavedProcessBlock[])) => {
      setProfile((p) => {
        const cur = p.savedProcessBlocks ?? [];
        const next = typeof v === "function" ? v(cur) : v;
        return { ...p, savedProcessBlocks: next.slice(0, 24) };
      });
    },
    [],
  );

  const recordMapHealth = useCallback((score: number) => {
    setProfile((p) => {
      const history = p.mapHealthHistory ?? [];
      const last = history[history.length - 1];
      if (last && last.score === score) return p;
      const now = new Date();
      // Collapse rapid edits within the same minute into one point.
      const trimmed =
        last && now.getTime() - new Date(last.at).getTime() < 60_000
          ? history.slice(0, -1)
          : history;
      const next = [...trimmed, { at: now.toISOString(), score }].slice(-MAX_HEALTH_POINTS);
      return { ...p, mapHealthHistory: next };
    });
  }, []);

  const saveMapVersion = useCallback((name: string, healthScore: number): MapVersion => {
    const p = profileRef.current;
    const tpl = getIndustryTemplate(p.industry);
    const version: MapVersion = {
      id: `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, 60) || `Version ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      healthScore,
      processes: structuredClone(processesToEdit(p)),
      people: structuredClone(p.customPeople ?? tpl.people),
      layout: { ...(p.mapLayout ?? {}) },
    };
    setProfile((cur) => ({
      ...cur,
      mapVersions: [version, ...(cur.mapVersions ?? [])].slice(0, MAX_VERSIONS),
    }));
    return version;
  }, []);

  const deleteMapVersion = useCallback((id: string) => {
    setProfile((p) => ({
      ...p,
      mapVersions: (p.mapVersions ?? []).filter((v) => v.id !== id),
    }));
  }, []);

  const restoreMapVersion = useCallback(
    (id: string) => {
      const v = profileRef.current.mapVersions?.find((x) => x.id === id);
      if (!v) return;
      pushUndo();
      const processes = structuredClone(v.processes);
      const people = structuredClone(v.people);
      setProfile((p) => ({
        ...p,
        customProcesses: processes,
        customPeople: people,
        mapLayout: { ...v.layout },
      }));
    },
    [pushUndo],
  );

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

  const canUndoMap = undoStack.current.length > 0;
  const canRedoMap = redoStack.current.length > 0;

  const cloudUser = Boolean(authEnabled && user && !user.isDevFallback);

  /** Local portfolio + cloud summaries merged by id; the active business always wins. */
  const businesses = useMemo<BusinessSummary[]>(() => {
    const byId = new Map<string, BusinessSummary>();
    for (const b of remoteBusinesses) byId.set(b.id, b);
    for (const p of Object.values(loadPortfolio())) {
      // An unfinished setup saved by an older version is the sample, not a business.
      if (p.onboardingComplete === false) continue;
      const s = summarizeBusiness(p);
      const existing = byId.get(s.id);
      if (!existing || new Date(s.updatedAt) >= new Date(existing.updatedAt)) byId.set(s.id, s);
    }
    byId.set(profile.businessId ?? "biz_default", summarizeBusiness(profile));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    remoteBusinesses,
    profile.businessId,
    profile.practiceName,
    profile.industry,
    portfolioVersion,
  ]);

  const flushActive = useCallback(async () => {
    // Waiting on the owner's choice between two tabs' versions: leaving now
    // would save the stale one over the newer.
    if (saveConflictRef.current?.reason === "other-tab") return false;
    const cur = profileRef.current;
    if (storedProfile.current !== cur) {
      const result = localStore.write(cur);
      if (result.kind === "conflict") {
        raiseTabConflict(result.theirs);
        return false;
      }
      lastLocalWrite.current = result.kind;
      if (result.kind === "saved") storedProfile.current = cur;
    }
    savePortfolioEntry(cur);
    if (
      cloudUser &&
      cur.onboardingComplete !== false &&
      cloudLoadedFor.current === userId &&
      !saveConflictRef.current
    ) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveCloud(cur).catch(reportCloudError);
    }
    return !saveConflictRef.current;
  }, [cloudUser, saveCloud, userId, localStore, raiseTabConflict, reportCloudError]);

  const switchBusiness = useCallback(
    async (id: string) => {
      if (id === (profileRef.current.businessId ?? "biz_default")) return;
      setSwitchingBusiness(true);
      try {
        if (!(await flushActive())) return;
        let next: PracticeProfile | null = loadPortfolio()[id] ?? null;
        // Another tab may have this business open: its copy of the open
        // business is written on every edit, the portfolio only a moment
        // later, so take whichever is newer.
        const open = localStore.peek(id);
        if (open && (!next || open.profile.updatedAt >= next.updatedAt)) next = open.profile;
        if (cloudUser) {
          const remote = await loadBusiness({
            data: { id, today: localDateKey(new Date()) },
          }).catch(() => null);
          if (remote?.found && remote.profile) {
            // The local copy is only trustworthy if it was built on the
            // revision the server still holds; any newer revision means
            // another device wrote since, and clocks are not a tiebreaker.
            const seen = cloudRevision.current.get(id);
            const localCurrent = next !== null && seen !== undefined && seen === remote.revision;
            cloudRevision.current.set(id, remote.revision);
            if (!localCurrent) next = normalizeProfile(remote.profile);
          } else if (remote?.found === false) {
            cloudRevision.current.delete(id);
          }
        }
        if (!next) return;
        activateProfile({ ...next, businessId: id, onboardingComplete: true });
      } finally {
        setSwitchingBusiness(false);
      }
    },
    [activateProfile, cloudUser, flushActive, localStore],
  );

  const createBusiness = useCallback(
    (industry: IndustryId, name?: string): { ok: true } | { ok: false; reason: string } => {
      // A conflict on the outgoing business must not be lost behind the new
      // one: the banner stays up and the switch waits for the user's choice.
      if (saveConflictRef.current) {
        return {
          ok: false,
          reason: "Choose a version in the banner at the top first, so no work is lost.",
        };
      }
      if (cloudUser && atBusinessLimit(businesses.length)) {
        return {
          ok: false,
          reason: `Your account already holds ${MAX_BUSINESSES_PER_ACCOUNT} businesses, the most it can keep. Remove one you no longer need first.`,
        };
      }
      const current = profileRef.current;
      if (current.onboardingComplete !== false) {
        openBeforeSetup.current = current.businessId ?? "biz_default";
      }
      void flushActive();
      // Setup opens for it: the owner's own team, or the sample under the
      // sample's name. It never shows the sample's people under this name.
      const next = newBusinessProfile(industry, name);
      cloudRevision.current.delete(next.businessId as string);
      activateProfile(next);
      return { ok: true };
    },
    [activateProfile, flushActive, cloudUser, businesses.length],
  );

  // Where "Cancel" in the setup dialog goes: the business open before it,
  // else the most recently changed one; none on a first visit.
  const setupReturnsTo = useMemo<BusinessSummary | null>(() => {
    if (profile.onboardingComplete !== false) return null;
    const activeId = profile.businessId ?? "biz_default";
    const others = businesses.filter((b) => b.id !== activeId);
    return (
      others.find((b) => b.id === openBeforeSetup.current) ??
      [...others].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
      null
    );
  }, [businesses, profile.onboardingComplete, profile.businessId]);

  const cancelSetup = useCallback(async () => {
    if (!setupReturnsTo) return;
    openBeforeSetup.current = null;
    await switchBusiness(setupReturnsTo.id);
  }, [setupReturnsTo, switchBusiness]);

  /** Keeps a version the owner did not choose as its own business, so no work is lost. */
  const keepAsCopy = useCallback((version: PracticeProfile, from: string) => {
    const name = copyName(version.practiceName, from);
    savePortfolioEntry({
      ...version,
      businessId: makeBusinessId(),
      practiceName: name,
      onboardingComplete: true,
    });
    setPortfolioVersion((v) => v + 1);
    return name;
  }, []);

  const resolveSaveConflict = useCallback(
    async (choice: "reload" | "overwrite") => {
      const conflict = saveConflictRef.current;
      if (!conflict) return;
      const id = profileRef.current.businessId ?? "biz_default";
      saveConflictRef.current = null;
      setSaveConflict(null);

      if (conflict.reason === "other-tab") {
        // Whichever version the owner picks, the other stays reachable as a
        // copy in their businesses.
        const mine = profileRef.current;
        const latest = localStore.peek(id);
        const theirs = latest?.profile ?? conflict.remote;
        if (choice === "reload") {
          const kept = keepAsCopy(mine, "copy from this tab");
          // The other tab saves its version to the account itself.
          skipNextCloudSave.current = true;
          if (latest) {
            localStore.accept(latest.rev, theirs.updatedAt);
            loadedFromStorage.current = theirs;
            lastLocalWrite.current = "saved";
          }
          activateProfile(theirs);
          toast("Loaded the version saved in the other tab.", {
            description: `This tab's version is kept as “${kept}” in your businesses.`,
          });
          return;
        }
        const kept = keepAsCopy(theirs, "copy from another tab");
        // The owner chose this tab's version over theirs, in the account too.
        lineage.add(id, theirs.updatedAt);
        const result = localStore.write(mine, { force: true });
        lastLocalWrite.current = result.kind === "saved" ? "saved" : "failed";
        if (result.kind === "saved") storedProfile.current = mine;
        savePortfolioEntry(mine);
        setSyncStatus(result.kind === "saved" ? "local" : "local-error");
        toast("Kept this tab's version.", {
          description: `The other tab's version is kept as “${kept}” in your businesses.`,
        });
        return;
      }

      if (conflict.revision !== null) cloudRevision.current.set(id, conflict.revision);

      if (choice === "reload") {
        skipNextCloudSave.current = true;
        activateProfile({ ...conflict.remote, businessId: id });
        setSyncStatus("synced");
        return;
      }

      setSyncStatus("loading");
      await saveCloud(profileRef.current).catch(reportCloudError);
    },
    [activateProfile, saveCloud, localStore, lineage, keepAsCopy, reportCloudError],
  );

  const deleteBusinessLocal = useCallback(
    async (id: string) => {
      const activeId = profileRef.current.businessId ?? "biz_default";
      if (id === activeId) return;
      removePortfolioEntry(id);
      removeValueProof(id);
      setRemoteBusinesses((cur) => cur.filter((b) => b.id !== id));
      setPortfolioVersion((v) => v + 1);
      if (cloudUser) await deleteBusinessRemote({ data: { id } }).catch(() => undefined);
    },
    [cloudUser],
  );

  const value = useMemo(
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
      completeOnboarding,
      startOwnBusiness,
      cancelSetup,
      setupReturnsTo,
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
      businesses,
      switchBusiness,
      createBusiness,
      deleteBusiness: deleteBusinessLocal,
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
      completeOnboarding,
      startOwnBusiness,
      cancelSetup,
      setupReturnsTo,
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
      businesses,
      switchBusiness,
      createBusiness,
      deleteBusinessLocal,
      switchingBusiness,
      historyVersion,
    ],
  );

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

const DEMO_NAMES = new Set(INDUSTRIES.map((i) => i.demoName));

export function usePractice() {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error("usePractice requires PracticeProvider");
  return ctx;
}
