import { reportClientError } from "@/lib/observability/report-browser";
import { browserStorage, type StorageLike } from "./local-data";
import {
  ACTIVE_PROFILE_KEY,
  hasUserWork,
  loadPortfolio,
  normalizeProfile,
  parseStoredProfile,
  quarantineKey,
  quarantineText,
  readStoredActiveProfile,
  readStoredProfile,
  removedBusinessIds,
  type PracticeProfile,
} from "./practice-profile";
import { uid } from "./text";
import { DEFAULT_BUSINESS_ID, isBusinessId } from "./business-id";

export { QUARANTINE_PREFIX, quarantineKey } from "./practice-profile";

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
  return uid("r");
}

const businessKey = (p: Pick<PracticeProfile, "businessId">) => p.businessId ?? DEFAULT_BUSINESS_ID;

/** A stored business this build could not read, kept under `key`. */
export interface UnreadableCopy {
  key: string;
  raw: string;
  /**
   * True when the open copy was damaged (not JSON for an object) and the
   * list of businesses held a copy of the same business, which opened instead.
   */
  openedFromList?: boolean;
}

/** The notice when a damaged open copy gave way to the copy in the list of businesses. */
export const OPENED_FROM_LIST_NOTICE =
  "Precog could not read the open copy of this business and opened the copy from your list of businesses.";

/** The business id in damaged stored text, when the text still holds one. */
function idInDamagedText(raw: string): string | null {
  const match = /"businessId":"([^"\\]{1,64})"/.exec(raw);
  return match && isBusinessId(match[1]) ? match[1] : null;
}

/** The newest listed business, for a reload whose open business was removed on this device. */
function newestListed(storage: StorageLike | null): PracticeProfile | null {
  let newest: PracticeProfile | null = null;
  for (const p of Object.values(loadPortfolio(storage))) {
    if (p.onboardingComplete === false) continue;
    if (!newest || p.updatedAt > newest.updatedAt) newest = p;
  }
  return newest;
}

type LocalWriteResult =
  | { kind: "saved" }
  /** The browser refused the write (blocked site data, private mode, full quota). */
  | { kind: "failed" }
  /** Another tab saved a newer copy of this business; nothing was written. */
  | { kind: "conflict"; theirs: PracticeProfile; rev: string | null };

type LocalChange =
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

  /** True while the stored copy this tab loaded is one the normaliser could not read. */
  private keepsUnreadable = false;

  constructor(
    private readonly storage: () => StorageLike | null = browserStorage,
    private readonly makeRev: () => string = makeLocalRevision,
    /** Told when a load meets a stored business this build could not read. */
    private readonly onUnreadable?: (copy: UnreadableCopy) => void,
  ) {}

  /**
   * Reads the open business, remembering which stored copy this tab now
   * builds on. `stored` is false on a first visit or when storage is blocked,
   * and false when the copy that opens is not the stored one, so the next
   * write replaces the stored one.
   *
   * Stored text this build cannot read (the normaliser throws on it, or it is
   * not JSON for an object) is kept under a quarantine key and reported. When
   * the text is damaged and the list of businesses holds a copy of the same
   * business, that copy opens (`unreadable.openedFromList`). Otherwise the
   * setup sample opens, but no write replaces the stored copy while it stays
   * unreadable. A business the owner removed on this device does not open
   * again: the newest listed business opens, or the setup sample.
   */
  load(): { profile: PracticeProfile; stored: boolean; unreadable: UnreadableCopy | null } {
    const storage = this.storage();
    const raw = readStoredActiveProfile(storage);
    const read = readStoredProfile(raw);
    this.seenRev = storedRevision(raw).rev;
    this.seenStamp = null;
    this.keepsUnreadable = false;
    if (raw === null) return { profile: read.profile, stored: false, unreadable: null };
    if (read.unreadable !== null || read.damaged) {
      const unreadable: UnreadableCopy = { key: quarantineKey(raw), raw };
      const kept = quarantineText(raw, storage);
      reportClientError(
        read.unreadable ?? new Error("The open business stored on this device is not readable."),
        read.damaged ? "parse-local" : "normalize-local",
      );
      const id = read.damaged && kept ? idInDamagedText(raw) : null;
      const listed = id ? loadPortfolio(storage)[id] : undefined;
      if (listed) {
        const copy = { ...unreadable, openedFromList: true };
        this.onUnreadable?.(copy);
        return { profile: listed, stored: false, unreadable: copy };
      }
      this.keepsUnreadable = true;
      this.seenStamp = read.profile.updatedAt;
      this.onUnreadable?.(unreadable);
      return { profile: read.profile, stored: true, unreadable };
    }
    if (removedBusinessIds(storage).has(businessKey(read.profile))) {
      const profile = newestListed(storage) ?? readStoredProfile(null).profile;
      return { profile, stored: false, unreadable: null };
    }
    this.seenStamp = read.profile.updatedAt;
    return { profile: read.profile, stored: true, unreadable: null };
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
    const foreign = current !== null && currentRev !== this.seenRev;
    // An unreadable copy under the legacy key, with the active key empty: a
    // write here would hide that copy from every later load.
    if (this.keepsUnreadable && current === null) {
      const legacy = readStoredActiveProfile(storage);
      if (legacy !== null) {
        const read = readStoredProfile(legacy);
        if (read.unreadable !== null || read.damaged) return { kind: "failed" };
      }
      this.keepsUnreadable = false;
    }
    if (current !== null && (foreign || this.keepsUnreadable)) {
      const read = readStoredProfile(current);
      // A copy this build could not read stays until a build that reads it
      // opens it: neither the setup sample nor anything else replaces it.
      if (read.unreadable !== null) return { kind: "failed" };
      if (read.damaged) {
        // Damaged text this tab opened as unreadable stays, as above. Damaged
        // text another tab or program wrote since is replaced only once a
        // quarantined copy of it is kept.
        if (this.keepsUnreadable || !quarantineText(current, storage)) return { kind: "failed" };
        reportClientError(
          new Error("The open business stored on this device is not readable."),
          "parse-local",
        );
      }
      this.keepsUnreadable = false;
      const theirs = read.profile;
      if (!read.damaged && foreign && businessKey(theirs) === businessKey(profile)) {
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

/** The account's answer to one save: the new revision, or the version it holds instead. */
type AccountSaveAnswer =
  | { ok: true; revision: number }
  | { ok: false; revision: number; profile: Pick<PracticeProfile, "updatedAt"> };

/**
 * Saves one business to the account on top of `baseRevision`. When the
 * account refuses because another tab of this browser moved it on to a
 * version this tab already builds on (see `AccountLineage`), saves once more
 * on top of that version: nothing is lost, so the owner is not asked. Any
 * other refusal comes back for the owner to settle.
 */
export async function saveOnLineage<A extends AccountSaveAnswer>(input: {
  businessId: string;
  baseRevision: number | null;
  lineage: AccountLineage;
  save: (baseRevision: number | null) => Promise<A>;
}): Promise<A> {
  const first = await input.save(input.baseRevision);
  if (first.ok || !input.lineage.buildsOn(input.businessId, first.profile.updatedAt)) return first;
  return input.save(first.revision);
}

/**
 * True when signing in meets work on this device that the account's copy of
 * the same business does not have: the owner chooses, nothing is replaced
 * unseen. This holds for a legacy account copy with no revision too.
 * `acknowledgedStamp` is the stamp of the copy the account last took from
 * this device.
 */
export function signInMeetsNewerWork(
  local: PracticeProfile,
  account: PracticeProfile,
  acknowledgedStamp: string | undefined,
): boolean {
  return (
    (local.businessId ?? DEFAULT_BUSINESS_ID) === (account.businessId ?? DEFAULT_BUSINESS_ID) &&
    hasUserWork(local) &&
    local.updatedAt !== account.updatedAt &&
    acknowledgedStamp !== local.updatedAt
  );
}

/**
 * This device's copy of a business: the newer of its portfolio entry and
 * another tab's open copy (written on every edit, the portfolio only a
 * moment later), normalised as on every other load path.
 */
export function newestLocalCopy(
  stored: PracticeProfile | undefined,
  open: PracticeProfile | null,
): PracticeProfile | null {
  const local = stored ? normalizeProfile(stored) : null;
  return open && (!local || open.updatedAt >= local.updatedAt) ? open : local;
}

/** The copy a switch opens, or why it opens none. */
type SwitchCopy =
  | {
      ok: true;
      profile: PracticeProfile;
      /** The account revision when the account's copy opens; null for a copy from this device. */
      accountRevision: number | null;
      /** A copy the account has never held: its next save creates it there. */
      localOnly: boolean;
      /**
       * The account's copy, when it moved on while this device holds edits
       * the account never took: this device's copy opens, and the owner
       * chooses between the two as for any refused save.
       */
      accountMovedOn?: { profile: PracticeProfile; revision: number };
    }
  | { ok: false; reason: string };

/**
 * Which copy of a business a switch opens. On this device, the newer of its
 * portfolio entry and another tab's open copy (written on every edit, the
 * portfolio only a moment later). With an account, the account's copy
 * unless this device's copy was built on the revision the account still
 * holds: clocks are not a tiebreaker. A business the account does not hold
 * opens from this device when the account never held it (a copy kept after
 * a conflict, a guest business brought in); one the account held and no
 * longer does was deleted or shared no more. When the account moved on and
 * this device's copy holds edits the account never took, neither is dropped:
 * the result names both and the owner chooses. Every copy is normalised, as on
 * every other load path.
 */
export function pickSwitchCopy(input: {
  /** The portfolio entry, as stored. */
  stored: PracticeProfile | undefined;
  /** Another tab's open copy of this business, already normalised. */
  open: PracticeProfile | null;
  /** The account's answer; null when not signed in, "unreachable" when the load failed. */
  account:
    | { found: true; profile: PracticeProfile; revision: number }
    | { found: false }
    | "unreachable"
    | null;
  /** The account revision this device's copy was built on. */
  seenRevision: number | undefined;
  /** Whether the account held this business when this device last heard. */
  heldByAccount: boolean;
  /** Whether the account took this device's copy stamped `stamp` (saved it, or this device loaded it from there). */
  accountTook: (stamp: string) => boolean;
}): SwitchCopy {
  const local = newestLocalCopy(input.stored, input.open);
  if (input.account === "unreachable") {
    // Not "no longer on this device": the account may well hold it.
    if (!local) return { ok: false, reason: "Precog could not reach your account. Try again." };
    return { ok: true, profile: local, accountRevision: null, localOnly: false };
  }
  const { account } = input;
  if (account?.found) {
    if (local && input.seenRevision === account.revision)
      return { ok: true, profile: local, accountRevision: null, localOnly: false };
    const accountCopy = normalizeProfile(account.profile);
    const unsynced =
      local &&
      signInMeetsNewerWork(
        { ...local, businessId: accountCopy.businessId },
        accountCopy,
        input.accountTook(local.updatedAt) ? local.updatedAt : undefined,
      );
    return unsynced
      ? {
          ok: true,
          profile: local,
          accountRevision: null,
          localOnly: false,
          accountMovedOn: { profile: accountCopy, revision: account.revision },
        }
      : { ok: true, profile: accountCopy, accountRevision: account.revision, localOnly: false };
  }
  if (account && (input.heldByAccount || !local)) {
    return {
      ok: false,
      reason: local
        ? "Someone deleted this business from your account or removed your access. Precog kept its copy on this device."
        : "Someone deleted this business from your account or removed your access.",
    };
  }
  if (!local) return { ok: false, reason: "This business is no longer on this device." };
  return { ok: true, profile: local, accountRevision: null, localOnly: account !== null };
}
