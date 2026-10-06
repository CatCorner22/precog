/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace, type Workspace } from "@/lib/precog/workspace-context";
import { scopedBrowserStorage } from "@/lib/precog/workspace-storage";
import { clearLocalCopies } from "@/lib/precog/local-data";
import {
  CLEAR_LOCAL_CONFIRM,
  RestoreError,
  downloadRecoveryCopy,
  restoreFromRecoveryText,
  restoreMessage,
} from "@/lib/precog/recovery-copy";
import { reportClientError } from "@/lib/observability/report-browser";

/**
 * The workspace the crash screen's recovery buttons act on. Inside the
 * business workspace that is the workspace itself. A crash in the workspace's
 * own provider (unreadable saved data, the case these buttons exist for) is
 * caught above it, so the screen opens the same account's browser storage
 * directly: `accountId` is the signed-in account the provider keys its
 * workspace by, null for a guest.
 */
export function recoveryWorkspace(context: Workspace, accountId: string | null): Workspace {
  if (context.local) return context;
  return {
    accountId,
    local: scopedBrowserStorage(accountId),
    session: scopedBrowserStorage(accountId, true),
  };
}

const noSubscription = () => () => undefined;

/**
 * The crash screen's workspace. Null storage while the server renders and
 * while the page hydrates (the server has no browser storage, so the buttons
 * match its markup), and while the account is still being checked. Outside
 * the workspace the account is read on demand (`./auth/session-account`), so
 * every public page that only carries this screen does not load the auth
 * client.
 */
function useRecoveryWorkspace(): Workspace {
  const context = useWorkspace();
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [account, setAccount] = useState<{ checked: boolean; id: string | null }>({
    checked: false,
    id: null,
  });
  const inWorkspace = context.local !== null;
  useEffect(() => {
    if (!hydrated || inWorkspace) return;
    let cancelled = false;
    import("@/lib/auth/session-account")
      .then((m) => m.currentAccountId())
      .then(
        (id) => !cancelled && setAccount({ checked: true, id }),
        () => !cancelled && setAccount({ checked: true, id: null }),
      );
    return () => {
      cancelled = true;
    };
  }, [hydrated, inWorkspace]);
  return useMemo(() => {
    if (!hydrated || (!inWorkspace && !account.checked)) {
      return { accountId: context.accountId, local: null, session: null };
    }
    return recoveryWorkspace(context, account.id);
  }, [context, hydrated, inWorkspace, account]);
}

/**
 * The screen shown when a route crashes. It keeps the real error message
 * visible and gives the owner ways out: reload; download a recovery copy of
 * what this browser keeps; restore the businesses from a recovery copy; or
 * clear the saved local data (the usual cause of a crash that survives a
 * reload) and then reload. The download comes first, so clearing never has
 * to cost work. Cloud copies are untouched; a signed-in owner's business
 * reloads from them.
 */
export function AppErrorComponent({ error }: ErrorComponentProps) {
  const workspace = useRecoveryWorkspace();
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  return <CrashScreen error={error} workspace={workspace} />;
}

export function CrashScreen({ error, workspace }: { error: unknown; workspace: Workspace }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  function reload() {
    window.location.reload();
  }
  function downloadRecovery() {
    // Blocked storage, a likely cause of the crash, can refuse this read too.
    try {
      downloadRecoveryCopy(workspace, null);
      setProblem(null);
    } catch (cause) {
      const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : "";
      setProblem(`Precog could not read this browser's saved data.${detail}`);
    }
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    setRestoring(true);
    setProblem(null);
    setRestored(null);
    try {
      const result = await restoreFromRecoveryText(await file.text(), workspace.local);
      setRestored(restoreMessage(result));
    } catch (cause) {
      setProblem(
        cause instanceof RestoreError
          ? cause.message
          : "Precog could not restore from this file. Check that it is the recovery copy Precog downloaded.",
      );
    } finally {
      setRestoring(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function clearAndReload() {
    if (!window.confirm(CLEAR_LOCAL_CONFIRM)) return;
    clearLocalCopies(workspace.local);
    workspace.session?.clear();
    window.location.replace("/");
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {(error instanceof Error && error.message) ||
          "An unexpected error occurred. Try reloading the page."}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={reload}>
          Reload
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={downloadRecovery}
          disabled={!workspace.local}
        >
          Download a recovery copy
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInput.current?.click()}
          disabled={!workspace.local || restoring}
        >
          Restore from a recovery file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="Recovery file to restore"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void restore(event.currentTarget.files?.[0])}
        />
        <Button variant="secondary" size="sm" onClick={clearAndReload} disabled={!workspace.local}>
          Clear the saved data on this device and reload
        </Button>
      </div>
      {restored && (
        <p className="max-w-md text-sm break-words" role="status">
          {restored}
        </p>
      )}
      {problem && (
        <p className="max-w-md text-sm break-words text-danger" role="alert">
          {problem}
        </p>
      )}
      <p className="max-w-md text-xs text-muted">
        Clearing removes only the copy kept in this browser. A signed-in account reloads its
        business from the cloud; a signed-out visitor starts over.
      </p>
    </main>
  );
}
