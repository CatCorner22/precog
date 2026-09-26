/** Browser-only identity barrier. Never contains credentials or business data. */
const CHANGE_KEY = "precog.identity-change.v1";
let accountId: string | null = null;
let generation = 0;
let locked = false;
const listeners = new Set<() => void>();
let listening = false;
let beforeExit: (() => Promise<boolean>) | null = null;
let afterExit: (() => void) | null = null;

export function identitySnapshot() {
  return { accountId, generation, locked };
}
export function identityUnchanged(snapshot: ReturnType<typeof identitySnapshot>) {
  return !locked && snapshot.accountId === accountId && snapshot.generation === generation;
}
export function displayAccount(id: string | null) {
  if (typeof window === "undefined") return;
  if (id !== accountId) {
    accountId = id;
    generation += 1;
  }
}
function notify() {
  for (const listener of listeners) listener();
}
export function beginIdentityChange() {
  if (typeof window === "undefined") return;
  locked = true;
  generation += 1;
  notify();
  try {
    window.localStorage.setItem(CHANGE_KEY, `${Date.now()}:${Math.random()}`);
  } catch {
    /* server guard remains authoritative */
  }
}
export function finishIdentityChange() {
  locked = false;
  generation += 1;
  notify();
}
export function identityLocked() {
  return locked;
}
export function subscribeIdentity(listener: () => void) {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("storage", (event) => {
      if (event.key === CHANGE_KEY) {
        locked = true;
        generation += 1;
        notify();
      }
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** The active provider flushes or explicitly exports work before an account change. */
export function registerAccountExit(check: () => Promise<boolean>) {
  beforeExit = check;
  return () => {
    if (beforeExit === check) beforeExit = null;
  };
}
export async function prepareAccountExit() {
  return beforeExit ? beforeExit() : true;
}

/** Capture before locking: the identity barrier intentionally unmounts the provider. */
export function accountExitCleanup(): (() => void) | null {
  return afterExit;
}
export function registerAccountCleanup(cleanup: () => void) {
  afterExit = cleanup;
  return () => {
    if (afterExit === cleanup) afterExit = null;
  };
}
