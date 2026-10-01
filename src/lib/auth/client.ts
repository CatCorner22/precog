import {
  beginIdentityChange,
  cancelIdentityChange,
  currentExitCleanup,
  finishIdentityChange,
  runExitCheck,
} from "./identity-change";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { GROK_PROVIDERS, type PopupMessage } from "./providers";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*`. In the live
 * preview the app is an embedded iframe with PARTITIONED cookies, so after a
 * popup sign-in it can't read the session cookie — it authenticates with a
 * bearer token instead (captured from the popup, see `signIn`). The `onRequest`
 * hook attaches that token when present; when deployed (cookie auth) no token
 * is stored, so nothing changes.
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
  fetchOptions: {
    onRequest(ctx) {
      const token = getBearerToken();
      if (token) ctx.headers.set("Authorization", `Bearer ${token}`);
      return ctx;
    },
  },
});

/**
 * True when sign-in UI should be shown. On by default (preview via the baked
 * preview client, deployed apps via the injected per-app client); set
 * `VITE_AUTH_ENABLED=false` to force it off (dev user — see `use-current-user`).
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/** The upstream providers to render sign-in buttons for. */
export { GROK_PROVIDERS };

// ── Live-preview bearer token ────────────────────────────────────────────────
// The embedded preview iframe has partitioned cookies, so we keep the session's
// bearer token in sessionStorage and attach it to every Better Auth request (and
// to server functions, via `@/lib/auth/middleware`). Empty everywhere except the
// preview after a popup sign-in, so the cookie path is untouched elsewhere.
const BEARER_KEY = "grok-auth.bearer-token";

/** The stored preview bearer token, or null. */
export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Start sign-in with one upstream provider (`providerId` from `GROK_PROVIDERS`),
 * federating through the Grok auth broker.
 *
 * - **Live preview** (`*.grok-sandbox.com` iframe): opens a POPUP to
 *   `/auth/popup`, served by the template Vite plugin (see `vite.config.ts` +
 *   `popup.server.ts`) — 302s to the broker/upstream login (no app chrome) and,
 *   on return, posts the session bearer token back. We store it and refresh the
 *   session; no top-level navigation of the iframe to the broker.
 * - **Deployed** (and local non-iframe): a normal full-page redirect into the
 *   broker. A failed or cancelled provider step comes back to
 *   `errorCallbackURL` (default `/login`) with `?error=<code>`; read it with
 *   `signInErrorMessage`.
 *
 * The current session ends only once the new one exists (the OAuth callback
 * replaces the session cookie; the preview swaps the bearer token), so a
 * cancelled or failed attempt keeps the customer signed in as before.
 *
 * Rejects with an `Error` whose message is ready to show the customer.
 */
export async function signIn(
  providerId: string,
  opts: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  const callbackURL = opts.callbackURL ?? "/";
  const errorCallbackURL = opts.errorCallbackURL ?? "/login";
  const preview = inLivePreview();

  // Open the popup SYNCHRONOUSLY on the user gesture — before any await.
  // Awaiting first drops user-gesture privilege in some browsers when the
  // opener is a cross-origin live-preview iframe.
  const popup = preview ? openSignInPopup(providerId) : null;
  if (preview && !popup) throw new Error(POPUP_BLOCKED_MESSAGE);

  if (!(await runExitCheck("sign-in"))) {
    popup?.close();
    return;
  }
  if (popup) return signInWithPopup(popup, callbackURL);

  beginIdentityChange("signing-in");
  let url: string | undefined;
  try {
    const { data, error } = await authClient.signIn.oauth2({
      providerId,
      callbackURL,
      errorCallbackURL,
    });
    if (error) throw new Error(signInErrorMessage(error.code ?? error.message ?? "sign_in_failed"));
    url = data?.url;
  } catch (error) {
    cancelIdentityChange();
    throw error instanceof Error && error.message ? error : new Error(SERVICE_UNREACHABLE_MESSAGE);
  }
  if (!url) {
    cancelIdentityChange();
    throw new Error(signInErrorMessage("oauth_init_missing_url"));
  }
  window.location.href = url;
}

/** Sign out of THIS app's local session, clear the preview token, then redirect. */
export async function signOut(
  redirectTo = "/",
  options: { skipRecovery?: boolean } = {},
): Promise<void> {
  if (!options.skipRecovery && !(await runExitCheck("sign-out"))) return;
  const cleanup = currentExitCleanup();
  beginIdentityChange("signing-out");
  try {
    const result = await authClient.signOut();
    if (result.error) throw new Error(result.error.message ?? "Sign-out failed");
  } catch (error) {
    cancelIdentityChange();
    throw error;
  }
  setBearerToken(null);
  try {
    cleanup?.();
  } catch {
    /* Failed storage cleanup must not restore an ended session. */
  }
  window.location.href = redirectTo;
}

/**
 * Customer-facing text for a sign-in failure code: Better Auth's `?error=`
 * on the error callback page, or the reason the preview pop-up reported.
 */
export function signInErrorMessage(code: string): string {
  const normalized = code
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "account_not_linked")
    return "This email already has an account that signs in with email and password. Sign in with your password instead, or use Forgot password to set a new one.";
  if (EXPIRED_LINK_CODES.has(normalized))
    return "That link has expired or was already used. Sign in to get a new confirmation link, or use Forgot password for a new password link.";
  return `Sign-in did not finish. Try again; if it keeps failing, tell support the code "${code.trim().slice(0, 80) || "sign_in_failed"}".`;
}

/** Codes a confirmation or password link returns with when it has expired or was used. */
const EXPIRED_LINK_CODES = new Set(["token_expired", "invalid_token", "user_not_found"]);

const POPUP_BLOCKED_MESSAGE =
  "Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.";
const POPUP_CLOSED_MESSAGE =
  "The sign-in window closed before sign-in finished. Try again when you are ready.";
const SERVICE_UNREACHABLE_MESSAGE = "Could not reach the sign-in service. Try again in a moment.";

/**
 * The sandbox live preview runs this app inside an iframe on a `*.grok-sandbox.com`
 * host, where a full-page redirect to the broker can't work — so sign-in uses a
 * popup there and a normal redirect everywhere else.
 */
function inLivePreview(): boolean {
  return typeof window !== "undefined" && window.location.hostname.endsWith(".grok-sandbox.com");
}

/** Live preview: wait for the pop-up's token, then swap the old session for it. */
async function signInWithPopup(popup: Window, callbackURL: string): Promise<void> {
  beginIdentityChange("signing-in");
  const { token, error } = await waitForPopupResult(popup);
  if (!token) {
    cancelIdentityChange();
    throw new Error(error ? signInErrorMessage(error) : POPUP_CLOSED_MESSAGE);
  }
  // End the previous session only now that the new one exists. The request
  // still carries the old bearer (onRequest), so this revokes that session.
  if (getBearerToken()) {
    try {
      await authClient.signOut();
    } catch {
      /* the old session expires on its own */
    }
  }
  setBearerToken(token);
  // Refresh the client session store with the bearer attached (onRequest).
  // Avoid a full iframe reload when we're already on the destination — that
  // reload was the slow "still loading after the popup closed" feeling.
  try {
    await authClient.getSession();
  } catch {
    /* session store will recover on next useSession fetch */
  }
  const dest = new URL(callbackURL, window.location.origin);
  const here = window.location;
  if (dest.origin !== here.origin || dest.pathname !== here.pathname || dest.search !== here.search)
    window.location.href = callbackURL;
  finishIdentityChange();
}

/**
 * Open `/auth/popup` in a new window. Must run synchronously inside the click
 * handler (no await before this). The path is served by the template Vite
 * plugin (`authPopupPlugin` in vite.config.ts) — NOT by a React route.
 *
 * Opens the real URL directly (not about:blank → assign). From a cross-origin
 * iframe the about:blank dance often fails on the first click and the window
 * ends up showing the app shell.
 */
function openSignInPopup(providerId: string): Window | null {
  const origin = window.location.origin;
  const url = `${origin}/auth/popup?providerId=${encodeURIComponent(providerId)}`;
  // Unique name per attempt so a prior attempt stuck on the SPA is not reused.
  const name = `grok-signin-${Date.now()}`;
  return window.open(url, name, "popup,width=500,height=650");
}

/**
 * Wait for the popup's completion page to post the session bearer or the
 * failure reason (or for the user to dismiss the popup: no token, no error).
 */
function waitForPopupResult(popup: Window): Promise<{ token: string | null; error?: string }> {
  return new Promise((resolve) => {
    const origin = window.location.origin;
    let settled = false;
    let closeTimer: number | undefined;
    const settle = (result: { token: string | null; error?: string }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const data = event.data as PopupMessage | undefined;
      if (!data || data.source !== "grok-auth-popup") return;
      settle({ token: data.token ?? null, error: data.error });
    };
    // Fallback when the user dismisses the popup. Grace period lets the
    // completion page's postMessage win over a racing `popup.closed`.
    const pollTimer = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(pollTimer);
      closeTimer = window.setTimeout(() => settle({ token: null }), 400);
    }, 300);
    function cleanup() {
      window.clearInterval(pollTimer);
      if (closeTimer !== undefined) window.clearTimeout(closeTimer);
      window.removeEventListener("message", onMessage);
    }
    window.addEventListener("message", onMessage);
  });
}
