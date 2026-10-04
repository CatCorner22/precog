import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const auth = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
  revokeSessions: vi.fn(),
  signOut: vi.fn(async () => undefined),
  exitCheck: vi.fn(async () => true),
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    listSessions: auth.listSessions,
    getSession: auth.getSession,
    revokeOtherSessions: auth.revokeOtherSessions,
    revokeSessions: auth.revokeSessions,
  },
  signOut: auth.signOut,
}));
vi.mock("@/lib/auth/identity-change", () => ({ runExitCheck: auth.exitCheck }));
vi.mock("sonner", () => ({ toast: toasts }));

const {
  default: AccountSessionsDialog,
  SESSIONS_TEXT,
  SessionList,
  deviceLabel,
  loadSessions,
  sessionRowText,
  signOutEverywhere,
  signOutOtherSessions,
} = await import("./account-sessions");

const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.exitCheck.mockResolvedValue(true);
  auth.signOut.mockResolvedValue(undefined);
  toasts.success.mockClear();
  toasts.error.mockClear();
});

describe("the signed-in sessions dialog", () => {
  it("draws the heading, the two buttons and the loading line", () => {
    const html = renderToStaticMarkup(<AccountSessionsDialog onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(">Signed-in sessions</h2>");
    expect(html).toContain(">Sign out other sessions</button>");
    expect(html).toContain(">Sign out everywhere</button>");
    expect(html).toContain(">Close</button>");
    expect(html).toContain("Loading…");
  });

  it("names each device from its browser, and says which one is this device", () => {
    expect(deviceLabel(MAC_CHROME)).toBe("Chrome on macOS");
    expect(deviceLabel(IPHONE_SAFARI)).toBe("Safari on iPhone");
    expect(deviceLabel(WINDOWS_EDGE)).toBe("Edge on Windows");
    expect(deviceLabel("")).toBe("Unknown device");
    expect(deviceLabel(null)).toBe("Unknown device");
    const here = { id: "s1", userAgent: MAC_CHROME, updatedAt: "2026-10-03T15:00:00Z" };
    expect(sessionRowText(here, "s1")).toBe(
      "Chrome on macOS · last used Oct 3, 2026 · this device",
    );
    expect(sessionRowText({ ...here, userAgent: undefined }, "s2")).toBe(
      "Unknown device · last used Oct 3, 2026",
    );
  });

  it("lists the sessions newest first, marking this one", async () => {
    auth.listSessions.mockResolvedValue({
      data: [
        { id: "old", userAgent: IPHONE_SAFARI, updatedAt: "2026-09-28T12:00:00Z" },
        { id: "now", userAgent: MAC_CHROME, updatedAt: "2026-10-03T12:00:00Z" },
      ],
      error: null,
    });
    auth.getSession.mockResolvedValue({ data: { session: { id: "now" } }, error: null });
    const state = await loadSessions();
    expect(state).toMatchObject({ kind: "ready", currentId: "now" });
    const html = renderToStaticMarkup(<SessionList state={state} />);
    expect(html).toContain("Chrome on macOS · last used Oct 3, 2026 · this device");
    expect(html).toContain("Safari on iPhone · last used Sep 28, 2026");
    expect(html.indexOf("Chrome on macOS")).toBeLessThan(html.indexOf("Safari on iPhone"));
  });

  it("says when the list cannot load, and why when the sign-in is over a day old", async () => {
    auth.getSession.mockResolvedValue({ data: null, error: null });
    auth.listSessions.mockResolvedValue({ data: null, error: { status: 500, message: "down" } });
    expect(await loadSessions()).toEqual({
      kind: "error",
      message: "Precog could not load your sessions. Try again.",
    });
    auth.listSessions.mockRejectedValue(new Error("offline"));
    expect(await loadSessions()).toEqual({ kind: "error", message: SESSIONS_TEXT.loadFailed });
    auth.listSessions.mockResolvedValue({
      data: null,
      error: { status: 403, code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
    });
    expect(await loadSessions()).toEqual({
      kind: "error",
      message:
        "Precog lists sessions only within a day of signing in. Sign out and sign in again to see the list; the buttons below work either way.",
    });
    const html = renderToStaticMarkup(
      <SessionList state={{ kind: "error", message: SESSIONS_TEXT.loadFailed }} />,
    );
    expect(html).toContain('role="alert"');
  });

  it("signs out the other sessions through the auth client", async () => {
    auth.revokeOtherSessions.mockResolvedValue({ data: { status: true }, error: null });
    expect(await signOutOtherSessions()).toBe(true);
    expect(auth.revokeOtherSessions).toHaveBeenCalledTimes(1);
    expect(toasts.success).toHaveBeenCalledWith("Signed out of every other session.");
    auth.revokeOtherSessions.mockResolvedValue({ data: null, error: { message: "no" } });
    expect(await signOutOtherSessions()).toBe(false);
    expect(toasts.error).toHaveBeenCalledWith(
      "Precog could not sign out the other sessions. Try again.",
    );
  });

  it("signs out everywhere, then this browser, after the unsaved-work check", async () => {
    auth.revokeSessions.mockResolvedValue({ data: { status: true }, error: null });
    await signOutEverywhere();
    expect(auth.exitCheck).toHaveBeenCalledWith("sign-out");
    expect(auth.revokeSessions).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith("/", { skipRecovery: true });
    expect(auth.revokeSessions.mock.invocationCallOrder[0]).toBeLessThan(
      auth.signOut.mock.invocationCallOrder[0],
    );
  });

  it("loads the start page, and never throws, when this browser's sign-out fails after the revoke", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    try {
      auth.revokeSessions.mockResolvedValue({ data: { status: true }, error: null });
      auth.signOut.mockRejectedValueOnce(new Error("network down"));
      await expect(signOutEverywhere()).resolves.toBeUndefined();
      expect(assign).toHaveBeenCalledWith("/");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps every session when the customer stays, or when the revoke fails", async () => {
    auth.exitCheck.mockResolvedValue(false);
    await signOutEverywhere();
    expect(auth.revokeSessions).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    auth.exitCheck.mockResolvedValue(true);
    auth.revokeSessions.mockResolvedValue({ data: null, error: { message: "no" } });
    await signOutEverywhere();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("Precog could not sign out everywhere. Try again.");
  });
});
