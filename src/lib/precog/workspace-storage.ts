import type { StorageLike } from "./local-data";

export interface KeyedStorage extends StorageLike {
  readonly length: number;
  key(index: number): string | null;
}
export const WORKSPACE_PREFIX = "precog.workspace.v2:";
export function workspacePrefix(accountId: string | null): string {
  return `${WORKSPACE_PREFIX}${accountId === null ? "guest" : `account:${encodeURIComponent(accountId)}`}:`;
}
/** Immutable namespace: old callbacks cannot be redirected to the next account's data. */
export class ScopedStorage implements KeyedStorage {
  readonly prefix: string;
  constructor(
    private readonly raw: KeyedStorage,
    accountId: string | null,
  ) {
    this.prefix = workspacePrefix(accountId);
  }
  physicalKey(key: string) {
    return this.prefix + key;
  }
  getItem(key: string) {
    return this.raw.getItem(this.physicalKey(key));
  }
  setItem(key: string, value: string) {
    this.raw.setItem(this.physicalKey(key), value);
  }
  removeItem(key: string) {
    this.raw.removeItem(this.physicalKey(key));
  }
  private keys() {
    const keys: string[] = [];
    for (let i = 0; i < this.raw.length; i += 1) {
      const key = this.raw.key(i);
      if (key?.startsWith(this.prefix)) keys.push(key.slice(this.prefix.length));
    }
    return keys;
  }
  get length() {
    return this.keys().length;
  }
  key(index: number) {
    return this.keys()[index] ?? null;
  }
  entries(): Record<string, string> {
    return Object.fromEntries(
      this.keys().flatMap((key) => {
        const value = this.getItem(key);
        return value === null ? [] : [[key, value]];
      }),
    );
  }
  clear() {
    for (const key of this.keys()) this.removeItem(key);
  }
}
export function scopedBrowserStorage(
  accountId: string | null,
  session = false,
): ScopedStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return new ScopedStorage(session ? window.sessionStorage : window.localStorage, accountId);
  } catch {
    return null;
  }
}

/** Serializes saves per business and permanently closes abandoned queues. */
export class BusinessSaveQueue {
  private readonly pending = new Map<string, Promise<unknown>>();
  private closed = false;
  close() {
    this.closed = true;
  }
  run<T>(id: string, work: () => Promise<T>): Promise<T> {
    const prior = this.pending.get(id) ?? Promise.resolve();
    const task = prior
      .catch(() => undefined)
      .then(() => {
        if (this.closed) throw new Error("This workspace is closed");
        return work();
      });
    this.pending.set(id, task);
    void task
      .finally(() => {
        if (this.pending.get(id) === task) this.pending.delete(id);
      })
      .catch(() => undefined);
    return task;
  }
}

/** Compare contents, not clock timestamps, before removing a synchronized copy. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry))
      return Object.fromEntries(
        Object.keys(entry)
          .sort()
          .map((key) => [key, entry[key]]),
      );
    return entry;
  });
}
export function removeAcknowledgedCopies(
  storage: ScopedStorage | null,
  acknowledged: ReadonlyMap<string, unknown>,
): void {
  if (!storage) return;
  const matches = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const { localRev: _rev, localBase: _base, ...profile } = value as Record<string, unknown>;
    const id = typeof profile.businessId === "string" ? profile.businessId : "biz_default";
    const saved = acknowledged.get(id);
    return saved !== undefined && canonical(profile) === canonical(saved);
  };
  // Errors or unfamiliar formats are kept, never guessed clean.
  try {
    const active = storage.getItem("precog.practiceProfile.v2");
    if (active && matches(JSON.parse(active))) storage.removeItem("precog.practiceProfile.v2");
    const raw = storage.getItem("precog.portfolio.v1");
    if (!raw) return;
    const portfolio = JSON.parse(raw);
    if (!portfolio || typeof portfolio !== "object" || Array.isArray(portfolio)) return;
    const remaining = Object.fromEntries(Object.entries(portfolio).filter(([, p]) => !matches(p)));
    if (Object.keys(remaining).length)
      storage.setItem("precog.portfolio.v1", JSON.stringify(remaining));
    else storage.removeItem("precog.portfolio.v1");
  } catch {
    /* Preserve copies whose persistence or contents cannot be verified. */
  }
}
