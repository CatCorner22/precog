import { browserStorage, type StorageLike } from "./local-data";
import {
  ACTIVE_PROFILE_KEY,
  parseStoredProfile,
  readStoredActiveProfile,
  type PracticeProfile,
} from "./practice-profile";

/** current = revision stored server-side (null when no row); base = revision the client last loaded (null when it never loaded this business). */
export function isStaleSave(current: number | null, base: number | null): boolean {
  if (current === null) return false;
  return base === null || base !== current;
}

/**
 * Each copy of the open business a tab writes carries its own revision and
 * the revision it was built on, first in the JSON so another tab can read
 * them without parsing the whole profile.
 */
const STAMP = /^\{"localRev":"([^"]*)","localBase":(?:"([^"]*)"|null),/;

export function storedRevision(raw: string | null): { rev: string | null; base: string | null } {
  const match = raw ? STAMP.exec(raw) : null;
  return { rev: match?.[1] ?? null, base: match?.[2] ?? null };
}

function makeLocalRevision(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const businessKey = (p: Pick<PracticeProfile, "businessId">) => p.businessId ?? "biz_default";

export type LocalWriteResult =
  | { kind: "saved" }
  /** The browser refused the write (blocked site data, private mode, full quota). */
  | { kind: "failed" }
  /** Another tab saved a newer copy of this business; nothing was written. */
  | { kind: "conflict"; theirs: PracticeProfile; rev: string | null };

export type LocalChange =
  | { kind: "ignore" }
  /** Another tab saved on top of this tab's copy: take theirs, nothing here is lost. */
  | { kind: "adopt"; profile: PracticeProfile; rev: string | null }
  /** Another tab saved a copy that does not build on this tab's: the owner chooses. */
  | { kind: "conflict"; theirs: PracticeProfile; rev: string | null };

/**
 * One tab's view of the open business as this browser stores it. Every tab
 * writes the same key, so a tab left open on an older copy used to overwrite
 * edits saved from another tab without a word. Now a tab writes only on top of
 * the copy it last read or wrote; when another tab has saved since, the write
 * is refused and the owner decides. When another tab saves on top of this
 * tab's copy (the `storage` event), this tab takes that copy instead.
 */
export class LocalProfileStore {
  /** Revision of the stored copy this tab last read, wrote or took; null before any, or for a copy written by an older build. */
  private seenRev: string | null = null;
  /** `updatedAt` of that copy: the same version reached another way (two tabs loading one account copy) is not a conflict. */
  private seenStamp: string | null = null;

  constructor(
    private readonly storage: () => StorageLike | null = browserStorage,
    private readonly makeRev: () => string = makeLocalRevision,
  ) {}

  /**
   * Reads the open business, remembering which stored copy this tab now
   * builds on. `stored` is false on a first visit or when storage is blocked.
   */
  load(): { profile: PracticeProfile; stored: boolean } {
    const raw = readStoredActiveProfile(this.storage());
    const profile = parseStoredProfile(raw);
    this.seenRev = storedRevision(raw).rev;
    this.seenStamp = raw ? profile.updatedAt : null;
    return { profile, stored: raw !== null };
  }

  /** The stored copy of `businessId`, when the open business in storage is that one. */
  peek(businessId: string): { profile: PracticeProfile; rev: string | null } | null {
    const raw = readStoredActiveProfile(this.storage());
    if (!raw) return null;
    const profile = parseStoredProfile(raw);
    return businessKey(profile) === businessId ? { profile, rev: storedRevision(raw).rev } : null;
  }

  /**
   * Writes `profile` as the open business. Refused as a conflict when another
   * tab has saved a different version of the same business since this tab's
   * copy; `force` writes anyway (the owner chose this tab's version). Saving a
   * different business is never a conflict: the key only says which business
   * a reload opens, and each business keeps its own portfolio entry.
   */
  write(profile: PracticeProfile, options: { force?: boolean } = {}): LocalWriteResult {
    const storage = this.storage();
    if (!storage) return { kind: "failed" };
    let current: string | null;
    try {
      current = storage.getItem(ACTIVE_PROFILE_KEY);
    } catch {
      return { kind: "failed" };
    }
    // The copy this write builds on: normally this tab's own, but the stored
    // one when it holds the same version (two tabs loading one account copy)
    // or when the owner chose to replace it.
    let base = this.seenRev;
    const currentRev = storedRevision(current).rev;
    if (current !== null && currentRev !== this.seenRev) {
      const theirs = parseStoredProfile(current);
      if (businessKey(theirs) === businessKey(profile)) {
        const sameVersion =
          theirs.updatedAt === this.seenStamp || theirs.updatedAt === profile.updatedAt;
        if (!sameVersion && !options.force) return { kind: "conflict", theirs, rev: currentRev };
        base = currentRev;
      }
    }
    const rev = this.makeRev();
    const body = JSON.stringify(profile);
    const stamped = `{"localRev":${JSON.stringify(rev)},"localBase":${JSON.stringify(base)}${
      body === "{}" ? "}" : `,${body.slice(1)}`
    }`;
    try {
      storage.setItem(ACTIVE_PROFILE_KEY, stamped);
    } catch {
      return { kind: "failed" };
    }
    this.seenRev = rev;
    this.seenStamp = profile.updatedAt;
    return { kind: "saved" };
  }

  /**
   * Another tab changed the stored open business (`raw` is the `storage`
   * event's new value). `current` is this tab's business; `clean` is true when
   * everything this tab holds is already stored.
   */
  receive(raw: string | null, current: PracticeProfile, clean: boolean): LocalChange {
    if (raw === null) return { kind: "ignore" };
    const { rev, base } = storedRevision(raw);
    if (rev !== null && rev === this.seenRev) return { kind: "ignore" };
    const theirs = parseStoredProfile(raw);
    if (businessKey(theirs) !== businessKey(current)) return { kind: "ignore" };
    if (theirs.updatedAt === this.seenStamp) {
      // The same version this tab holds, written again: nothing to take.
      this.accept(rev, theirs.updatedAt);
      return { kind: "ignore" };
    }
    if (clean && base === this.seenRev) return { kind: "adopt", profile: theirs, rev };
    return { kind: "conflict", theirs, rev };
  }

  /** This tab now holds the stored copy `rev` (it took another tab's version, or loaded it on a switch). */
  accept(rev: string | null, stamp: string): void {
    this.seenRev = rev;
    this.seenStamp = stamp;
  }
}

/** Versions kept per business; far more than two tabs ever pass back and forth between two account saves. */
const MAX_LINEAGE = 64;

/**
 * The versions of each business this tab holds or has built on, by their
 * `updatedAt` stamp: the copy it opened, every copy it saved to the account,
 * and every copy it took from another tab of this browser.
 *
 * Another tab's account save moves the account's revision on without this
 * tab hearing of it, even when this tab took that very version from the other
 * tab. The account then refuses this tab's next save as stale. When the
 * version the account holds is one in this lineage, this tab's copy already
 * builds on it, so saving on top of it loses nothing. Any version this tab has
 * never held (a save from another device, or a tab it never heard from) is
 * still a real conflict for the owner to settle.
 */
export class AccountLineage {
  private readonly stamps = new Map<string, string[]>();

  /** This tab opened `stamp` of the business as a whole new copy: nothing before it counts. */
  start(businessId: string, stamp: string): void {
    this.stamps.set(businessId, [stamp]);
  }

  /** This tab now builds on `stamp` too (it saved it, or took it from another tab). */
  add(businessId: string, stamp: string): void {
    const held = this.stamps.get(businessId) ?? [];
    if (held.includes(stamp)) return;
    held.push(stamp);
    if (held.length > MAX_LINEAGE) held.shift();
    this.stamps.set(businessId, held);
  }

  /** Whether this tab's copy of the business builds on the version stamped `stamp`. */
  buildsOn(businessId: string, stamp: string | undefined): boolean {
    return Boolean(stamp) && (this.stamps.get(businessId)?.includes(stamp as string) ?? false);
  }
}
