import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "../practice-provider";
import {
  ACTIVE_PROFILE_KEY,
  loadPortfolio,
  makeBusinessId,
  normalizeProfile,
  type PracticeProfile,
} from "../practice-profile";
import { saveBusinessProfile } from "../profile-server";
import { readSetupDraft, draftHasTypedWork } from "../onboarding/setup-draft";
import { cloudAcknowledgement } from "./save-coordinator";
import {
  browserWorkspace,
  clearWorkspace,
  exportWorkspace,
  profileOwner,
  rawBrowserStorage,
  registerWorkspaceExitGuard,
  scopedStorage,
  type WorkspaceToken,
} from "./workspace";

function downloadRecovery(value: unknown): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "precog-workspace-recovery.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** User-controlled recovery for the currently verified account only. */
export function WorkspaceRecovery({ token }: { token: WorkspaceToken }) {
  const { profile, ready, replaceProfile } = usePractice();
  const current = useRef<PracticeProfile>(profile);
  current.current = profile;
  const [exitOpen, setExitOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exported, setExported] = useState(false);
  const [hasGuest, setHasGuest] = useState(false);
  const resolveExit = useRef<((value: boolean) => void) | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const accountCleared = useRef(false);

  useEffect(() => {
    const raw = rawBrowserStorage();
    if (!raw) return;
    setHasGuest(
      token.owner !== null && Boolean(scopedStorage(raw, null).getItem(ACTIVE_PROFILE_KEY)),
    );
  }, [token, ready]);

  function dirtyProfiles(): PracticeProfile[] {
    const all = { ...loadPortfolio() } as Record<string, PracticeProfile>;
    const active = current.current;
    all[active.businessId ?? "biz_default"] = active;
    return Object.values(all).filter(
      (p) =>
        profileOwner(p) === token.owner &&
        p.onboardingComplete !== false &&
        cloudAcknowledgement(p.businessId ?? "biz_default")?.updatedAt !== p.updatedAt,
    );
  }

  useEffect(() => {
    const onCleared = () => {
      accountCleared.current = true;
    };
    window.addEventListener("precog:local-data-cleared", onCleared);
    const unregister = registerWorkspaceExitGuard(async () => {
      if (token.owner === null || accountCleared.current) return true;
      if (!browserWorkspace.isCurrent(token)) return true;
      const draft = readSetupDraft();
      if (!dirtyProfiles().length && !(draft && draftHasTypedWork(draft))) {
        clearWorkspace(token.owner);
        return true;
      }
      if (resolveExit.current) return false;
      setError("");
      setExported(false);
      setExitOpen(true);
      return new Promise<boolean>((resolve) => {
        resolveExit.current = resolve;
      });
    });
    return () => {
      unregister();
      resolveExit.current?.(false);
      window.removeEventListener("precog:local-data-cleared", onCleared);
    };
    // The guard reads the latest profile through the ref, not a stale render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (exitOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [exitOpen]);

  function finishExit(leave: boolean) {
    if (leave) clearWorkspace(token.owner);
    setExitOpen(false);
    resolveExit.current?.(leave);
    resolveExit.current = undefined;
  }

  async function saveAndExit() {
    setBusy(true);
    setError("");
    try {
      const draft = readSetupDraft();
      if (draft && draftHasTypedWork(draft)) {
        throw new Error(
          "Unfinished setup is not a saved business. Export it, finish setup, or stay signed in.",
        );
      }
      for (const p of dirtyProfiles()) {
        const result = await saveBusinessProfile({
          data: {
            profile: p,
            industry: p.industry,
            baseRevision: cloudAcknowledgement(p.businessId ?? "biz_default")?.revision ?? null,
          },
        });
        if (!result.ok) {
          throw new Error(
            "Another version exists. Resolve the conflict or export your local work before leaving.",
          );
        }
      }
      finishExit(true);
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Save failed. No local work was discarded.",
      );
    } finally {
      setBusy(false);
    }
  }

  function importGuest() {
    const raw = rawBrowserStorage();
    if (!raw || token.owner === null) return;
    const stored = scopedStorage(raw, null).getItem(ACTIVE_PROFILE_KEY);
    if (!stored) return;
    if (
      !window.confirm(
        "Import the active guest business into this account as a new business? The guest copy remains on this device. Continue only if this is your data.",
      )
    )
      return;
    try {
      const guest = normalizeProfile(JSON.parse(stored));
      const imported: PracticeProfile = {
        ...guest,
        businessId: makeBusinessId(),
        workspaceOwnerId: token.owner,
      };
      replaceProfile(imported);
      toast.success("Guest work imported locally. Check the save indicator before leaving.");
    } catch {
      toast.error("The guest copy could not be read. It has not been removed.");
    }
  }

  return (
    <>
      {hasGuest && ready && (
        <aside className="flex items-center gap-3 border-b border-border bg-panel px-4 py-2 text-xs">
          <span>Guest work is separate from this account.</span>
          <button type="button" className="underline" onClick={importGuest}>
            Import guest work
          </button>
        </aside>
      )}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) finishExit(false);
        }}
        className="max-w-xl rounded-xl border border-border bg-panel p-6 text-fg backdrop:bg-black/60"
        aria-labelledby="workspace-exit-title"
      >
        <h2 id="workspace-exit-title" className="text-lg font-semibold">
          Protect your unsaved work
        </h2>
        <p className="my-3">
          Some work is not acknowledged by the server. Save it, export a recovery copy, or remain
          signed in.
        </p>
        {error && (
          <p role="alert" className="my-3 text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded border px-3 py-2"
            onClick={() => void saveAndExit()}
          >
            Save and sign out
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded border px-3 py-2"
            onClick={() => {
              browserWorkspace.assertCurrent(token);
              downloadRecovery({
                version: 1,
                records: exportWorkspace(token.owner),
                active: current.current,
              });
              setExported(true);
            }}
          >
            Export recovery copy
          </button>
          {exported && (
            <button
              type="button"
              disabled={busy}
              className="rounded border px-3 py-2"
              onClick={() => finishExit(true)}
            >
              I saved my export; sign out
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className="rounded border px-3 py-2"
            onClick={() => {
              if (
                window.confirm(
                  "Discard unsynced work in this account's local workspace? This cannot be undone.",
                )
              )
                finishExit(true);
            }}
          >
            Discard and sign out
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded border px-3 py-2"
            onClick={() => finishExit(false)}
          >
            Stay signed in
          </button>
        </div>
      </dialog>
    </>
  );
}
