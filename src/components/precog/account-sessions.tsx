/* eslint-disable react-refresh/only-export-components -- the helpers next to the dialog are tested on their own */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { authClient, signOut } from "@/lib/auth/client";
import { runExitCheck } from "@/lib/auth/identity-change";
import { formatDay } from "@/lib/precog/dates";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-variants";

/**
 * The account's signed-in sessions, through Better Auth's own endpoints
 * (`/api/auth/list-sessions`, `/revoke-other-sessions`, `/revoke-sessions`):
 * no Precog server function. The auth client attaches the live preview's
 * bearer token to each call, as it does for every other auth request.
 * Opened from the account menu and loaded only then.
 */

export const SESSIONS_TEXT = {
  title: "Signed-in sessions",
  loading: "Loading…",
  loadFailed: "Precog could not load your sessions. Try again.",
  notFresh:
    "Precog lists sessions only within a day of signing in. Sign out and sign in again to see the list; the buttons below work either way.",
  unknownDevice: "Unknown device",
  thisDevice: "this device",
  signOutOthers: "Sign out other sessions",
  signedOutOthers: "Signed out of every other session.",
  signOutOthersFailed: "Precog could not sign out the other sessions. Try again.",
  signOutEverywhere: "Sign out everywhere",
  signOutEverywhereFailed: "Precog could not sign out everywhere. Try again.",
  close: "Close",
} as const;

export interface SessionEntry {
  id: string;
  userAgent?: string | null;
  updatedAt: string | Date;
}

/** "Chrome on macOS", "Safari on iPhone"; "Unknown device" when the browser sent nothing useful. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? SESSIONS_TEXT.unknownDevice;
}

/** One row: "{device} · last used {Mon D, YYYY}", with " · this device" on the current one. */
export function sessionRowText(session: SessionEntry, currentId: string | null): string {
  const here = session.id === currentId ? ` · ${SESSIONS_TEXT.thisDevice}` : "";
  return `${deviceLabel(session.userAgent)} · last used ${formatDay(new Date(session.updatedAt))}${here}`;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; sessions: SessionEntry[]; currentId: string | null }
  | { kind: "error"; message: string };

/** The session list, newest use first, and which one is this browser's. */
export async function loadSessions(): Promise<LoadState> {
  try {
    const [list, current] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession().catch(() => null),
    ]);
    if (list.error || !list.data) {
      const code = (list.error as { code?: string } | null)?.code;
      return {
        kind: "error",
        message: code === "SESSION_NOT_FRESH" ? SESSIONS_TEXT.notFresh : SESSIONS_TEXT.loadFailed,
      };
    }
    const sessions = [...(list.data as SessionEntry[])].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const currentId = (current?.data as { session?: { id?: string } } | null)?.session?.id ?? null;
    return { kind: "ready", sessions, currentId };
  } catch {
    return { kind: "error", message: SESSIONS_TEXT.loadFailed };
  }
}

/** Ends every session but this one; true when it worked (the toast says which). */
export async function signOutOtherSessions(): Promise<boolean> {
  try {
    const result = await authClient.revokeOtherSessions();
    if (result.error) throw new Error(result.error.message ?? "revoke failed");
    toast.success(SESSIONS_TEXT.signedOutOthers);
    return true;
  } catch {
    toast.error(SESSIONS_TEXT.signOutOthersFailed);
    return false;
  }
}

/**
 * Ends every session, this one included, then signs this browser out as the
 * menu's Sign out does. The unsaved-work check runs first, so a customer who
 * chooses to stay keeps every session.
 */
export async function signOutEverywhere(): Promise<void> {
  if (!(await runExitCheck("sign-out"))) return;
  try {
    const result = await authClient.revokeSessions();
    if (result.error) throw new Error(result.error.message ?? "revoke failed");
  } catch {
    toast.error(SESSIONS_TEXT.signOutEverywhereFailed);
    return;
  }
  await signOut("/", { skipRecovery: true });
}

function focusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
}

/** The dialog the account menu's "Sessions" entry opens. */
export default function AccountSessionsDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const reload = useCallback(async () => {
    setState(await loadSessions());
  }, []);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    let cancel = false;
    void loadSessions().then((next) => {
      if (!cancel) setState(next);
    });
    return () => {
      cancel = true;
    };
  }, []);

  /** Escape closes; Tab and Shift+Tab stay inside the dialog. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable(dialogRef.current);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === titleRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function others() {
    setBusy(true);
    if (await signOutOtherSessions()) await reload();
    setBusy(false);
  }

  async function everywhere() {
    setBusy(true);
    await signOutEverywhere();
    setBusy(false);
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-sessions-title"
      onKeyDown={onKeyDown}
    >
      <Card className="w-full max-w-lg border-border bg-surface shadow-2xl">
        <CardHeader>
          <h2
            id="account-sessions-title"
            ref={titleRef}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight outline-hidden"
          >
            {SESSIONS_TEXT.title}
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <SessionList state={state} />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              {SESSIONS_TEXT.close}
            </button>
            <button
              type="button"
              onClick={() => void others()}
              disabled={busy}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              {SESSIONS_TEXT.signOutOthers}
            </button>
            <button
              type="button"
              onClick={() => void everywhere()}
              disabled={busy}
              className={buttonClass({ size: "sm" })}
            >
              {SESSIONS_TEXT.signOutEverywhere}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** The list, the loading line or the error, as drawn. */
export function SessionList({ state }: { state: LoadState }) {
  if (state.kind === "loading")
    return <p className="text-sm text-muted">{SESSIONS_TEXT.loading}</p>;
  if (state.kind === "error")
    return (
      <p role="alert" className="text-sm text-danger">
        {state.message}
      </p>
    );
  return (
    <ul className="space-y-1 text-sm">
      {state.sessions.map((s) => (
        <li key={s.id} className="rounded-md border border-border px-3 py-2">
          {sessionRowText(s, state.currentId)}
        </li>
      ))}
    </ul>
  );
}
