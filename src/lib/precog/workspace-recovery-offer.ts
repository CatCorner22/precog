import { importableGuestBusinesses } from "./guest-import";
import type { ScopedStorage } from "./workspace-storage";
import { scopedBrowserStorage, WORKSPACE_PREFIX } from "./workspace-storage";

/** Old unscoped data is quarantined, not attributed to whichever account signs in first. */
export function legacyEntries(session: boolean): Record<string, string> {
  const entries: Record<string, string> = {};
  if (typeof window === "undefined") return entries;
  try {
    const raw = session ? window.sessionStorage : window.localStorage;
    for (let i = 0; i < raw.length; i += 1) {
      const key = raw.key(i);
      if (
        key &&
        !key.startsWith(WORKSPACE_PREFIX) &&
        /^precog(?:\.practiceProfile|\.portfolio|\.onboarding-draft|\.power-map|-value)/.test(key)
      ) {
        const value = raw.getItem(key);
        if (value !== null) entries[key] = value;
      }
    }
  } catch {
    /* unavailable */
  }
  return entries;
}

export function legacyEntryCount(): number {
  return Object.keys(legacyEntries(false)).length + Object.keys(legacyEntries(true)).length;
}

export function importableGuestCount(
  accountId: string | null,
  local: ScopedStorage | null,
): number {
  if (!accountId || !local) return 0;
  const guest = scopedBrowserStorage(null);
  if (!guest) return 0;
  return importableGuestBusinesses(guest, local).length;
}

export function hasWorkspaceRecoveryOffer(
  accountId: string | null,
  local: ScopedStorage | null,
): boolean {
  return legacyEntryCount() > 0 || importableGuestCount(accountId, local) > 0;
}
