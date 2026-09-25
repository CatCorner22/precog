/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, type ReactNode } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PracticeProvider as DomainProvider } from "./practice-provider";
import { ACTIVE_PROFILE_KEY } from "./practice-profile";
import {
  browserWorkspace,
  IDENTITY_EVENT_KEY,
  workspacePrefix,
  type WorkspaceToken,
} from "./sync/workspace";
import { WorkspaceRecovery } from "./sync/workspace-recovery";

export * from "./practice-provider";

/**
 * Keep the domain provider's public API, but never mount its local-first
 * bootstrap until identity is known. An identity transition unmounts the
 * entire old provider, including its timers, undo stack, portfolio and cache.
 */
export function PracticeProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const owner = user?.id ?? null;
  const [token, setToken] = useState<WorkspaceToken>();
  const [interrupted, setInterrupted] = useState(false);

  useEffect(() => {
    if (isPending || interrupted) return;
    const next = browserWorkspace.activate(owner);
    setToken(next);
    return () => {
      if (browserWorkspace.isCurrent(next)) browserWorkspace.invalidate();
    };
  }, [owner, isPending, interrupted]);

  useEffect(() => {
    if (!token) return;
    const prefix = workspacePrefix(token.owner);
    function onStorage(event: StorageEvent) {
      if (event.key === IDENTITY_EVENT_KEY) {
        browserWorkspace.invalidate();
        setInterrupted(true);
        return;
      }
      // The legacy domain provider listens to the logical active-profile key.
      // Forward only this account's physical key; never another account's.
      if (event.key === prefix + ACTIVE_PROFILE_KEY && browserWorkspace.isCurrent(token!)) {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: ACTIVE_PROFILE_KEY,
            oldValue: event.oldValue,
            newValue: event.newValue,
            url: event.url,
          }),
        );
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [token]);

  if (interrupted) {
    return (
      <main className="mx-auto max-w-xl p-8" role="alert">
        <h1 className="text-xl font-semibold">The account changed in another tab</h1>
        <p className="my-4">
          This workspace has stopped saving. Its local recovery copy stays with its original
          account.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded border px-4 py-2"
        >
          Reload the current account
        </button>
      </main>
    );
  }
  if (isPending || !token || token.owner !== owner || !browserWorkspace.isCurrent(token)) {
    return (
      <div className="p-8" role="status">
        Opening your workspace…
      </div>
    );
  }
  return (
    <DomainProvider key={token.epoch}>
      <WorkspaceRecovery token={token} />
      {children}
    </DomainProvider>
  );
}
