import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The seams resolveLlmAccess reads: the request, the session and the budget.
const seams = vi.hoisted(() => ({
  authConfigured: true,
  ip: "203.0.113.1",
  user: null as { id: string } | null,
  sameSite: vi.fn(),
  getSessionUser: vi.fn(),
  withinDailyBudget: vi.fn(),
  grokChat: vi.fn(),
}));

vi.mock("@/lib/auth/isolation.server", () => ({ assertSameSiteRequest: seams.sameSite }));
vi.mock("@/lib/auth/verify.server", () => ({
  DEV_USER_ID: "dev-user",
  get authConfigured() {
    return seams.authConfigured;
  },
  getSessionUser: seams.getSessionUser,
}));
vi.mock("@/lib/request-ip.server", () => ({ requestIp: () => seams.ip }));
vi.mock("@/lib/db", () => ({ getSql: vi.fn() }));
vi.mock("./daily-usage", () => ({ withinDailyBudget: seams.withinDailyBudget }));
vi.mock("./grok-client.server", () => ({ grokChat: seams.grokChat }));

/** A fresh module per test, so the in-memory limiters start empty. */
async function guard() {
  vi.resetModules();
  return import("./guard.server");
}

const CHAT = {
  messages: [{ role: "user" as const, content: "hi" }],
  maxTokens: 10,
  temperature: 0,
};

beforeEach(() => {
  seams.authConfigured = true;
  seams.ip = "203.0.113.1";
  seams.user = null;
  seams.sameSite.mockReset();
  seams.getSessionUser.mockReset().mockImplementation(async () => seams.user);
  seams.withinDailyBudget.mockReset().mockResolvedValue(true);
  seams.grokChat.mockReset().mockResolvedValue({ text: "brief", model: "grok" });
  vi.stubEnv("XAI_API_KEY", "key");
  vi.stubEnv("DATABASE_URL", "postgres://db");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveLlmAccess", () => {
  it("checks the request is same-site before anything else", async () => {
    const { resolveLlmAccess } = await guard();
    seams.sameSite.mockImplementation(() => {
      throw new Error("cross-site");
    });
    await expect(resolveLlmAccess()).rejects.toThrow("cross-site");
    expect(seams.getSessionUser).not.toHaveBeenCalled();
  });

  it("refuses an address over its limit before resolving who is calling", async () => {
    const { resolveLlmAccess } = await guard();
    for (let i = 0; i < 30; i++) await resolveLlmAccess();
    seams.getSessionUser.mockClear();
    await expect(resolveLlmAccess()).rejects.toMatchObject({ status: 429 });
    expect(seams.getSessionUser).not.toHaveBeenCalled();
  });

  it("uses the dev user only when auth and the database are both off", async () => {
    const { resolveLlmAccess } = await guard();
    seams.authConfigured = false;
    vi.stubEnv("DATABASE_URL", "");
    await expect(resolveLlmAccess()).resolves.toEqual({ userId: "dev-user", grok: "allowed" });
    vi.stubEnv("DATABASE_URL", "postgres://db");
    await expect(resolveLlmAccess()).resolves.toEqual({ userId: null, grok: "unauthenticated" });
  });

  it("says there is no key before it says the caller is signed out", async () => {
    const { resolveLlmAccess } = await guard();
    vi.stubEnv("XAI_API_KEY", "");
    await expect(resolveLlmAccess()).resolves.toEqual({ userId: null, grok: "no_api_key" });
    vi.stubEnv("XAI_API_KEY", "key");
    await expect(resolveLlmAccess()).resolves.toEqual({ userId: null, grok: "unauthenticated" });
  });

  it("gives signed-out callers a few heavy runs a minute, then asks them to sign in", async () => {
    const { resolveLlmAccess } = await guard();
    for (let i = 0; i < 4; i++) await resolveLlmAccess(undefined, { heavy: true });
    await expect(resolveLlmAccess(undefined, { heavy: true })).rejects.toMatchObject({
      status: 429,
      message: "Too many requests — sign in, or try again in a minute.",
    });
  });

  it("allows a signed-in caller without spending the daily budget", async () => {
    const { resolveLlmAccess } = await guard();
    seams.user = { id: "u1" };
    await expect(resolveLlmAccess()).resolves.toEqual({ userId: "u1", grok: "allowed" });
    expect(seams.withinDailyBudget).not.toHaveBeenCalled();
  });

  it("rate-limits a signed-in caller per minute, and refuses heavy work outright", async () => {
    const { resolveLlmAccess } = await guard();
    seams.user = { id: "u2" };
    for (let i = 0; i < 10; i++) await resolveLlmAccess();
    await expect(resolveLlmAccess()).resolves.toEqual({ userId: "u2", grok: "rate_limited" });
    await expect(resolveLlmAccess(undefined, { heavy: true })).rejects.toMatchObject({
      status: 429,
    });
  });

  it("caps a signed-in caller's heavy runs even when no key is configured", async () => {
    const { resolveLlmAccess } = await guard();
    vi.stubEnv("XAI_API_KEY", "");
    seams.user = { id: "u3" };
    for (let i = 0; i < 10; i++) await resolveLlmAccess(undefined, { heavy: true });
    await expect(resolveLlmAccess(undefined, { heavy: true })).rejects.toMatchObject({
      status: 429,
    });
  });

  it("refuses a call from a tab that shows a different account than the session", async () => {
    const { resolveLlmAccess } = await guard();
    seams.user = { id: "account-b" };
    await expect(resolveLlmAccess(undefined, {}, "account-a")).rejects.toMatchObject({
      status: 409,
    });
    await expect(resolveLlmAccess(undefined, {}, "account-b")).resolves.toEqual({
      userId: "account-b",
      grok: "allowed",
    });
  });
});

describe("callModel", () => {
  it("spends one daily unit, then calls the model", async () => {
    const { callModel } = await guard();
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).resolves.toEqual({
      text: "brief",
      model: "grok",
    });
    expect(seams.withinDailyBudget).toHaveBeenCalledTimes(1);
    expect(seams.grokChat).toHaveBeenCalledWith("key", CHAT);
  });

  it("spends nothing and calls nothing for a request that may not use the model", async () => {
    const { callModel } = await guard();
    for (const grok of ["unauthenticated", "rate_limited", "no_api_key"] as const) {
      await expect(callModel({ userId: "u1", grok }, CHAT)).resolves.toBeNull();
    }
    expect(seams.withinDailyBudget).not.toHaveBeenCalled();
    expect(seams.grokChat).not.toHaveBeenCalled();
  });

  it("does not call the model once the daily budget refuses", async () => {
    const { callModel } = await guard();
    seams.withinDailyBudget.mockResolvedValue(false);
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).resolves.toBeNull();
    expect(seams.grokChat).not.toHaveBeenCalled();
  });
});
