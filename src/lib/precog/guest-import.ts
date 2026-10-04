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
import { readValueProof, writeValueProof } from "./value-proof-store";
import { withoutVerification } from "./procedures/lifecycle";

/**
 * Copying guest work into a signed-in account. The guest originals stay where
 * they are; each copy gets a new business id, and the account remembers which
 * guest business it already copied so a second copy never happens. An account
 * that answered "Not now" to the prompt on the home page is remembered too,
 * per guest business, so the prompt stays down; the recovery panel keeps
 * offering those.
 */

export interface ImportableOptions {
  /** False leaves out the guest businesses this account declined in the prompt. */
  includeDeclined?: boolean;
}

/** Guest businesses in this browser with real, finished work this account has not copied yet. */
export function importableGuestBusinesses(
  guest: StorageLike,
  account: StorageLike,
  { includeDeclined = true }: ImportableOptions = {},
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
      !readLocal(copiedMarker(p.businessId), account) &&
      (includeDeclined || !readLocal(declinedMarker(p.businessId), account)),
  );
}

/** Copy every importable guest business into the account; returns the new ids, in copy order. */
export function copyGuestBusinesses(
  guest: StorageLike,
  account: StorageLike,
  options: ImportableOptions = {},
): string[] {
  const copied: string[] = [];
  for (const p of importableGuestBusinesses(guest, account, options)) {
    const id = makeBusinessId();
    // A procedure verified while signed out carries no account's stamp, so
    // the account would be recording it as a new verification on its first
    // save, which the server refuses for a preparer or for writing with
    // errors. The copy keeps it as the last verification; the owner
    // verifies again under the account.
    const procedures = p.procedures?.map(withoutVerification);
    savePortfolioEntry(
      normalizeProfile({ ...p, businessId: id, ...(procedures ? { procedures } : {}) }),
      account,
    );
    // The value case and evidence are kept per business id, so they move to
    // the new id too. The guest's old browser-wide figures stay where they are.
    const proof = readValueProof(p.businessId ?? DEFAULT_BUSINESS_ID, guest, {
      claimLegacy: false,
    });
    if (proof.valueCase !== undefined || proof.evidence !== undefined)
      writeValueProof(id, proof, account);
    // Mark the original copied only once the copy is really stored.
    if (loadPortfolio(account)[id]) {
      writeLocal(copiedMarker(p.businessId), id, account);
      copied.push(id);
    }
  }
  return copied;
}

/** Remember, for this account, that the prompt was declined for every guest business it offered. */
export function declineGuestBusinesses(guest: StorageLike, account: StorageLike): void {
  for (const p of importableGuestBusinesses(guest, account, { includeDeclined: false }))
    writeLocal(declinedMarker(p.businessId), new Date().toISOString(), account);
}

function copiedMarker(guestBusinessId: string | undefined): string {
  return `precog.guest-import.${guestBusinessId}`;
}

function declinedMarker(guestBusinessId: string | undefined): string {
  return `precog.guest-import.declined.${guestBusinessId}`;
}
