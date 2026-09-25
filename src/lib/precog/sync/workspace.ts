import type { StorageLike } from "../local-data";

export type WorkspaceOwner = string | null;
export interface WorkspaceToken {
  readonly owner: WorkspaceOwner;
  readonly epoch: number;
}

/** Identity epochs invalidate asynchronous work even when A signs in as A again. */
export class WorkspaceSession {
  private current: WorkspaceToken | undefined;
  private epoch = 0;

  activate(owner: WorkspaceOwner): WorkspaceToken {
    this.current = Object.freeze({ owner, epoch: ++this.epoch });
    return this.current;
  }

  snapshot(): WorkspaceToken | undefined {
    return this.current;
  }

  invalidate(): void {
    this.epoch += 1;
    this.current = undefined;
  }

  isCurrent(token: WorkspaceToken): boolean {
    return this.current === token;
  }

  assertCurrent(token: WorkspaceToken): void {
    if (!this.isCurrent(token))
      throw new Error("Account changed. Old workspace operation cancelled.");
  }
}

export const browserWorkspace = new WorkspaceSession();
export const IDENTITY_EVENT_KEY = "precog.workspace.identity.v3";
export const WORKSPACE_PREFIX = "precog.workspace.v3:";

export function workspacePrefix(owner: WorkspaceOwner): string {
  return `${WORKSPACE_PREFIX}${owner === null ? "guest" : `account:${encodeURIComponent(owner)}`}:`;
}

export function profileOwner(value: unknown): WorkspaceOwner | undefined {
  if (!value || typeof value !== "object") return undefined;
  const owner = (value as { workspaceOwnerId?: unknown }).workspaceOwnerId;
  return owner === null || typeof owner === "string" ? owner : undefined;
}

/** A provenance check, never a source of server authorization. */
export function assertProfileOwner(value: unknown, owner: WorkspaceOwner): void {
  if (profileOwner(value) !== owner) {
    throw new Error(
      "This profile belongs to a different or unassigned workspace. It was not saved.",
    );
  }
}

export interface KeyedStorage extends StorageLike {
  readonly length: number;
  key(index: number): string | null;
}

export function rawBrowserStorage(kind: "local" | "session" = "local"): KeyedStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Namespacing prevents accidental cross-account reads; it is not encryption
 * against someone controlling the browser profile. Adapters capture their
 * identity epoch so an old callback cannot silently retarget a new account.
 */
export function scopedStorage(
  raw: KeyedStorage,
  owner: WorkspaceOwner,
  guard: () => void = () => undefined,
): KeyedStorage {
  const prefix = workspacePrefix(owner);
  const keys = () => {
    const out: string[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      const key = raw.key(i);
      if (key?.startsWith(prefix)) out.push(key.slice(prefix.length));
    }
    return out;
  };
  return {
    get length() {
      guard();
      return keys().length;
    },
    key(index) {
      guard();
      return keys()[index] ?? null;
    },
    getItem(key) {
      guard();
      return raw.getItem(prefix + key);
    },
    setItem(key, value) {
      guard();
      // Active profiles and portfolio entries must retain their origin. This
      // catches even a late old callback that obtains a new default adapter.
      if (key.startsWith("precog.practiceProfile") || key === "precog.portfolio.v1") {
        const parsed = JSON.parse(value) as unknown;
        if (key === "precog.portfolio.v1") {
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Invalid portfolio");
          }
          for (const profile of Object.values(parsed)) assertProfileOwner(profile, owner);
        } else {
          assertProfileOwner(parsed, owner);
        }
      }
      raw.setItem(prefix + key, value);
    },
    removeItem(key) {
      guard();
      raw.removeItem(prefix + key);
    },
  };
}

export function currentStorage(kind: "local" | "session" = "local"): KeyedStorage | null {
  const token = browserWorkspace.snapshot();
  const raw = rawBrowserStorage(kind);
  if (!token || !raw) return null;
  return scopedStorage(raw, token.owner, () => browserWorkspace.assertCurrent(token));
}

export function clearWorkspace(owner: WorkspaceOwner): void {
  for (const kind of ["local", "session"] as const) {
    const raw = rawBrowserStorage(kind);
    if (!raw) continue;
    const store = scopedStorage(raw, owner);
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
    for (const key of keys) if (key !== null) store.removeItem(key);
  }
}

export function exportWorkspace(owner: WorkspaceOwner): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kind of ["local", "session"] as const) {
    const raw = rawBrowserStorage(kind);
    if (!raw) continue;
    const store = scopedStorage(raw, owner);
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key === null) continue;
      const value = store.getItem(key);
      try {
        out[`${kind}:${key}`] = value === null ? null : JSON.parse(value);
      } catch {
        out[`${kind}:${key}`] = value;
      }
    }
  }
  return out;
}

let exitGuard: (() => Promise<boolean>) | undefined;
export function registerWorkspaceExitGuard(guard: () => Promise<boolean>): () => void {
  exitGuard = guard;
  return () => {
    if (exitGuard === guard) exitGuard = undefined;
  };
}

export async function prepareWorkspaceExit(): Promise<boolean> {
  return exitGuard ? exitGuard() : true;
}
