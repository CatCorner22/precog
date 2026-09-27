import { readLocal, writeLocal, type StorageLike } from "./local-data";
import {
  hasUserWork,
  loadPortfolio,
  makeBusinessId,
  normalizeProfile,
  parseStoredProfile,
  readStoredActiveProfile,
  savePortfolioEntry,
  type PracticeProfile,
} from "./practice-profile";
import { DEFAULT_BUSINESS_ID } from "./business-id";

/**
 * Copying guest work into a signed-in account. The guest originals stay where
 * they are; each copy gets a new business id, and the account remembers which
 * guest business it already copied so a second copy never happens.
 */

/** Guest businesses in this browser with real, finished work this account has not copied yet. */
export function importableGuestBusinesses(
  guest: StorageLike,
  account: StorageLike,
): PracticeProfile[] {
  const all = loadPortfolio(guest);
  const raw = readStoredActiveProfile(guest);
  if (raw) {
    const profile = parseStoredProfile(raw);
    all[profile.businessId ?? DEFAULT_BUSINESS_ID] = profile;
  }
  return Object.values(all).filter(
    (p) =>
      hasUserWork(p) &&
      p.onboardingComplete !== false &&
      !readLocal(copiedMarker(p.businessId), account),
  );
}

/** Copy every importable guest business into the account; returns how many copies were saved. */
export function copyGuestBusinesses(guest: StorageLike, account: StorageLike): number {
  let copied = 0;
  for (const p of importableGuestBusinesses(guest, account)) {
    const id = makeBusinessId();
    savePortfolioEntry(normalizeProfile({ ...p, businessId: id }), account);
    // Mark the original copied only once the copy is really stored.
    if (loadPortfolio(account)[id]) {
      writeLocal(copiedMarker(p.businessId), id, account);
      copied += 1;
    }
  }
  return copied;
}

function copiedMarker(guestBusinessId: string | undefined): string {
  return `precog.guest-import.${guestBusinessId}`;
}
