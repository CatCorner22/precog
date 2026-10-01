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
  identitySnapshot,
  identityUnchanged,
  registerExitCheck,
  registerExitCleanup,
} from "@/lib/auth/identity-change";
import { downloadText } from "@/lib/download";
import { BusinessSaveQueue, removeAcknowledgedCopies } from "./workspace-storage";
import type { Workspace } from "./workspace-context";
import { authEnabled } from "@/lib/auth/client";
import { listBusinesses, loadBusinessProfile, saveBusinessProfile } from "./profile-server";
import {
  ACTIVE_PROFILE_KEY,
  hasUserWork,
  loadPortfolio,
  makeBusinessId,
  normalizeProfile,
  savePortfolioEntry,
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

/**
 * What the save badge says. "saving" is an edit waiting for its account
 * save; "error" is an account save that failed while this device kept the
 * work; "local-error" is work this device could not keep either.
 */
export type SyncStatus =
  "idle" | "loading" | "saving" | "synced" | "local" | "local-error" | "error" | "conflict";

/**
 * Why the conflict banner is up: another writer beat us to the account copy,
 * a sign-in met local work, or another tab in this browser saved this
 * business since this tab last did.
 */
export type SaveConflictReason = "remote-edit" | "sign-in" | "other-tab";

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
/** The account revision each business was last saved or loaded at, on this device. */
const CLOUD_BASES_KEY = "precog.cloud-bases.v1";
/** The `updatedAt` stamp of each business's copy the account last acknowledged. */
const CLOUD_STAMPS_KEY = "precog.cloud-stamps.v1";

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
  useEffect(() => {
    window.addEventListener("precog:portfolio-change", bumpPortfolio);
    return () => window.removeEventListener("precog:portfolio-change", bumpPortfolio);
  }, [bumpPortfolio]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudRevision = useRef<Map<string, number>>(new Map());
  const basesLoaded = useRef(false);
  if (!basesLoaded.current) {
    basesLoaded.current = true;
    for (const [id, revision] of storedRevisions(workspace.local))
      cloudRevision.current.set(id, revision);
  }
  const syncedStamps = useRef<Record<string, string>>({});
  const acknowledged = useRef(new Map<string, PracticeProfile>());
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

  const cloudUser = Boolean(authEnabled && userId && !userIsDevFallback);

  const raiseConflict = useCallback((conflict: SaveConflictState) => {
    saveConflictRef.current = conflict;
    setSaveConflict(conflict);
    setSyncStatus("conflict");
  }, []);

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
        // Only a version this tab itself held is saved over without asking;
        // matching clocks are never proof that a remote version was taken in.
        const result = await saveOnLineage({
          businessId: id,
          baseRevision: cloudRevision.current.get(id) ?? null,
          lineage,
          save: (baseRevision) =>
            saveBusinessProfile({
              data: {
                expectedAccountId: userId,
                profile: current,
                industry: current.industry,
                baseRevision,
                today: localDateKey(new Date()),
              },
            }),
        });
        if (!mounted.current || !identityUnchanged(identity)) return false;
        if (result.ok) {
          rememberRevision(id, result.revision);
          acknowledged.current.set(id, current);
          lineage.add(id, current.updatedAt);
          rememberStamp(id, current.updatedAt);
          lastCloudError.current = null;
          if (profileRef.current === current) setSyncStatus("synced");
          return true;
        }
        raiseConflict({
          reason: "remote-edit",
          businessId: id,
          remote: normalizeProfile(result.profile),
          revision: result.revision,
          updatedAt: result.updatedAt,
        });
        return false;
      });
    },
    [lineage, raiseConflict, rememberRevision, rememberStamp, userId, profileRef],
  );

  /**
   * A save to the account failed. The badge says so; the reason (the
   * account's business limit, a lost connection) is shown once, not on
   * every retry.
   */
  const reportCloudError = useCallback((error: unknown) => {
    if (!mounted.current) return;
    const keptHere = lastLocalWrite.current === "saved";
    setSyncStatus(keptHere ? "error" : "local-error");
    const raw = error instanceof Error ? error.message.trim() : "";
    const message =
      !raw || /fetch|network|load failed/i.test(raw)
        ? keptHere
          ? "Could not reach the server. Precog saved your work on this device; your next change tries your account again."
          : "Could not reach the server or save on this device. Export a recovery copy before closing this page."
        : raw;
    if (message === lastCloudError.current) return;
    lastCloudError.current = message;
    toast.error("Not saved to your account", { description: message });
  }, []);

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
        if (mounted.current) setRemoteBusinesses(list);
      } catch {
        if (!mounted.current) return;
        toast.error("Could not load your account's businesses", {
          description: "For now, Precog lists only the businesses on this device.",
          action: { label: "Try again", onClick: () => void attempt() },
        });
      }
    };
    return attempt();
  }, []);

  useEffect(() => {
    if (!ready || isPending) return;
    if (!authEnabled || !userId || userIsDevFallback) {
      setSyncStatus(localStatus(lastLocalWrite.current));
      cloudLoadedFor.current = null;
      cloudRevision.current.clear();
      saveConflictRef.current = null;
      setSaveConflict(null);
      return;
    }
    if (cloudLoadedFor.current === userId) return;

    let cancelled = false;
    setSyncStatus("loading");
    void refreshBusinessList();
    void loadBusinessProfile({ data: { today: localDateKey(new Date()) } })
      .then((res) => {
        if (cancelled) return;
        cloudLoadedFor.current = userId;
        const local = profileRef.current;
        const localId = local.businessId ?? DEFAULT_BUSINESS_ID;
        if (res.found && res.profile) {
          // Cloud rows skip the client normaliser on the way in unless we run it here.
          const remoteProfile = normalizeProfile(res.profile);
          const id = remoteProfile.businessId ?? DEFAULT_BUSINESS_ID;
          if (res.revision !== null) rememberRevision(id, res.revision);

          // This is only the verified account's namespace. Guest or legacy work is
          // never silently attached to the account during sign-in.
          if (id !== localId && hasUserWork(local)) savePortfolioEntry(local, workspace.local);

          // Same business, edited here before signing in (also over a legacy
          // account copy with no revision yet): let the owner choose instead
          // of silently replacing their work.
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
          rememberStamp(id, remoteProfile.updatedAt);
          acknowledged.current.set(id, remoteProfile);
          skipNextCloudSave.current = true;
          activateProfile(remoteProfile);
          savePortfolioEntry(remoteProfile, workspace.local);
          setSyncStatus("synced");
          return;
        }
        // Nothing in the account to open. The business here is on this device
        // only until its next change is saved; a previously known base revision
        // is kept, since missing is not permission to recreate.
        setSyncStatus(localStatus(lastLocalWrite.current));
      })
      .catch(() => {
        if (!cancelled)
          setSyncStatus(lastLocalWrite.current === "failed" ? "local-error" : "error");
      });

    return () => {
      cancelled = true;
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
    workspace.local,
    rememberRevision,
    rememberStamp,
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
      storedProfile.current = profile;
      lastLocalWrite.current = "saved";
      if (!cloudUser) setSyncStatus("local");
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
    if (!cloudUser) setSyncStatus(localStatus(lastLocalWrite.current));
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
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      savePortfolioEntry(profile, workspace.local);
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
    cloudUser,
    saveCloud,
    localStore,
    lineage,
    raiseTabConflict,
    reportCloudError,
    workspace.local,
  ]);

  // Another tab saved the open business. When it built on this tab's copy
  // and nothing here is unsaved, take it (a toast says so); otherwise stop
  // and let the owner choose, so neither tab's work is overwritten unseen.
  useEffect(() => {
    if (!ready) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== workspace.local?.physicalKey(ACTIVE_PROFILE_KEY)) return;
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
  }, [ready, localStore, raiseTabConflict, profileRef, setProfile, clearHistory, workspace.local]);

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
      savePortfolioEntry(cur, workspace.local);
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
  }, [ready, userId, cloudUser, saveCloud, reportCloudError, profileRef, workspace.local]);

  /**
   * Write the open business to this browser, now. False when another tab's
   * save stops it: the banner asks the owner first, and leaving now would
   * save the stale version over the newer.
   */
  const flushLocal = useCallback(() => {
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
    savePortfolioEntry(cur, workspace.local);
    return true;
  }, [localStore, raiseTabConflict, profileRef, workspace.local]);

  /** Write the open business everywhere it goes, now. False when a conflict or a failed save stops it. */
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
      rememberStamp(id, opened.updatedAt);
      acknowledged.current.set(id, opened);
      skipNextCloudSave.current = true;
    },
    [rememberRevision, rememberStamp],
  );

  /** Keeps a version the owner did not choose as its own business, so no work is lost. */
  const keepAsCopy = useCallback(
    (version: PracticeProfile, from: string) => {
      const name = copyName(version.practiceName, from);
      savePortfolioEntry(
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
      bumpPortfolio();
      return name;
    },
    [bumpPortfolio, userId, workspace.local],
  );

  const resolveSaveConflict = useCallback(
    async (choice: "reload" | "overwrite") => {
      const conflict = saveConflictRef.current;
      if (!conflict) return;
      const id = conflict.businessId;
      saveConflictRef.current = null;
      setSaveConflict(null);
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
        const local = loadPortfolio(workspace.local)[id];
        if (choice === "reload") {
          const accountCopy = { ...conflict.remote, businessId: id };
          const kept = local ? keepAsCopy(local, "copy from this device") : null;
          savePortfolioEntry(accountCopy, workspace.local);
          acknowledged.current.set(id, accountCopy);
          rememberStamp(id, accountCopy.updatedAt);
          bumpPortfolio();
          toast(`Precog now holds the account's copy of ${accountCopy.practiceName}.`, {
            description: kept
              ? `Precog keeps this device's copy as “${kept}” in your businesses.`
              : undefined,
          });
        } else {
          const kept = keepAsCopy(conflict.remote, "copy from your account");
          toast("Kept this device's copy.", {
            description: `Precog keeps the account's copy as “${kept}” in your businesses.`,
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
            lastLocalWrite.current = "saved";
          }
          activateProfile(theirs);
          toast("Loaded the copy saved in the other tab.", {
            description: `Precog keeps this tab's copy as “${kept}” in your businesses.`,
          });
          return;
        }
        const kept = keepAsCopy(theirs, "copy from another tab");
        // The owner chose this tab's version over theirs, in the account too.
        lineage.add(id, theirs.updatedAt);
        const result = localStore.write(mine, { force: true });
        lastLocalWrite.current = result.kind === "saved" ? "saved" : "failed";
        if (result.kind === "saved") storedProfile.current = mine;
        savePortfolioEntry(mine, workspace.local);
        toast("Kept this tab's copy.", {
          description: `Precog keeps the other tab's copy as “${kept}” in your businesses.`,
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

      // As between two tabs, the version the owner did not pick stays
      // reachable as a copy in their businesses.
      if (choice === "reload") {
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
          description: `Precog keeps this device's copy as “${kept}” in your businesses.`,
        });
        return;
      }

      const kept = keepAsCopy(conflict.remote, "copy from your account");
      setSyncStatus("saving");
      toast("Kept this device's copy.", {
        description: `Precog keeps the account's copy as “${kept}” in your businesses.`,
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
        const saved = await flushActive();
        if (saved) return true;
        const next = transition === "sign-in" ? "continue signing in" : "sign out";
        if (
          !window.confirm(
            `Some work has not synced. Export a local recovery copy and ${next}? Cancel keeps this workspace open.`,
          )
        )
          return false;
        downloadText(
          "precog-unsynced-recovery.json",
          JSON.stringify(
            {
              version: 1,
              accountId: workspace.accountId,
              profile: profileRef.current,
              local: workspace.local?.entries() ?? {},
              session: workspace.session?.entries() ?? {},
            },
            null,
            2,
          ),
          "application/json",
        );
        return true;
      }),
    [flushActive, profileRef, workspace],
  );

  return {
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
