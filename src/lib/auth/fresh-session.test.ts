import { afterEach, describe, expect, it, vi } from "vitest";

/** requireFreshSession: destructive account actions need a sign-in from the last ten minutes. */
const NOW = new Date("2026-10-06T12:00:00Z");
const MESSAGE = "For your safety, sign in again, then delete your account.";

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

afterEach(() => {
  vi.doUnmock("./server");
  vi.doUnmock("../db");
  vi.doUnmock("@tanstack/react-start/server");
  vi.restoreAllMocks();
});

async function load(opts: {
  authConfigured?: boolean;
  session: { user: { id: string; email: string | null }; session: { createdAt: Date } } | null;
}) {
  vi.resetModules();
  const getSession = vi.fn(async (_args: { headers: Headers; query?: unknown }) => opts.session);
  vi.doMock("./server", () => ({
    auth: { api: { getSession } },
    authConfigured: opts.authConfigured ?? true,
  }));
  vi.doMock("../db", () => ({ databaseConfigured: true }));
  vi.doMock("@tanstack/react-start/server", () => ({
    getRequest: () =>
      new Request("https://precog.test/_serverFn/x", { headers: { cookie: "a=b" } }),
  }));
  const mod = await import("./fresh-session");
  return { ...mod, getSession };
}

const session = (createdAt: Date, id = "u1") => ({
  user: { id, email: "owner@example.com" },
  session: { createdAt },
});

describe("sessionIsFresh", () => {
  it("allows a session created 5 minutes ago and refuses one created 30 minutes ago", async () => {
    const { sessionIsFresh, FRESH_SESSION_MINUTES } = await load({ session: null });
    expect(FRESH_SESSION_MINUTES).toBe(10);
    expect(sessionIsFresh(minutesAgo(5), 10, NOW)).toBe(true);
    expect(sessionIsFresh(minutesAgo(30), 10, NOW)).toBe(false);
    expect(sessionIsFresh(minutesAgo(10), 10, NOW)).toBe(false);
    expect(sessionIsFresh(minutesAgo(5).toISOString(), 10, NOW)).toBe(true);
    expect(sessionIsFresh("not a date", 10, NOW)).toBe(false);
  });
});

describe("requireFreshSession", () => {
  it("lets a session created 5 minutes ago through and returns its address", async () => {
    const { requireFreshSession, getSession } = await load({ session: session(minutesAgo(5)) });
    await expect(
      requireFreshSession({ userId: "u1", message: MESSAGE, now: NOW }),
    ).resolves.toEqual({ email: "owner@example.com" });
    // The stored session, never the five-minute cookie cache.
    expect(getSession.mock.calls[0]?.[0].query).toEqual({ disableCookieCache: true });
  });

  it("refuses a session created 30 minutes ago with a 403 carrying the caller's message", async () => {
    const { requireFreshSession } = await load({ session: session(minutesAgo(30)) });
    const refused = requireFreshSession({ userId: "u1", message: MESSAGE, now: NOW });
    await expect(refused).rejects.toMatchObject({ status: 403, message: MESSAGE });
  });

  it("takes another limit and message, for firm ownership transfer", async () => {
    const { requireFreshSession } = await load({ session: session(minutesAgo(5)) });
    await expect(
      requireFreshSession({ userId: "u1", message: "Sign in again first.", minutes: 3, now: NOW }),
    ).rejects.toMatchObject({ status: 403, message: "Sign in again first." });
  });

  it("refuses with 401 when the session is gone or belongs to another account", async () => {
    const gone = await load({ session: null });
    await expect(
      gone.requireFreshSession({ userId: "u1", message: MESSAGE, now: NOW }),
    ).rejects.toMatchObject({ status: 401 });
    const other = await load({ session: session(minutesAgo(1), "u2") });
    await expect(
      other.requireFreshSession({ userId: "u1", message: MESSAGE, now: NOW }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("presents the live preview's bearer token to the session lookup", async () => {
    const { requireFreshSession, getSession } = await load({ session: session(minutesAgo(1)) });
    await requireFreshSession({ userId: "u1", message: MESSAGE, bearerToken: "tok", now: NOW });
    const headers = getSession.mock.calls[0]?.[0].headers;
    expect(headers?.get("authorization")).toBe("Bearer tok");
    expect(headers?.get("cookie")).toBe("a=b");
  });

  it("has no session to check when auth is turned off", async () => {
    const { requireFreshSession, getSession } = await load({
      authConfigured: false,
      session: null,
    });
    await expect(requireFreshSession({ userId: "dev-user", message: MESSAGE })).resolves.toEqual({
      email: null,
    });
    expect(getSession).not.toHaveBeenCalled();
  });
});
