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
  registerAccountExit,
  registerAccountCleanup,
} from "@/lib/auth/identity-change";
import { downloadText } from "@/lib/download";
import { BusinessSaveQueue, removeAcknowledgedCopies } from "./workspace-storage";
import type { Workspace } from "./workspace-context";
import { authEnabled } from "@/lib/auth/client";
import { listBusinesses, loadBusinessProfile, saveBusinessProfile } from "./profile-server";
import { localDateKey } from "./decisions/follow-through";
import {
  ACTIVE_PROFILE_KEY,
  hasUserWork,
  makeBusinessId,
  normalizeProfile,
  savePortfolioEntry,
  type BusinessSummary,
  type PracticeProfile,
} from "./practice-profile";
import type { AccountLineage, LocalProfileStore } from "./save-conflict";
import { canKeepLocalData, readLocalJson, writeLocal } from "./local-data";
import type { ProfileAction } from "./profile-reducer";

export type SyncStatus =
  "idle" | "loading" | "synced" | "local" | "local-error" | "error" | "conflict";

/**
 * Why the conflict banner is up: another writer beat us to the account copy,
 * a sign-in met local work, or another tab in this browser saved this
 * business since this tab last did.
 */
export type SaveConflictReason = "remote-edit" | "sign-in" | "other-tab";

export interface SaveConflictState {
  reason: SaveConflictReason;
  remote: PracticeProfile;
  /** The account copy's revision; null for another tab's copy, which has none. */
  revision: number | null;
  updatedAt: string;
}

const SAVE_DEBOUNCE_MS = 1200;

/** Copies the owner can go back to, named for where they came from. */
function copyName(name: string, from: string): string {
  const suffix = ` (${from})`;
  return `${name.slice(0, 80 - suffix.length).trim()}${suffix}`;
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
  useEffect(() => {
    window.addEventListener("precog:portfolio-change", bumpPortfolio);
    return () => window.removeEventListener("precog:portfolio-change", bumpPortfolio);
  }, [bumpPortfolio]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudRevision = useRef<Map<string, number>>(new Map());
  const basesLoaded = useRef(false);
  if (!basesLoaded.current) {
    basesLoaded.current = true;
    const held = readLocalJson("precog.cloud-bases.v1", workspace.local);
    if (held && typeof held === "object")
      for (const [id, revision] of Object.entries(held))
        if (typeof revision === "number" && Number.isSafeInteger(revision) && revision > 0)
          cloudRevision.current.set(id, revision);
  }
  const syncedStamps = useRef<Record<string, string>>({});
  const acknowledged = useRef(new Map<string, PracticeProfile>());
  useEffect(
    () =>
      registerAccountCleanup(() => {
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
  const rememberRevision = useCallback(
    (id: string, revision: number) => {
      cloudRevision.current.set(id, revision);
      writeLocal(
        "precog.cloud-bases.v1",
        JSON.stringify(Object.fromEntries(cloudRevision.current)),
        workspace.local,
      );
    },
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
      const id = current.businessId ?? "biz_default";
      const identity = identitySnapshot();
      if (!mounted.current || !identityUnchanged(identity) || identity.accountId !== userId)
        return false;
      return queue.current.run(id, async () => {
        if (!mounted.current || !identityUnchanged(identity) || !userId) return false;
        const result = await saveBusinessProfile({
          data: {
            expectedAccountId: userId,
            profile: current,
            industry: current.industry,
            baseRevision: cloudRevision.current.get(id) ?? null,
            today: localDateKey(new Date()),
          },
        });
        if (!mounted.current || !identityUnchanged(identity)) return false;
        if (result.ok) {
          rememberRevision(id, result.revision);
          acknowledged.current.set(id, current);
          lineage.add(id, current.updatedAt);
          syncedStamps.current[id] = current.updatedAt;
          writeLocal(
            "precog.cloud-stamps.v1",
            JSON.stringify(syncedStamps.current),
            workspace.local,
          );
          lastCloudError.current = null;
          if (profileRef.current === current) setSyncStatus("synced");
          return true;
        }
        // A timestamp is not proof that a conflicting remote version was incorporated.
        // Never retry an overwrite solely because client clocks happen to agree.
        raiseConflict({
          reason: "remote-edit",
          remote: normalizeProfile(result.profile),
          revision: result.revision,
          updatedAt: result.updatedAt,
        });
        return false;
      });
    },
    [lineage, raiseConflict, rememberRevision, userId, profileRef, workspace.local],
  );

  /**
   * A save to the account failed. The badge says so; the reason (the
   * account's business limit, a lost connection) is shown once, not on
   * every retry.
   */
  const reportCloudError = useCallback((error: unknown) => {
    if (!mounted.current) return;
    setSyncStatus("error");
    const raw = error instanceof Error ? error.message.trim() : "";
    const message =
      !raw || /fetch|network|load failed/i.test(raw)
        ? lastLocalWrite.current === "saved"
          ? "Could not reach the server. Your work is saved in this account's browser workspace; make another change to retry."
          : "Could not reach the server or save locally. Export a recovery copy before closing this page."
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
        remote: theirs,
        revision: null,
        updatedAt: theirs.updatedAt,
      });
    },
    [raiseConflict],
  );

  // Bootstrap: local first, then cloud when signed in
  useEffect(() => {
    const stamps = readLocalJson("precog.cloud-stamps.v1", workspace.local);
    if (stamps && typeof stamps === "object")
      syncedStamps.current = Object.fromEntries(
        Object.entries(stamps).filter(([, value]) => typeof value === "string"),
      );
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
          if (res.revision !== null) rememberRevision(id, res.revision);

          // This is only the verified account's namespace. Guest or legacy work is
          // never silently attached to the account during sign-in.
          if (id !== localId && hasUserWork(local)) savePortfolioEntry(local, workspace.local);

          if (id === localId && hasUserWork(local) && res.revision !== null) {
            const localNewer =
              local.updatedAt !== remoteProfile.updatedAt &&
              syncedStamps.current[id] !== local.updatedAt;
            if (localNewer) {
              // Same business, edited here before signing in: let the user
              // choose instead of silently replacing their work.
              setRemoteBusinesses(list);
              raiseConflict({
                reason: "sign-in",
                remote: remoteProfile,
                revision: res.revision,
                updatedAt: res.updatedAt,
              });
              return;
            }
          }

          // The save effect writes it to this browser as the open business.
          syncedStamps.current[id] = remoteProfile.updatedAt;
          writeLocal(
            "precog.cloud-stamps.v1",
            JSON.stringify(syncedStamps.current),
            workspace.local,
          );
          acknowledged.current.set(id, remoteProfile);
          skipNextCloudSave.current = true;
          activateProfile(remoteProfile);
          savePortfolioEntry(remoteProfile, workspace.local);
        } // Keep a previously known base revision: missing is not permission to recreate.
        setRemoteBusinesses(list);
        setSyncStatus("synced");
      })
      .catch(() => {
        if (!cancelled) setSyncStatus("error");
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
    saveCloud,
    profileRef,
    raiseConflict,
    workspace.local,
    rememberRevision,
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
      lineage.add(profile.businessId ?? "biz_default", profile.updatedAt);
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
    if (!cloudUser) setSyncStatus(lastLocalWrite.current === "failed" ? "local-error" : "local");
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

  /** Write the open business everywhere it goes, now. False when a conflict stops it. */
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
    savePortfolioEntry(cur, workspace.local);
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
  }, [
    cloudUser,
    saveCloud,
    userId,
    localStore,
    raiseTabConflict,
    reportCloudError,
    profileRef,
    workspace.local,
  ]);

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
        },
        workspace.local,
      );
      bumpPortfolio();
      return name;
    },
    [bumpPortfolio, workspace.local],
  );

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
        savePortfolioEntry(mine, workspace.local);
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
    [
      activateProfile,
      saveCloud,
      localStore,
      lineage,
      keepAsCopy,
      reportCloudError,
      profileRef,
      workspace.local,
    ],
  );

  useEffect(
    () =>
      registerAccountExit(async () => {
        if (!mounted.current) return true;
        const saved = await flushActive();
        if (saved) return true;
        if (
          !window.confirm(
            "Some work is not synced. Export a local recovery copy and sign out? Cancel keeps this workspace open.",
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
    resolveSaveConflict,
    flushActive,
    cloudUser,
    cloudRevision,
    remoteBusinesses,
    setRemoteBusinesses,
    portfolioVersion,
    bumpPortfolio,
  };
}
