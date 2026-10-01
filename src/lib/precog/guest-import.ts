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
      copied += 1;
    }
  }
  return copied;
}

function copiedMarker(guestBusinessId: string | undefined): string {
  return `precog.guest-import.${guestBusinessId}`;
}
