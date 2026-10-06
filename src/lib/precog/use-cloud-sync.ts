import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
} from "react";
import { toast } from "sonner";
import {
  identityLockReason,
  identitySnapshot,
  identityUnchanged,
  registerExitCheck,
  registerExitCleanup,
  subscribeIdentity,
} from "@/lib/auth/identity-change";
import { reportClientError } from "@/lib/observability/report-browser";
import { downloadRecoveryCopy } from "./recovery-copy";
import { isStaleDeployError, PRECOG_UPDATED_MESSAGE } from "./stale-deploy";
import { BusinessSaveQueue, removeAcknowledgedCopies } from "./workspace-storage";
import type { Workspace } from "./workspace-context";
import { authEnabled } from "@/lib/auth/client";
import { listBusinesses, loadBusinessProfile, saveBusinessProfile } from "./profile-server";
import {
  ACTIVE_PROFILE_KEY,
  forgetRemovedBusiness,
  hasUserWork,
  loadPortfolio,
  makeBusinessId,
  normalizeProfile,
  PORTFOLIO_KEY,
  readStoredActiveProfile,
  readStoredProfile,
  removedBusinessIds,
  savePortfolioEntry,
  summarizeBusiness,
  type BusinessSummary,
  type PracticeProfile,
} from "./practice-profile";
import {
  saveOnLineage,
  signInMeetsNewerWork,
  type AccountLineage,
  type LocalProfileStore,
} from "./save-conflict";
import { canKeepLocalData, readLocalJson, writeLocal } from "./local-data";
import type { ProfileAction } from "./profile-reducer";
import { localDateKey } from "./dates";
import { DEFAULT_BUSINESS_ID } from "./business-id";
import { withoutOthersVerifications } from "./procedures/lifecycle";
import { mergeSections, withAccountSections } from "./profile-merge";

/**
 * What the save badge says. "saving" is an edit waiting for its account
 * save; "error" is an account save that failed while this device kept the
 * work; "local-error" is work this device could not keep either.
 */
export type SyncStatus =
  "idle" | "loading" | "saving" | "synced" | "local" | "local-error" | "error" | "conflict";

/**
 * Why the conflict banner is up: another writer beat us to the account copy,
 * a sign-in met local work, the account's copy, read late after it could not
 * be reached, met edits made in the meantime, or another tab in this browser
 * saved this business since this tab last did.
 */
export type SaveConflictReason = "remote-edit" | "sign-in" | "unreachable" | "other-tab";

export interface SaveConflictState {
  reason: SaveConflictReason;
  /** The business the conflict is about, which is not always the one open by the time it is raised. */
  businessId: string;
  remote: PracticeProfile;
  /** The account copy's revision; null for another tab's copy, which has none. */
  revision: number | null;
  updatedAt: string;
}

const SAVE_DEBOUNCE_MS = 1200;
const LOCAL_PROFILE_DEBOUNCE_MS = 400;
/** Waits before each retry of a failed account load; after the last, one a minute. */
const LOAD_RETRY_MS = [2000, 5000, 15000];
const LOAD_RETRY_EVERY_MS = 60_000;
/** Failed loads in a row that go to the error tracker: more than a passing hiccup. */
const LOAD_FAILURES_REPORTED = 4;
/** The one "could not reach your account" notice, replaced on each retry the owner asks for and closed once the account is read. */
const LOAD_FAILED_TOAST = "account-unreachable";
/** The account revision each business was last saved or loaded at, on this device. */
const CLOUD_BASES_KEY = "precog.cloud-bases.v1";
/** The `updatedAt` stamp of each business's copy the account last acknowledged. */
const CLOUD_STAMPS_KEY = "precog.cloud-stamps.v1";
/** Wait before writing the open business to this browser again after the browser refused it. */
const LOCAL_RETRY_MS = 15_000;
/** Wait before writing the open business again after another tab cleared it. */
const CLEARED_REWRITE_MS = 50;
/** The notice that this browser did not keep the latest changes, up until a write goes through. */
const LOCAL_FAILED_TOAST = "local-save-failed";
/** That notice when browser storage is full. */
export const LOCAL_FULL_MESSAGE =
  "Precog could not save your latest changes on this device because browser storage is full. Download a recovery copy, then remove a business you no longer need.";
/** Said once the open business holds a merge of its edits with another device's. */
export const MERGED_MESSAGE = "Merged changes from your other device.";

/** The account's copy of a business at one revision, as this tab holds it. */
interface AccountBase {
  revision: number;
  profile: PracticeProfile;
}

/** A merge the account took, waiting to show in the open business. */
interface AcceptedMerge {
  businessId: string;
  /** The account's revision of the merged copy. */
  revision: number;
  /** The merged copy the account holds. */
  saved: PracticeProfile;
  /** Whether any section came from the other device. */
  tookTheirs: boolean;
}

/**
 * Keeping the open business saved: in this browser on every edit, in the
 * portfolio and the account after a pause, across tabs without either
 * overwriting the other, and reconciled with the account copy on sign-in.
 * Everything about *where* the profile is written lives here; what the
 * profile contains is the provider's business.
 */
export function useCloudSync(input: {
  workspace: Workspace;
  profile: PracticeProfile;
  profileRef: MutableRefObject<PracticeProfile>;
  setProfile: Dispatch<ProfileAction>;
  ready: boolean;
  setReady: (ready: boolean) => void;
  isPending: boolean;
  userId: string | undefined;
  userIsDevFallback: boolean | undefined;
  localStore: LocalProfileStore;
  lineage: AccountLineage;
  /** Swap the whole active business (clears map history, restarts lineage). */
  activateProfile: (next: PracticeProfile) => void;
  clearHistory: () => void;
}) {
  const {
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
  } = input;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [saveConflict, setSaveConflict] = useState<SaveConflictState | null>(null);
  const saveConflictRef = useRef<SaveConflictState | null>(null);
  saveConflictRef.current = saveConflict;
  const [remoteBusinesses, setRemoteBusinesses] = useState<BusinessSummary[]>([]);
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const bumpPortfolio = useCallback(() => setPortfolioVersion((v) => v + 1), []);
  // The list re-reads storage when this tab or another changes it.
  useEffect(() => {
    const portfolioKey = workspace.local?.physicalKey(PORTFOLIO_KEY);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === portfolioKey) bumpPortfolio();
    };
    window.addEventListener("precog:portfolio-change", bumpPortfolio);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("precog:portfolio-change", bumpPortfolio);
      window.removeEventListener("storage", onStorage);
    };
  }, [bumpPortfolio, workspace.local]);
  /**
   * The account holds this account's business `id` live (it listed, loaded
   * or saved it), so a removal of it on this device is over: it was restored
   * since, and is listed and kept here again.
   */
  const accountHolds = useCallback(
    (id: string, ownerUserId: string | undefined) => {
      if (ownerUserId && ownerUserId !== userId) return;
      if (forgetRemovedBusiness(id, workspace.local)) bumpPortfolio();
    },
    [bumpPortfolio, userId, workspace.local],
  );
  // The open business's row as last listed, without its save time: a save
  // that changes nothing the list shows does not re-render every reader.
  const listedRow = useRef<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLocalWrite = useRef<PracticeProfile | null>(null);
  // The workspace unmounts while another tab signs in or out. The edit still
  // waiting for its local write is written now, to this browser only: the
  // identity lock refuses an account save, as it has to.
  useEffect(
    () => () => {
      const pending = pendingLocalWrite.current;
      if (!pending || saveConflictRef.current?.reason === "other-tab") return;
      pendingLocalWrite.current = null;
      if (localWriteTimer.current) clearTimeout(localWriteTimer.current);
      localWriteTimer.current = null;
      localStore.write(pending);
    },
    [localStore],
  );
  const cloudRevision = useRef<Map<string, number>>(new Map());
  const basesLoaded = useRef(false);
  if (!basesLoaded.current) {
    basesLoaded.current = true;
    for (const [id, revision] of storedRevisions(workspace.local))
      cloudRevision.current.set(id, revision);
  }
  const syncedStamps = useRef<Record<string, string>>({});
  const acknowledged = useRef(new Map<string, PracticeProfile>());
  // The account's copy each business was built on in this tab, with its
  // revision: what a refused save compares both copies with before asking.
  // Held in memory only, so after a reload a refused save asks, as before.
  const accountBase = useRef(new Map<string, AccountBase>());
  const noteBase = useCallback((id: string, revision: number | null, profile: PracticeProfile) => {
    if (revision === null) accountBase.current.delete(id);
    else accountBase.current.set(id, { revision, profile });
  }, []);
  // Merged copies the account took, by the open-business object that shows one.
  const acceptedMerges = useRef(new WeakMap<PracticeProfile, AcceptedMerge>());
  useEffect(
    () =>
      registerExitCleanup(() => {
        if (workspace.accountId) removeAcknowledgedCopies(workspace.local, acknowledged.current);
      }),
    [workspace],
  );
  const mounted = useRef(true);
  const queue = useRef(new BusinessSaveQueue());
  useEffect(() => {
    mounted.current = true;
    queue.current = new BusinessSaveQueue();
    return () => {
      mounted.current = false;
      queue.current.close();
    };
  }, []);
  // Every tab of this browser writes these two maps. Each write merges with
  // what is stored, so one tab's write never puts back another tab's older
  // entry for a business it did not touch.
  const rememberRevision = useCallback(
    (id: string, revision: number) => {
      cloudRevision.current.set(id, revision);
      const merged = new Map(storedRevisions(workspace.local));
      for (const [key, held] of cloudRevision.current)
        merged.set(key, Math.max(merged.get(key) ?? 0, held));
      writeLocal(CLOUD_BASES_KEY, JSON.stringify(Object.fromEntries(merged)), workspace.local);
    },
    [workspace.local],
  );
  const rememberStamp = useCallback(
    (id: string, stamp: string) => {
      syncedStamps.current = { ...storedStamps(workspace.local), ...syncedStamps.current };
      syncedStamps.current[id] = stamp;
      writeLocal(CLOUD_STAMPS_KEY, JSON.stringify(syncedStamps.current), workspace.local);
    },
    [workspace.local],
  );
  /** Whether the account took this device's copy of the business stamped `stamp`, as far as any tab here heard. */
  const accountTook = useCallback(
    (id: string, stamp: string) =>
      syncedStamps.current[id] === stamp || storedStamps(workspace.local)[id] === stamp,
    [workspace.local],
  );
  /**
   * Whether this device's copy of business `id` builds on its version
   * stamped `stamp`: the account took this device's copy at that version, or
   * this device holds that very version (listed, or open in another tab).
   */
  const deviceHolds = useCallback(
    (id: string, stamp: string) =>
      accountTook(id, stamp) ||
      loadPortfolio(workspace.local)[id]?.updatedAt === stamp ||
      localStore.peek(id)?.profile.updatedAt === stamp,
    [accountTook, localStore, workspace.local],
  );
  const skipNextCloudSave = useRef(false);
  const cloudLoadedFor = useRef<string | null>(null);
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
  // A new release moved code this page points at: saving waits for a reload.
  const staleDeploy = useRef(false);
  // Whether the owner has heard that this browser refused the list of businesses.
  const listRefusedShown = useRef(false);
  // flushLocal, defined further down, for the update notice.
  const flushLocalRef = useRef<() => boolean>(() => false);
  // The open business holds changes this browser refused to keep: the next
  // pagehide, the retry timer and the next edit write it again.
  const dirtySinceFailure = useRef(false);
  // Whether the notice that this browser refused those changes is up.
  const localFailedShown = useRef(false);
  const localRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether an account save is waiting on the debounce timer.
  const cloudSaveWaiting = useRef(false);

  const cloudUser = Boolean(authEnabled && userId && !userIsDevFallback);

  // Closing the tab asks first while work is held only in this tab: another
  // tab's copy waits for the owner's choice, an account save has not gone
  // out yet, or this browser refused the latest changes.
  const unloadGuarded = useRef(false);
  const onBeforeUnload = useRef((event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Older browsers show the prompt only when returnValue is set.
    event.returnValue = "";
  });
  const guardUnload = useCallback(() => {
    if (typeof window === "undefined") return;
    const held =
      mounted.current &&
      (saveConflictRef.current?.reason === "other-tab" ||
        dirtySinceFailure.current ||
        (saveTimer.current !== null && cloudSaveWaiting.current));
    if (held === unloadGuarded.current) return;
    unloadGuarded.current = held;
    if (held) window.addEventListener("beforeunload", onBeforeUnload.current);
    else window.removeEventListener("beforeunload", onBeforeUnload.current);
  }, []);
  useEffect(
    () => () => {
      // The mount effect above has already marked this workspace closed.
      if (localRetryTimer.current) clearTimeout(localRetryTimer.current);
      localRetryTimer.current = null;
      guardUnload();
    },
    [guardUnload],
  );

  const raiseConflict = useCallback(
    (conflict: SaveConflictState) => {
      saveConflictRef.current = conflict;
      setSaveConflict(conflict);
      setSyncStatus("conflict");
      guardUnload();
    },
    [guardUnload],
  );

  /**
   * The open business merged with the account's newer copy, when the save
   * the account refused was made on the base this tab holds and the two
   * copies changed different sections. Null otherwise: the owner chooses.
   */
  const mergeOnRefusal = useCallback(
    (id: string, savedOn: number | null, remote: PracticeProfile) => {
      const base = accountBase.current.get(id);
      if (savedOn === null || !base || base.revision !== savedOn) return null;
      if (saveConflictRef.current) return null;
      const local = profileRef.current;
      if ((local.businessId ?? DEFAULT_BUSINESS_ID) !== id || local.onboardingComplete === false)
        return null;
      const merge = mergeSections(base.profile, local, remote, new Date().toISOString());
      return merge.kind === "merged" ? { ...merge, local } : null;
    },
    [profileRef],
  );

  /**
   * The account took the merge. The open business shows it, and keeps any
   * edit made since the merge was worked out unless that edit touched a
   * section taken from the other device; then the open business stays as it
   * is, still built on its old base, and its next save asks. The save effect
   * records the new base once the merge shows (see `acceptedMerges`).
   *
   * A merge that takes a section from the other device clears the map's
   * undo and redo first, as taking another tab's save does: a step holds the
   * team, the processes and the layout together, and putting one back would
   * drop the other device's change to any of them.
   */
  const acceptMerge = useCallback(
    (
      id: string,
      merge: NonNullable<ReturnType<typeof mergeOnRefusal>>,
      remote: PracticeProfile,
      revision: number,
    ) => {
      const saved = merge.profile;
      acknowledged.current.set(id, saved);
      rememberStamp(id, saved.updatedAt);
      lastCloudError.current = null;
      const accepted: AcceptedMerge = {
        businessId: id,
        revision,
        saved,
        tookTheirs: merge.fromRemote.length > 0,
      };
      if (accepted.tookTheirs) clearHistory();
      setProfile({
        derive: (state) => {
          if (saveConflictRef.current) return state;
          if (state === merge.local) {
            acceptedMerges.current.set(saved, accepted);
            return saved;
          }
          const next = withAccountSections(
            state,
            merge.local,
            remote,
            merge.fromRemote,
            new Date().toISOString(),
          );
          if (!next) return state;
          acceptedMerges.current.set(next, accepted);
          return next;
        },
      });
    },
    [clearHistory, rememberStamp, setProfile],
  );

  const saveCloud = useCallback(
    async (current: PracticeProfile) => {
      const id = current.businessId ?? DEFAULT_BUSINESS_ID;
      const identity = identitySnapshot();
      if (!mounted.current || !identityUnchanged(identity) || identity.accountId !== userId)
        return false;
      return queue.current.run(id, async () => {
        if (!mounted.current || !identityUnchanged(identity) || !userId) return false;
        // The account holds this very copy already: saving it again would only
        // add an identical version to the business's history.
        if (acknowledged.current.get(id) === current) {
          if (profileRef.current === current) setSyncStatus("synced");
          return true;
        }
        const save = (version: PracticeProfile, baseRevision: number | null) =>
          saveBusinessProfile({
            data: {
              expectedAccountId: userId,
              profile: version,
              industry: version.industry,
              baseRevision,
              ownerUserId: version.ownerUserId,
              today: localDateKey(new Date()),
            },
          });
        const firstBase = cloudRevision.current.get(id) ?? null;
        let lastBase = firstBase;
        // Only a version this tab itself held is saved over without asking;
        // matching clocks are never proof that a remote version was taken in.
        const result = await saveOnLineage({
          businessId: id,
          baseRevision: firstBase,
          lineage,
          save: (baseRevision) => {
            lastBase = baseRevision;
            return save(current, baseRevision);
          },
        });
        if (!mounted.current || !identityUnchanged(identity)) return false;
        if (result.ok) {
          rememberRevision(id, result.revision);
          accountHolds(id, current.ownerUserId);
          noteBase(id, result.revision, current);
          acknowledged.current.set(id, current);
          lineage.add(id, current.updatedAt);
          rememberStamp(id, current.updatedAt);
          lastCloudError.current = null;
          if (profileRef.current === current) setSyncStatus("synced");
          return true;
        }
        let refused = result;
        let remote = normalizeProfile(result.profile);
        // Another device saved this business since this tab's base. When the
        // two changed different sections, the merge keeps both and saves on
        // the account's revision; otherwise the owner chooses, as before.
        const merge = lastBase === firstBase ? mergeOnRefusal(id, lastBase, remote) : null;
        if (merge) {
          const answer = await save(merge.profile, result.revision);
          if (!mounted.current || !identityUnchanged(identity)) return false;
          if (answer.ok) {
            acceptMerge(id, merge, remote, answer.revision);
            return true;
          }
          refused = answer;
          remote = normalizeProfile(answer.profile);
        }
        raiseConflict({
          reason: "remote-edit",
          businessId: id,
          remote,
          revision: refused.revision,
          updatedAt: refused.updatedAt,
        });
        return false;
      });
    },
    [
      lineage,
      raiseConflict,
      rememberRevision,
      rememberStamp,
      accountHolds,
      noteBase,
      mergeOnRefusal,
      acceptMerge,
      userId,
      profileRef,
    ],
  );

  /**
   * A new release moved code this page points at, so every account save
   * fails until a reload. The work goes to this browser first; then a notice
   * that stays until the owner reloads says so.
   */
  const showUpdated = useCallback(() => {
    if (!mounted.current) return;
    staleDeploy.current = true;
    const kept = flushLocalRef.current() && lastLocalWrite.current !== "failed";
    setSyncStatus(kept ? "error" : "local-error");
    const reload = { label: "Reload", onClick: () => window.location.reload() };
    const lasting = { id: "precog-updated", duration: Infinity, dismissible: false };
    if (kept) {
      toast.error(PRECOG_UPDATED_MESSAGE, { ...lasting, action: reload });
      return;
    }
    toast.error("Precog was updated. Download a recovery copy, then reload to keep saving.", {
      ...lasting,
      description: "This device did not keep your latest work.",
      action: {
        label: "Download a recovery copy",
        onClick: () => downloadRecoveryCopy(workspace, profileRef.current),
      },
      cancel: reload,
    });
  }, [profileRef, workspace]);

  /**
   * A save to the account failed. The badge says so; the reason (the
   * account's business limit, a lost connection) is shown once, not on
   * every retry.
   */
  const reportCloudError = useCallback(
    (error: unknown) => {
      if (!mounted.current) return;
      if (isStaleDeployError(error)) {
        showUpdated();
        return;
      }
      const keptHere = lastLocalWrite.current === "saved";
      setSyncStatus(keptHere ? "error" : "local-error");
      const raw = error instanceof Error ? error.message.trim() : "";
      const message =
        !raw || /fetch|network|load failed/i.test(raw)
          ? keptHere
            ? "Could not reach the server. Precog saved your work on this device; your next change tries your account again."
            : "Could not reach the server or save on this device. Download a recovery copy from the save badge before closing this page."
          : raw;
      if (message === lastCloudError.current) return;
      lastCloudError.current = message;
      toast.error("Not saved to your account", { description: message });
    },
    [showUpdated],
  );

  /**
   * Keep a business in this browser's list of businesses. A refused write
   * (storage full or blocked) is said once, with the recovery download,
   * rather than read as a copy this device keeps.
   */
  const keepInList = useCallback(
    (version: PracticeProfile) => {
      if (savePortfolioEntry(version, workspace.local)) return true;
      if (mounted.current && !listRefusedShown.current) {
        listRefusedShown.current = true;
        toast.error("This browser did not keep your list of businesses", {
          description:
            "Storage on this device is full or blocked. Download a recovery copy to keep your work.",
          action: {
            label: "Download a recovery copy",
            onClick: () => downloadRecoveryCopy(workspace, profileRef.current),
          },
        });
      }
      return false;
    },
    [profileRef, workspace],
  );

  /** A copy this browser refused to keep: never claimed, offered as a file instead. */
  const offerCopyDownload = useCallback(
    (version: PracticeProfile, title: string) => {
      if (!mounted.current) return;
      toast.error(title, {
        description: "Storage on this device is full or blocked. Download this copy to keep it.",
        duration: Infinity,
        action: {
          label: "Download this copy",
          onClick: () => downloadRecoveryCopy(workspace, version),
        },
      });
    },
    [workspace],
  );

  /** Stop writing and ask the owner: another tab saved this business since this tab did. */
  const raiseTabConflict = useCallback(
    (theirs: PracticeProfile) => {
      raiseConflict({
        reason: "other-tab",
        businessId: theirs.businessId ?? DEFAULT_BUSINESS_ID,
        remote: theirs,
        revision: null,
        updatedAt: theirs.updatedAt,
      });
    },
    [raiseConflict],
  );

  /**
   * What one write of the open business to this browser did. A refused
   * write says so on the badge and in a notice that stays until a write goes
   * through, and is tried again: on the next edit, on pagehide, and after
   * a short wait.
   */
  const noteLocalWrite = useCallback(
    (version: PracticeProfile, kind: "saved" | "failed") => {
      lastLocalWrite.current = kind;
      if (kind === "saved") {
        storedProfile.current = version;
        if (dirtySinceFailure.current) {
          dirtySinceFailure.current = false;
          if (localRetryTimer.current) clearTimeout(localRetryTimer.current);
          localRetryTimer.current = null;
          localFailedShown.current = false;
          toast.dismiss(LOCAL_FAILED_TOAST);
        }
      } else if (mounted.current) {
        dirtySinceFailure.current = true;
        // A stored copy Precog could not open is kept, not written over; its
        // own notice says so, so this one is not shown.
        if (!localFailedShown.current && !storedCopyUnreadable(workspace.local)) {
          localFailedShown.current = true;
          toast.error(
            canKeepLocalData(workspace.local)
              ? LOCAL_FULL_MESSAGE
              : "Precog could not save your latest changes on this device because this browser is not keeping data for this site. Download a recovery copy before closing this page.",
            {
              id: LOCAL_FAILED_TOAST,
              duration: Infinity,
              dismissible: false,
              action: {
                label: "Download a recovery copy",
                onClick: () => downloadRecoveryCopy(workspace, profileRef.current),
              },
            },
          );
        }
        if (!localRetryTimer.current)
          localRetryTimer.current = setTimeout(() => {
            localRetryTimer.current = null;
            retryLocalRef.current();
          }, LOCAL_RETRY_MS);
      }
      if (mounted.current && !cloudUser) setSyncStatus(localStatus(kind));
      guardUnload();
    },
    [cloudUser, guardUnload, profileRef, workspace],
  );

  /** Write the open business to this browser now. Another tab's newer copy stops it and raises the banner. */
  const writeOpenLocally = useCallback(
    (version: PracticeProfile): "saved" | "failed" | "conflict" => {
      const result = localStore.write(version);
      if (result.kind === "conflict") {
        raiseTabConflict(result.theirs);
        return "conflict";
      }
      noteLocalWrite(version, result.kind);
      return result.kind;
    },
    [localStore, noteLocalWrite, raiseTabConflict],
  );

  // The retry after a refused write, and the rewrite after another tab
  // cleared this browser's storage: the open business, then its list entry.
  const rewriteOpen = useCallback(() => {
    if (!mounted.current || saveConflictRef.current?.reason === "other-tab") return;
    if (localWriteTimer.current) {
      clearTimeout(localWriteTimer.current);
      localWriteTimer.current = null;
    }
    pendingLocalWrite.current = null;
    const cur = profileRef.current;
    if (writeOpenLocally(cur) === "saved" && cur.onboardingComplete !== false) keepInList(cur);
  }, [keepInList, profileRef, writeOpenLocally]);
  // The storage-full notice belongs to this workspace: its recovery download
  // reads this workspace's storage. It closes when the workspace does, and
  // as soon as an account change locks the tab.
  useEffect(() => {
    const unsubscribe = subscribeIdentity(() => {
      if (identityLockReason() === null) return;
      // Shown again on the next refused write, in case the change is cancelled.
      localFailedShown.current = false;
      toast.dismiss(LOCAL_FAILED_TOAST);
    });
    return () => {
      unsubscribe();
      toast.dismiss(LOCAL_FAILED_TOAST);
    };
  }, []);
  const retryLocalRef = useRef<() => void>(() => undefined);
  retryLocalRef.current = () => {
    if (dirtySinceFailure.current) rewriteOpen();
  };

  // Bootstrap: local first, then cloud when signed in
  useEffect(() => {
    syncedStamps.current = storedStamps(workspace.local);
    const { profile: loaded, stored } = localStore.load();
    if (stored) {
      loadedFromStorage.current = loaded;
      lastLocalWrite.current = "saved";
    } else if (!canKeepLocalData(workspace.local)) {
      // Nothing stored and nothing can be: say so from the start rather than
      // "Saved on this device".
      lastLocalWrite.current = "failed";
    }
    activateProfile(loaded);
    setReady(true);
  }, [activateProfile, localStore, setReady, workspace.local]);

  /**
   * The account's businesses for the switcher. A failure is said, with a way
   * to try again, rather than read as an account with no other businesses.
   */
  const refreshBusinessList = useCallback(() => {
    const attempt = async (): Promise<void> => {
      try {
        const list = await listBusinesses();
        if (!mounted.current) return;
        for (const b of list) accountHolds(b.id, b.ownerUserId);
        setRemoteBusinesses(list);
      } catch {
        if (!mounted.current) return;
        toast.error("Could not load your account's businesses", {
          description: "For now, Precog lists only the businesses on this device.",
          action: { label: "Try again", onClick: () => void attempt() },
        });
      }
    };
    return attempt();
  }, [accountHolds]);

  useEffect(() => {
    if (!ready || isPending) return;
    if (!authEnabled || !userId || userIsDevFallback) {
      setSyncStatus(localStatus(lastLocalWrite.current));
      cloudLoadedFor.current = null;
      cloudRevision.current.clear();
      accountBase.current.clear();
      saveConflictRef.current = null;
      setSaveConflict(null);
      return;
    }
    if (cloudLoadedFor.current === userId) return;

    let cancelled = false;
    let failures = 0;
    let inFlight = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    /** The account's copy has been read: the one place that marks it so. */
    const loaded = (res: Awaited<ReturnType<typeof loadBusinessProfile>>) => {
      cloudLoadedFor.current = userId;
      if (failures > 0) toast.dismiss(LOAD_FAILED_TOAST);
      const local = profileRef.current;
      const localId = local.businessId ?? DEFAULT_BUSINESS_ID;
      if (res.found && res.profile) {
        // Cloud rows skip the client normaliser on the way in unless we run it here.
        const remoteProfile = normalizeProfile(res.profile);
        const id = remoteProfile.businessId ?? DEFAULT_BUSINESS_ID;
        // The account revision this device's copy was built on. Only a path
        // that takes the account's copy, or saves on top of it, records the
        // new one: a copy kept for the owner's choice is not built on it, and
        // a reload must ask again rather than save over it.
        const builtOn = cloudRevision.current.get(id);
        const buildOnAccount = () => {
          if (res.revision === null) return;
          rememberRevision(id, res.revision);
          noteBase(id, res.revision, remoteProfile);
        };
        // The account holds it live, so a removal of it here is over.
        accountHolds(id, remoteProfile.ownerUserId);

        if (failures > 0) {
          // Read late, after the owner worked on (and may have switched to)
          // the open business: it stays open. The account's copy is the very
          // version this tab built on, so the edits made meanwhile save over it.
          const fastForward =
            local.updatedAt !== remoteProfile.updatedAt &&
            res.revision !== null &&
            lineage.buildsOn(id, remoteProfile.updatedAt);
          if (fastForward) buildOnAccount();
          if (id !== localId || fastForward) {
            // Another business than the open one: this device builds on the
            // account's copy of it when it holds that very version, or the
            // account took this device's copy at that version. Its revision
            // is recorded then, so opening it later saves on top of it
            // instead of asking; any other copy here still asks.
            if (!fastForward && id !== localId && deviceHolds(id, remoteProfile.updatedAt)) {
              buildOnAccount();
            }
            saveOpenBusiness(local);
            return;
          }
          if (signInMeetsNewerWork(local, remoteProfile, syncedStamps.current[id])) {
            raiseConflict({
              reason: "unreachable",
              businessId: id,
              remote: remoteProfile,
              revision: res.revision,
              updatedAt: res.updatedAt,
            });
            return;
          }
        }

        // This is only the verified account's namespace. Guest or legacy work is
        // never silently attached to the account during sign-in.
        if (id !== localId && hasUserWork(local) && !savePortfolioEntry(local, workspace.local))
          offerCopyDownload(local, `This browser did not keep a copy of ${local.practiceName}`);

        // Edited here on top of the very revision the account still holds
        // (the tab closed before its account save went out): the edits save
        // over it without asking, as a switch does.
        if (
          id === localId &&
          local.onboardingComplete !== false &&
          hasUserWork(local) &&
          res.revision !== null &&
          builtOn === res.revision &&
          local.updatedAt !== remoteProfile.updatedAt
        ) {
          buildOnAccount();
          saveOpenBusiness(local);
          return;
        }

        // Same business, edited here before signing in (also over a legacy
        // account copy with no revision yet): let the owner choose instead of
        // silently replacing their work.
        if (signInMeetsNewerWork(local, remoteProfile, syncedStamps.current[id])) {
          raiseConflict({
            reason: "sign-in",
            businessId: id,
            remote: remoteProfile,
            revision: res.revision,
            updatedAt: res.updatedAt,
          });
          return;
        }

        // The save effect writes it to this browser as the open business.
        buildOnAccount();
        rememberStamp(id, remoteProfile.updatedAt);
        acknowledged.current.set(id, remoteProfile);
        skipNextCloudSave.current = true;
        activateProfile(remoteProfile);
        // The account holds this copy, so a refused write here loses nothing.
        keepInList(remoteProfile);
        setSyncStatus("synced");
        return;
      }
      // Nothing in the account to open. The business here is on this device
      // only until its next change is saved; a previously known base revision
      // is kept, since missing is not permission to recreate.
      if (failures > 0) {
        saveOpenBusiness(local);
        return;
      }
      setSyncStatus(localStatus(lastLocalWrite.current));
    };

    /**
     * Edits made while the account could not be reached were not saved to
     * it; they go now rather than waiting for the next change.
     */
    const saveOpenBusiness = (local: PracticeProfile) => {
      if (local.onboardingComplete === false || !hasUserWork(local)) {
        setSyncStatus(localStatus(lastLocalWrite.current));
        return;
      }
      setSyncStatus("saving");
      void saveCloud(local).catch(reportCloudError);
    };

    /**
     * Read the account's copy. A failure retries after 2 s, 5 s and 15 s,
     * then once a minute, and also when the connection returns, when the tab
     * comes back into view, or when the owner asks; until then no edit is
     * saved to the account, which is never written before it is read.
     */
    const attempt = (asked = false) => {
      if (cancelled || inFlight || cloudLoadedFor.current === userId || staleDeploy.current) return;
      // A sign-in or sign-out under way: its account change remounts this workspace.
      if (failures > 0 && identityLockReason() !== null) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      inFlight = true;
      void loadBusinessProfile({ data: { today: localDateKey(new Date()) } })
        .then((res) => {
          inFlight = false;
          if (!cancelled) loaded(res);
        })
        .catch((error: unknown) => {
          inFlight = false;
          if (cancelled) return;
          failures += 1;
          const keptHere = lastLocalWrite.current !== "failed";
          setSyncStatus(keptHere ? "error" : "local-error");
          if (isStaleDeployError(error)) {
            showUpdated();
            return;
          }
          if (failures === LOAD_FAILURES_REPORTED) reportClientError(error);
          const tryAgain = { label: "Try again", onClick: () => attempt(true) };
          if (failures === 1 || asked)
            toast.error(
              "Could not reach your account",
              keptHere
                ? {
                    id: LOAD_FAILED_TOAST,
                    duration: Infinity,
                    description:
                      "Precog keeps your edits on this device and tries your account again in a moment.",
                    action: tryAgain,
                  }
                : {
                    id: LOAD_FAILED_TOAST,
                    duration: Infinity,
                    description:
                      "This browser is not keeping your edits either. Download a recovery copy before closing this page; Precog tries your account again in a moment.",
                    action: {
                      label: "Download a recovery copy",
                      onClick: () => downloadRecoveryCopy(workspace, profileRef.current),
                    },
                    cancel: tryAgain,
                  },
            );
          retryTimer = setTimeout(
            () => attempt(),
            LOAD_RETRY_MS[failures - 1] ?? LOAD_RETRY_EVERY_MS,
          );
        });
    };
    const onOnline = () => attempt();
    const onVisible = () => {
      if (document.visibilityState === "visible") attempt();
    };

    setSyncStatus("loading");
    void refreshBusinessList();
    attempt();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    ready,
    isPending,
    userId,
    userIsDevFallback,
    activateProfile,
    profileRef,
    raiseConflict,
    refreshBusinessList,
    workspace,
    lineage,
    rememberRevision,
    accountHolds,
    deviceHolds,
    rememberStamp,
    noteBase,
    keepInList,
    offerCopyDownload,
    saveCloud,
    reportCloudError,
    showUpdated,
  ]);

  // The active profile is written locally on every change, so a cleared
  // store or a closed tab never resurrects stale state. The portfolio (every
  // business, in full) and the cloud copy are debounced: re-serialising and
  // re-parsing the whole portfolio on each keystroke measurably lagged typing.
  useEffect(() => {
    if (!ready) return;
    const took = adopted.current;
    if (took && took.profile === profile) {
      // Another tab's save, already stored; that tab also keeps the portfolio
      // and the account copy, so nothing is written from here.
      adopted.current = null;
      localStore.accept(took.rev, profile.updatedAt);
      lineage.add(profile.businessId ?? DEFAULT_BUSINESS_ID, profile.updatedAt);
      noteLocalWrite(profile, "saved");
      toast("Updated with changes saved in another tab.");
      return;
    }
    // Waiting for the owner to choose between this tab's version and another
    // tab's: writing now would overwrite theirs.
    if (saveConflictRef.current?.reason === "other-tab") return;
    const merged = acceptedMerges.current.get(profile);
    if (merged) {
      acceptedMerges.current.delete(profile);
      // The open business now builds on the merged copy the account holds.
      const id = merged.businessId;
      cloudRevision.current.set(id, merged.revision);
      noteBase(id, merged.revision, merged.saved);
      lineage.add(id, merged.saved.updatedAt);
      if (merged.tookTheirs) toast(MERGED_MESSAGE);
      // Written here at once, and only then kept as this browser's base: a
      // reload before the write finds the older base and asks, rather than
      // saving the older copy over the merge.
      pendingLocalWrite.current = null;
      if (writeOpenLocally(profile) === "saved") rememberRevision(id, merged.revision);
    } else if (profile === loadedFromStorage.current) {
      loadedFromStorage.current = null;
      storedProfile.current = profile;
      if (!cloudUser) setSyncStatus(localStatus(lastLocalWrite.current));
    } else {
      // The badge changes once the write is done, from what the write did.
      pendingLocalWrite.current = profile;
      if (localWriteTimer.current) clearTimeout(localWriteTimer.current);
      localWriteTimer.current = setTimeout(() => {
        localWriteTimer.current = null;
        const cur = pendingLocalWrite.current;
        if (!cur) return;
        pendingLocalWrite.current = null;
        writeOpenLocally(cur);
      }, LOCAL_PROFILE_DEBOUNCE_MS);
    }
    // A business whose setup is not finished is the sample behind the setup
    // dialog: kept as the open business for a reload, but not listed or synced.
    if (profile.onboardingComplete === false) return;

    const skipOnce = skipNextCloudSave.current;
    skipNextCloudSave.current = false;
    // Never push before the account's copy has been read: a save with no
    // base revision would create a second, template-only business or trip a
    // spurious conflict against the row still in flight.
    const loaded = cloudLoadedFor.current === userId;
    const skipCloud = !cloudUser || !loaded || Boolean(saveConflictRef.current) || skipOnce;
    // Until the account save lands, the badge must not still say "Saved to your account".
    if (!skipCloud) setSyncStatus("saving");

    if (saveTimer.current) clearTimeout(saveTimer.current);
    cloudSaveWaiting.current = !skipCloud;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      cloudSaveWaiting.current = false;
      guardUnload();
      // A tab waiting for the owner's choice writes nothing: its copy in the
      // list would replace the other tab's saved one.
      if (saveConflictRef.current?.reason === "other-tab") return;
      // Only a version this browser took as the open business is listed.
      if (storedProfile.current === profile) keepInList(profile);
      const { updatedAt: _savedAt, ...row } = summarizeBusiness(profile);
      const listed = JSON.stringify(row);
      if (listed !== listedRow.current) {
        listedRow.current = listed;
        setPortfolioVersion((v) => v + 1);
      }
      if (skipCloud || saveConflictRef.current) return;
      void saveCloud(profile).catch(reportCloudError);
    }, SAVE_DEBOUNCE_MS);
    guardUnload();

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (localWriteTimer.current) clearTimeout(localWriteTimer.current);
      saveTimer.current = null;
      localWriteTimer.current = null;
      cloudSaveWaiting.current = false;
      guardUnload();
    };
  }, [
    profile,
    ready,
    userId,
    cloudUser,
    saveCloud,
    localStore,
    lineage,
    writeOpenLocally,
    noteLocalWrite,
    guardUnload,
    reportCloudError,
    keepInList,
    noteBase,
    rememberRevision,
  ]);

  // Another tab saved the open business. When it built on this tab's copy
  // and nothing here is unsaved, take it (a toast says so); otherwise stop
  // and let the owner choose, so neither tab's work is overwritten unseen.
  useEffect(() => {
    if (!ready) return;
    const onStorage = (event: StorageEvent) => {
      const activeKey = workspace.local?.physicalKey(ACTIVE_PROFILE_KEY);
      // Another tab cleared this browser's storage, or removed the open
      // business: this tab's copy is no longer kept here, so it is written
      // again at once, and the badge says what that write did. Not while an
      // account change locks the tab (a sign-out or an account deletion
      // clears its copies, then announces the change: the short wait lets
      // that news arrive first), nor for a business removed on this device.
      if (event.key === null || (event.key === activeKey && event.newValue === null)) {
        storedProfile.current = null;
        setTimeout(() => {
          if (identityLockReason() !== null) return;
          const id = profileRef.current.businessId ?? DEFAULT_BUSINESS_ID;
          if (removedBusinessIds(workspace.local).has(id)) return;
          rewriteOpen();
        }, CLEARED_REWRITE_MS);
        return;
      }
      if (event.key !== activeKey) return;
      const current = profileRef.current;
      const tabConflict = saveConflictRef.current?.reason === "other-tab";
      const unsaved = storedProfile.current !== current;
      const clean = !tabConflict && !unsaved && lastLocalWrite.current !== "failed";
      const change = localStore.receive(event.newValue, current, clean);
      if (change.kind === "adopt") {
        adopted.current = { profile: change.profile, rev: change.rev };
        clearHistory();
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
  }, [
    ready,
    localStore,
    raiseTabConflict,
    rewriteOpen,
    profileRef,
    setProfile,
    clearHistory,
    workspace.local,
  ]);

  // A pending debounced save must not die with the tab. On hide, write the
  // portfolio now and push the cloud copy immediately (best effort: the
  // browser may still cancel the request, but the local copy is safe).
  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      const otherTab = () => saveConflictRef.current?.reason === "other-tab";
      // An edit waiting for its write, or one this browser refused before:
      // written now. Another tab's newer copy stops it and raises the banner.
      const unwritten = localWriteTimer.current !== null || dirtySinceFailure.current;
      if (localWriteTimer.current) clearTimeout(localWriteTimer.current);
      localWriteTimer.current = null;
      if (unwritten && !otherTab()) {
        const pending = pendingLocalWrite.current ?? profileRef.current;
        pendingLocalWrite.current = null;
        writeOpenLocally(pending);
      }
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      cloudSaveWaiting.current = false;
      guardUnload();
      if (otherTab()) return;
      const cur = profileRef.current;
      if (cur.onboardingComplete === false) return;
      if (storedProfile.current === cur) keepInList(cur);
      if (cloudUser && cloudLoadedFor.current === userId && !saveConflictRef.current) {
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
  }, [
    ready,
    userId,
    cloudUser,
    saveCloud,
    reportCloudError,
    profileRef,
    keepInList,
    writeOpenLocally,
    guardUnload,
  ]);

  /**
   * Write the open business to this browser, now. False when another tab's
   * save stops it (the banner asks the owner first, and leaving now would
   * save the stale version over the newer), or when this browser refused the
   * write and the account does not hold this very copy either: another
   * business taking its place would leave it nowhere.
   */
  const flushLocal = useCallback(() => {
    if (saveConflictRef.current?.reason === "other-tab") return false;
    const cur = profileRef.current;
    if (storedProfile.current !== cur && writeOpenLocally(cur) === "conflict") return false;
    if (keepInList(cur)) return true;
    return acknowledged.current.get(cur.businessId ?? DEFAULT_BUSINESS_ID) === cur;
  }, [writeOpenLocally, profileRef, keepInList]);
  flushLocalRef.current = flushLocal;

  /**
   * Whether a signed-in owner's open business waits for the account's copy
   * to be read: nothing reaches the account before then.
   */
  const accountUnread = useCallback(
    () =>
      cloudUser &&
      profileRef.current.onboardingComplete !== false &&
      cloudLoadedFor.current !== userId,
    [cloudUser, profileRef, userId],
  );

  /**
   * Write the open business everywhere it goes, now. False when a conflict
   * or a failed save stops it. While the account's copy is unread, this
   * device's copy is all there is to write: a switch goes ahead on it.
   */
  const flushActive = useCallback(async () => {
    if (!flushLocal()) return false;
    const cur = profileRef.current;
    if (
      cloudUser &&
      cur.onboardingComplete !== false &&
      cloudLoadedFor.current === userId &&
      !saveConflictRef.current
    ) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      return saveCloud(cur).catch((error) => {
        reportCloudError(error);
        return false;
      });
    }
    return !saveConflictRef.current && lastLocalWrite.current !== "failed";
  }, [cloudUser, saveCloud, userId, flushLocal, reportCloudError, profileRef]);

  /** The business about to open is the account's copy as it stands: nothing to push back. */
  const openedFromAccount = useCallback(
    (opened: PracticeProfile, revision: number) => {
      const id = opened.businessId ?? DEFAULT_BUSINESS_ID;
      rememberRevision(id, revision);
      noteBase(id, revision, opened);
      rememberStamp(id, opened.updatedAt);
      acknowledged.current.set(id, opened);
      skipNextCloudSave.current = true;
    },
    [noteBase, rememberRevision, rememberStamp],
  );

  /**
   * Keeps a version the owner did not choose as its own business, so no work
   * is lost. Null when this browser refused the write: the caller then offers
   * the copy as a download and never says it is kept.
   */
  const keepAsCopy = useCallback(
    (version: PracticeProfile, from: string): string | null => {
      const name = copyName(version.practiceName, from);
      const kept = savePortfolioEntry(
        {
          ...version,
          businessId: makeBusinessId(),
          practiceName: name,
          onboardingComplete: true,
          // The copy is a new business this account saves: another account's
          // verification in it would count as recorded now, and be refused.
          ...(version.procedures && userId
            ? { procedures: withoutOthersVerifications(version.procedures, userId) }
            : {}),
        },
        workspace.local,
      );
      if (!kept) return null;
      bumpPortfolio();
      return name;
    },
    [bumpPortfolio, userId, workspace.local],
  );

  /** What a conflict choice's toast says about the version kept as a copy, offering it as a file when it was not kept. */
  const copyNote = useCallback(
    (kept: string | null, version: PracticeProfile, whose: string) => {
      if (kept) return `Precog keeps ${whose} copy as “${kept}” in your businesses.`;
      offerCopyDownload(version, `This browser did not keep ${whose} copy`);
      return undefined;
    },
    [offerCopyDownload],
  );

  const resolveSaveConflict = useCallback(
    async (choice: "reload" | "overwrite") => {
      const conflict = saveConflictRef.current;
      if (!conflict) return;
      const id = conflict.businessId;
      saveConflictRef.current = null;
      setSaveConflict(null);
      guardUnload();
      const cur = profileRef.current;
      const canSaveOpen =
        cloudUser && cloudLoadedFor.current === userId && cur.onboardingComplete !== false;

      if (id !== (cur.businessId ?? DEFAULT_BUSINESS_ID)) {
        // The account refused a save of a business the owner has since left.
        // The choice applies to that business's copy on this device, not to
        // the one open now.
        if (conflict.reason === "other-tab") return;
        if (conflict.revision !== null) cloudRevision.current.set(id, conflict.revision);
        else cloudRevision.current.delete(id);
        // Whichever copy the owner keeps now builds on the account's.
        noteBase(id, conflict.revision, { ...conflict.remote, businessId: id });
        const local = loadPortfolio(workspace.local)[id];
        if (choice === "reload") {
          // This device now builds on the account's copy, after a reload too.
          if (conflict.revision !== null) rememberRevision(id, conflict.revision);
          const accountCopy = { ...conflict.remote, businessId: id };
          const kept = local ? keepAsCopy(local, "copy from this device") : null;
          keepInList(accountCopy);
          acknowledged.current.set(id, accountCopy);
          rememberStamp(id, accountCopy.updatedAt);
          bumpPortfolio();
          toast(`Precog now holds the account's copy of ${accountCopy.practiceName}.`, {
            description: local ? copyNote(kept, local, "this device's") : undefined,
          });
        } else {
          const kept = keepAsCopy(conflict.remote, "copy from your account");
          toast("Precog kept this device's copy.", {
            description: copyNote(kept, conflict.remote, "the account's"),
          });
          if (local) await saveCloud(normalizeProfile(local)).catch(reportCloudError);
        }
        // The open business waited behind the banner; it saves now.
        if (saveConflictRef.current) return;
        if (canSaveOpen) {
          setSyncStatus("saving");
          await saveCloud(cur).catch(reportCloudError);
        } else setSyncStatus(localStatus(lastLocalWrite.current));
        return;
      }

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
            noteLocalWrite(theirs, "saved");
          }
          activateProfile(theirs);
          toast("Loaded the copy saved in the other tab.", {
            description: copyNote(kept, mine, "this tab's"),
          });
          return;
        }
        const kept = keepAsCopy(theirs, "copy from another tab");
        // The owner chose this tab's version over theirs, in the account too.
        lineage.add(id, theirs.updatedAt);
        const result = localStore.write(mine, { force: true });
        noteLocalWrite(mine, result.kind === "saved" ? "saved" : "failed");
        keepInList(mine);
        toast("Kept this tab's copy.", {
          description: copyNote(kept, theirs, "the other tab's"),
        });
        // The other tab takes this write without saving it to the account,
        // so this tab does: the account holds the version the owner chose.
        if (!canSaveOpen) {
          setSyncStatus(result.kind === "saved" ? "local" : "local-error");
          return;
        }
        setSyncStatus("saving");
        await saveCloud(mine).catch(reportCloudError);
        return;
      }

      // A legacy account copy has no revision: saving over it creates one.
      if (conflict.revision !== null) cloudRevision.current.set(id, conflict.revision);
      else cloudRevision.current.delete(id);
      // Whichever copy the owner keeps now builds on the account's.
      noteBase(id, conflict.revision, { ...conflict.remote, businessId: id });

      // As between two tabs, the version the owner did not pick stays
      // reachable as a copy in their businesses.
      if (choice === "reload") {
        // This device now builds on the account's copy, after a reload too.
        if (conflict.revision !== null) rememberRevision(id, conflict.revision);
        const kept = keepAsCopy(
          cur,
          conflict.reason === "sign-in" ? "copy from before sign-in" : "copy from this device",
        );
        const accountCopy = { ...conflict.remote, businessId: id };
        acknowledged.current.set(id, accountCopy);
        rememberStamp(id, accountCopy.updatedAt);
        skipNextCloudSave.current = true;
        activateProfile(accountCopy);
        setSyncStatus("synced");
        toast("Loaded the copy saved in your account.", {
          description: copyNote(kept, cur, "this device's"),
        });
        return;
      }

      const kept = keepAsCopy(conflict.remote, "copy from your account");
      setSyncStatus("saving");
      toast("Precog kept this device's copy.", {
        description: copyNote(kept, conflict.remote, "the account's"),
      });
      await saveCloud(cur).catch(reportCloudError);
    },
    [
      activateProfile,
      bumpPortfolio,
      cloudUser,
      saveCloud,
      localStore,
      lineage,
      keepAsCopy,
      keepInList,
      copyNote,
      guardUnload,
      noteLocalWrite,
      noteBase,
      rememberRevision,
      rememberStamp,
      reportCloudError,
      profileRef,
      userId,
      workspace.local,
    ],
  );

  useEffect(
    () =>
      registerExitCheck(async (transition) => {
        if (!mounted.current) return true;
        // Leaving the account before its copy was read leaves this device's
        // edits unsaved there, so the recovery download is offered too.
        const saved = (await flushActive()) && !accountUnread();
        if (saved) return true;
        const next = transition === "sign-in" ? "continue signing in" : "sign out";
        if (
          !window.confirm(
            `Some work has not synced. Download a recovery copy and ${next}? Cancel keeps this workspace open.`,
          )
        )
          return false;
        downloadRecoveryCopy(workspace, profileRef.current);
        return true;
      }),
    [accountUnread, flushActive, profileRef, workspace],
  );

  /** The recovery copy of the open business, for the save badge when work is not saved. */
  const downloadRecovery = useCallback(
    () => downloadRecoveryCopy(workspace, profileRef.current),
    [profileRef, workspace],
  );

  return {
    downloadRecovery,
    syncStatus,
    saveConflict,
    saveConflictRef,
    raiseConflict,
    accountTook,
    resolveSaveConflict,
    flushLocal,
    flushActive,
    openedFromAccount,
    cloudUser,
    cloudRevision,
    remoteBusinesses,
    setRemoteBusinesses,
    portfolioVersion,
    bumpPortfolio,
  };
}

/** What the badge says for a business kept on this device only. */
function localStatus(lastLocalWrite: "saved" | "failed" | "none"): SyncStatus {
  return lastLocalWrite === "failed" ? "local-error" : "local";
}

/** Whether the open business stored on this device is one this build could not read. */
function storedCopyUnreadable(storage: Workspace["local"]): boolean {
  const read = readStoredProfile(readStoredActiveProfile(storage));
  return read.unreadable !== null || read.damaged;
}

/** The account revision each business was last saved or loaded at, as this browser stores it. */
function storedRevisions(storage: Workspace["local"]): Map<string, number> {
  const held = readLocalJson(CLOUD_BASES_KEY, storage);
  const revisions = new Map<string, number>();
  if (held && typeof held === "object")
    for (const [id, revision] of Object.entries(held))
      if (typeof revision === "number" && Number.isSafeInteger(revision) && revision > 0)
        revisions.set(id, revision);
  return revisions;
}

function storedStamps(storage: Workspace["local"]): Record<string, string> {
  const held = readLocalJson(CLOUD_STAMPS_KEY, storage);
  return held && typeof held === "object"
    ? Object.fromEntries(
        Object.entries(held).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}

/** Copies the owner can go back to, named for where they came from. */
function copyName(name: string, from: string): string {
  const suffix = ` (${from})`;
  return `${name.slice(0, 80 - suffix.length).trim()}${suffix}`;
}
