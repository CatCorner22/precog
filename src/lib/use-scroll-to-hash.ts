import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";

/** How long a landing keeps its section in view while the page above it loads. */
const SETTLE_MS = 8000;

/**
 * The pages whose sections other addresses point at (the `value` and
 * `snapshots` route aliases land on /firm). Every other page keeps the
 * browser's own handling of a hash, for example the "Skip to content" link.
 */
const SETTLE_PATHS: ReadonlySet<string> = new Set(["/firm"]);

/**
 * Brings the section an address names (`/firm#value-proof`) into view once
 * it exists. The router scrolls to a hash as it navigates, but a business
 * page renders after its account check and lazy panels, so the section is
 * not there yet, and panels that load above it later push it down. This
 * waits for the element, scrolls to it, and keeps it in place while the
 * page settles. Any scroll, key or pointer input from the reader ends it.
 * Only the pages in SETTLE_PATHS get this.
 */
export function useScrollToHash(): void {
  const hash = useLocation({ select: (l) => l.hash });
  const pathname = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    if (!hash || typeof window === "undefined") return;
    if (!SETTLE_PATHS.has(pathname.replace(/\/+$/, "") || "/")) return;
    let id = hash;
    try {
      id = decodeURIComponent(hash);
    } catch {
      // A malformed escape: look the hash up as written.
    }
    let done = false;

    const align = () => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: "start" });
    };
    const stop = () => {
      done = true;
      observer.disconnect();
      window.clearTimeout(timer);
      for (const type of INPUT_EVENTS) window.removeEventListener(type, stop, true);
    };

    const observer = new MutationObserver(() => {
      if (!done) align();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, stop, { capture: true, passive: true });
    }
    const timer = window.setTimeout(stop, SETTLE_MS);
    align();
    return stop;
  }, [hash, pathname]);
}

const INPUT_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
