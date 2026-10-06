import { downloadText } from "@/lib/download";
import { DEFAULT_BUSINESS_ID, isBusinessId } from "./business-id";
import { readLocal, writeLocal, type StorageLike } from "./local-data";
import type { PracticeProfile } from "./practice-profile";
import { ACTIVE_PROFILE_KEY, LEGACY_PROFILE_KEY, PORTFOLIO_KEY } from "./storage-keys";
import type { Workspace } from "./workspace-context";

/** The crash screen asks this before it clears this browser's copies. */
export const CLEAR_LOCAL_CONFIRM =
  "Clear the saved data on this device? You lose changes that have not synced to your account, unless you downloaded a recovery copy. This does not affect other accounts. You cannot undo this.";

/** The file every recovery download saves as. */
export const RECOVERY_FILE_NAME = "precog-unsynced-recovery.json";

/**
 * The recovery copy the sign-out check, the crash screen, the save badge and
 * a refused "keep a copy" all download, in one format: the business named
 * (null on the crash screen, which holds none in memory) and everything this
 * workspace keeps in this browser.
 */
export function recoveryCopyText(workspace: Workspace, profile: PracticeProfile | null): string {
  return JSON.stringify(
    {
      version: 1,
      accountId: workspace.accountId,
      profile,
      local: workspace.local?.entries() ?? {},
      session: workspace.session?.entries() ?? {},
    },
    null,
    2,
  );
}

export function downloadRecoveryCopy(workspace: Workspace, profile: PracticeProfile | null): void {
  downloadText(RECOVERY_FILE_NAME, recoveryCopyText(workspace, profile), "application/json");
}

/**
 * What a restore wrote back (each one now listed), how many businesses in the
 * file it could not read, and how many it left alone because this device
 * already lists a newer copy of them.
 */
export interface RestoreResult {
  restored: number;
  skipped: number;
  keptNewer: number;
}

/** Thrown, with words for the owner, when a restore cannot start or cannot write. */
export class RestoreError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: unknown): unknown {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Every business a recovery copy holds, keyed by the id it is stored under:
 * the portfolio, then the open business, then the business the download named
 * (the freshest copy wins). A value that is not an object is kept, so the
 * restore counts it as skipped.
 */
function businessesInCopy(copy: Record<string, unknown>): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const local = isRecord(copy.local) ? copy.local : {};
  const portfolio = parseJson(local[PORTFOLIO_KEY]);
  if (isRecord(portfolio)) {
    for (const [id, entry] of Object.entries(portfolio)) found.set(id, entry);
  }
  const active = parseJson(local[ACTIVE_PROFILE_KEY] ?? local[LEGACY_PROFILE_KEY]);
  for (const entry of [active, copy.profile]) {
    if (entry === undefined || entry === null) continue;
    const id = isRecord(entry) && isBusinessId(entry.businessId) ? entry.businessId : null;
    found.set(id ?? DEFAULT_BUSINESS_ID, entry);
  }
  return found;
}

/**
 * Writes the businesses in a recovery copy (the text `recoveryCopyText`
 * produces) back into this workspace's list of businesses. Each one passes
 * the same normaliser a load uses; one it cannot read is skipped and counted,
 * never guessed. Businesses already in the list stay, except those the copy
 * replaces and entries that are not businesses at all; a listed copy newer
 * than the file's stays too, and is counted apart. A business the owner
 * removed on this device is listed again: restoring it is the owner's
 * choice. A business whose setup is not finished is not a business yet, so it
 * is left out without counting.
 */
export async function restoreFromRecoveryText(
  text: string,
  storage: StorageLike | null,
): Promise<RestoreResult> {
  const copy = parseJson(text);
  if (!isRecord(copy) || copy.version !== 1) {
    throw new RestoreError("This file is not a Precog recovery copy.");
  }
  if (!storage) throw new RestoreError("This browser does not let Precog save data.");
  // The normaliser comes with the business engine, loaded only when a restore runs.
  const { normalizeProfile, removedBusinessIds, REMOVED_BUSINESSES_KEY } =
    await import("./practice-profile");
  const restored: Record<string, PracticeProfile> = {};
  let skipped = 0;
  for (const [id, entry] of businessesInCopy(copy)) {
    if (!isRecord(entry)) {
      skipped += 1;
      continue;
    }
    try {
      const { localRev: _rev, localBase: _base, ...stored } = entry;
      const businessId = isBusinessId(stored.businessId) ? stored.businessId : id;
      const profile = normalizeProfile({ ...stored, businessId } as Partial<PracticeProfile>);
      if (profile.onboardingComplete === false) continue;
      restored[businessId] = { ...profile, businessId };
    } catch {
      skipped += 1;
    }
  }
  // An entry that is not even an object holds nothing to keep, and is the
  // kind of entry that stops the list of businesses from opening.
  const existing = parseJson(readLocal(PORTFOLIO_KEY, storage));
  const kept: Record<string, unknown> = isRecord(existing)
    ? Object.fromEntries(Object.entries(existing).filter(([, entry]) => isRecord(entry)))
    : {};
  let keptNewer = 0;
  for (const [id, profile] of Object.entries(restored)) {
    if (!newerThan(kept[id], profile.updatedAt)) continue;
    delete restored[id];
    keptNewer += 1;
  }
  const ids = Object.keys(restored);
  if (ids.length === 0) return { restored: 0, skipped, keptNewer };
  if (!writeLocal(PORTFOLIO_KEY, JSON.stringify({ ...kept, ...restored }), storage)) {
    throw new RestoreError("This browser refused to save the restored businesses.");
  }
  // A removed business is listed again only once it is off the removed list;
  // one the browser keeps hidden is not counted as restored.
  const removed = removedBusinessIds(storage);
  if (ids.some((id) => removed.has(id))) {
    const still = [...removed].filter((id) => !(id in restored));
    if (writeLocal(REMOVED_BUSINESSES_KEY, JSON.stringify(still), storage)) removed.clear();
  }
  const listed = ids.filter((id) => !removed.has(id)).length;
  return { restored: listed, skipped, keptNewer };
}

/** Whether a listed entry carries a save time later than `updatedAt`. */
function newerThan(entry: unknown, updatedAt: string): boolean {
  if (!isRecord(entry) || typeof entry.updatedAt !== "string") return false;
  const listed = Date.parse(entry.updatedAt);
  const restored = Date.parse(updatedAt);
  return Number.isFinite(listed) && Number.isFinite(restored) && listed > restored;
}

/** The crash screen's words for a finished restore. */
export function restoreMessage({ restored, skipped, keptNewer }: RestoreResult): string {
  const businesses = (n: number) => (n === 1 ? "1 business" : `${n} businesses`);
  const pronoun = (n: number) => (n === 1 ? "it" : "them");
  const skippedText =
    skipped === 0 ? "" : ` Precog could not read ${businesses(skipped)} in the file.`;
  const newerText =
    keptNewer === 0
      ? ""
      : ` This device already holds a newer copy of ${businesses(keptNewer)} in the file, so Precog kept ${pronoun(keptNewer)}.`;
  if (restored === 0) {
    if (keptNewer > 0) return `${newerText.trim()}${skippedText}`;
    return `The file holds no business Precog can restore.${skippedText}`;
  }
  return `Restored ${businesses(restored)}. Reload the page to open ${pronoun(restored)}.${newerText}${skippedText}`;
}
