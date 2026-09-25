/** The part of the Web Storage API this app uses; tests pass their own. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * This browser's local storage, or null where there is none (the server) or
 * where even touching it throws (site data blocked).
 */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** One stored value, or null when it is absent or the browser refuses the read. */
export function readLocal(key: string, storage = browserStorage()): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Stores one value. Returns false when the browser refuses the write (blocked
 * site data, private mode, full quota), so callers can say so instead of
 * letting the exception unwind through React and blank the view.
 */
export function writeLocal(key: string, value: string, storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Removes one value; does nothing when storage is unavailable. */
export function removeLocal(key: string, storage = browserStorage()): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

/** One stored value parsed as JSON; undefined when absent, unreadable or not JSON. */
export function readLocalJson(key: string, storage = browserStorage()): unknown {
  const raw = readLocal(key, storage);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

const PROBE_KEY = "precog.storage-probe";

/** True when this browser keeps what the app writes (a write and a removal both succeed). */
export function canKeepLocalData(storage = browserStorage()): boolean {
  if (!writeLocal(PROBE_KEY, "1", storage)) return false;
  removeLocal(PROBE_KEY, storage);
  return true;
}

/** Every key this app writes starts with one of these (value proof uses the dash form). */
const APP_KEY_PREFIXES = ["precog.", "precog-"];

/**
 * Clears every local copy this app keeps in the browser (profile, portfolio,
 * onboarding state, value proof), so a deleted account or a corrupt save
 * leaves nothing behind on the device. Safe to call when storage is unavailable.
 */
export function clearLocalCopies(
  storage: (StorageLike & StorageKeys) | null = browserStorage() as
    (StorageLike & StorageKeys) | null,
): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

interface StorageKeys {
  readonly length: number;
  key(index: number): string | null;
}
