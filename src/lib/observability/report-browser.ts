import { toErrorEvent } from "./error-event";

/**
 * Browser side of error reporting: shape and scrub the error here, hand it
 * to /api/errors, and let the server forward it to the tracker. The browser
 * never holds a tracker key. A small per-page budget stops a render loop
 * from posting the same crash hundreds of times.
 */
const BUDGET_PER_PAGE = 10;
let sent = 0;
const seen = new Set<string>();

export function reportClientError(error: unknown, at?: string | null): void {
  if (typeof window === "undefined" || isChunkLoadError(error) || isBenignBrowserNoise(error))
    return;
  const event = toErrorEvent(error, {
    where: "client",
    at: at ?? window.location.pathname,
    release: import.meta.env.VITE_RELEASE ?? null,
  });
  const key = `${event.name}|${event.message}|${event.at}`;
  if (seen.has(key) || sent >= BUDGET_PER_PAGE) return;
  seen.add(key);
  sent += 1;
  const body = JSON.stringify(event);
  try {
    if (!navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Reporting must never become a second error.
  }
}

/**
 * A stale bundle after a deploy: the page asks for a chunk the new release
 * renamed. A reload fixes it, so it is not a crash worth reporting.
 */
export function isChunkLoadError(error: unknown): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(
    describe(error),
  );
}

/** Uncaught errors and rejected promises outside React's error boundaries. */
export function installGlobalErrorReporting(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onError = (event: globalThis.ErrorEvent) => {
    reportClientError(event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportClientError(event.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** The browser's harmless ResizeObserver notice, which every layout change can raise. */
function isBenignBrowserNoise(error: unknown): boolean {
  return /ResizeObserver loop/i.test(describe(error));
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return typeof error === "string" ? error : "";
}
