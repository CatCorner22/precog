/**
 * Browser-only identity barrier. It records which account this tab shows,
 * locks the tab while an account change is in flight, and tells the other
 * tabs through localStorage. The signals carry a random change id and the
 * verified account id only — never credentials or business data.
 *
 * Sections: types and state; snapshot and guard; this tab's account; this
 * tab's transitions; other tabs; exit hooks.
 */

/**
 * Why the tab is locked: this tab is signing in or out, another tab started
 * a change, or another tab now shows a different account.
 */
export type IdentityLock = "signing-in" | "signing-out" | "other-tab" | "changed";

/** The account change an exit check guards. */
export type AccountTransition = "sign-in" | "sign-out";

export type IdentitySnapshot = { accountId: string | null; generation: number; locked: boolean };

const CHANGE_KEY = "precog.identity-change.v1";
const ACCOUNT_KEY = "precog.identity-account.v1";

let accountId: string | null = null;
let displayed = false;
let generation = 0;
let lock: IdentityLock | null = null;
const listeners = new Set<() => void>();
let listening = false;
let exitCheck: ((transition: AccountTransition) => Promise<boolean>) | null = null;
let exitCleanup: (() => void) | null = null;

// ── Snapshot and guard ───────────────────────────────────────────────────────

/** Taken before a request; `identityUnchanged` tells whether its answer still applies. */
export function identitySnapshot(): IdentitySnapshot {
  return { accountId, generation, locked: lock !== null };
}

export function identityUnchanged(snapshot: IdentitySnapshot): boolean {
  return lock === null && snapshot.accountId === accountId && snapshot.generation === generation;
}

/** Why the tab is locked, or null. Stable between changes (for useSyncExternalStore). */
export function identityLockReason(): IdentityLock | null {
  return lock;
}

// ── This tab's account ───────────────────────────────────────────────────────

/** Record the account this tab shows (null for a guest) and tell the other tabs. */
export function setDisplayedAccount(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id !== accountId) {
    accountId = id;
    generation += 1;
  }
  displayed = true;
  broadcast(ACCOUNT_KEY, id ?? "");
}

// ── This tab's transitions ───────────────────────────────────────────────────

/** Lock this tab and the others before signing in or out. */
export function beginIdentityChange(reason: "signing-in" | "signing-out"): void {
  if (typeof window === "undefined") return;
  setLock(reason);
  broadcast(CHANGE_KEY, "begin");
}

/** This tab's change finished; the tab is about to show the new account. */
export function finishIdentityChange(): void {
  setLock(null);
}

/** This tab's change stopped before anything changed, so every tab may go on. */
export function cancelIdentityChange(): void {
  setLock(null);
  broadcast(CHANGE_KEY, "cancel");
}

// ── Other tabs ───────────────────────────────────────────────────────────────

export function subscribeIdentity(listener: () => void): () => void {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function onStorage(event: { key: string | null; newValue?: string | null }): void {
  // This tab's own sign-in or sign-out decides what it shows next.
  if (lock === "signing-in" || lock === "signing-out") return;
  const value = signalValue(event.newValue);
  if (event.key === CHANGE_KEY) {
    if (value === "cancel") {
      if (lock === "other-tab") setLock(null);
    } else if (lock === null) {
      setLock("other-tab");
    }
  } else if (event.key === ACCOUNT_KEY && displayed && value !== null) {
    if ((value || null) !== accountId) setLock("changed");
    else if (lock !== null) setLock(null);
  }
}

function setLock(next: IdentityLock | null): void {
  lock = next;
  generation += 1;
  for (const listener of listeners) listener();
}

/** Each write carries a fresh id so the other tabs see a change event every time. */
function broadcast(key: string, value: string): void {
  try {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(key, `${id}:${value}`);
  } catch {
    /* the server's account check stays authoritative */
  }
}

function signalValue(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const colon = raw.indexOf(":");
  return colon < 0 ? null : raw.slice(colon + 1);
}

// ── Exit hooks ───────────────────────────────────────────────────────────────

/** The active workspace flushes or exports unsynced work before an account change. */
export function registerExitCheck(
  check: (transition: AccountTransition) => Promise<boolean>,
): () => void {
  exitCheck = check;
  return () => {
    if (exitCheck === check) exitCheck = null;
  };
}

/** Run the registered exit check; false means the customer chose to stay. */
export async function runExitCheck(transition: AccountTransition): Promise<boolean> {
  return exitCheck ? exitCheck(transition) : true;
}

/** Account-specific storage cleanup that runs after a successful sign-out. */
export function registerExitCleanup(cleanup: () => void): () => void {
  exitCleanup = cleanup;
  return () => {
    if (exitCleanup === cleanup) exitCleanup = null;
  };
}

/** Capture before locking: the identity barrier unmounts the workspace that registered it. */
export function currentExitCleanup(): (() => void) | null {
  return exitCleanup;
}
