import { browserWorkspace, currentStorage } from "./sync/workspace";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Business storage is inaccessible until the verified workspace is selected. */
export function browserStorage(): StorageLike | null {
  return currentStorage();
}

export function readLocal(key: string, storage = browserStorage()): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string, storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeLocal(key: string, storage = browserStorage()): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Unavailable storage does not crash the application.
  }
}

export function readLocalJson(key: string, storage = browserStorage()): unknown {
  const raw = readLocal(key, storage);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function canKeepLocalData(storage = browserStorage()): boolean {
  const key = "precog.storage-probe";
  if (!storage) return false;
  try {
    storage.setItem(key, "1");
    const held = storage.getItem(key) === "1";
    storage.removeItem(key);
    return held;
  } catch {
    return false;
  }
}

interface StorageKeys {
  readonly length: number;
  key(index: number): string | null;
}

/** Clears this workspace only and invalidates pending writes before navigation. */
export function clearLocalCopies(
  storage: (StorageLike & StorageKeys) | null = currentStorage(),
): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && (key.startsWith("precog.") || key.startsWith("precog-"))) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Preserve the error boundary even when storage access is refused.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("precog:local-data-cleared"));
    browserWorkspace.invalidate();
  }
}
