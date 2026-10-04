import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The seams resolveLlmAccess reads: the request, the session and the budget.
const seams = vi.hoisted(() => ({
  authConfigured: true,
  ip: "203.0.113.1",
  user: null as { id: string } | null,
  sameSite: vi.fn(),
  getSessionUser: vi.fn(),
  checkDailyBudget: vi.fn(),
  grokChat: vi.fn(),
  aiPlan: "free" as "free" | "paid",
  loadEntitlements: vi.fn(),
  reportServerError: vi.fn(),
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
// db.ts reads DATABASE_URL once at import; the mock reads it per call so a
// test can switch it.
vi.mock("@/lib/db", () => ({
  getSql: vi.fn(),
  get databaseConfigured() {
    return Boolean(process.env.DATABASE_URL?.trim());
  },
}));
vi.mock("./daily-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./daily-usage")>()),
  checkDailyBudget: seams.checkDailyBudget,
}));
vi.mock("./grok-client.server", () => ({ grokChat: seams.grokChat }));
vi.mock("@/lib/precog/firm/entitlements.server", () => ({
  loadEntitlements: seams.loadEntitlements,
}));
vi.mock("@/lib/observability/report.server", () => ({
  reportServerError: seams.reportServerError,
}));

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
  seams.checkDailyBudget.mockReset().mockResolvedValue("allowed");
  seams.grokChat.mockReset().mockResolvedValue({ text: "brief", model: "grok" });
  seams.aiPlan = "free";
  seams.loadEntitlements.mockReset().mockImplementation(async () => ({ aiPlan: seams.aiPlan }));
  seams.reportServerError.mockReset().mockResolvedValue(undefined);
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
    expect(seams.checkDailyBudget).not.toHaveBeenCalled();
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
    expect(seams.checkDailyBudget).toHaveBeenCalledTimes(1);
    expect(seams.grokChat).toHaveBeenCalledWith("key", CHAT);
  });

  it("spends nothing and calls nothing for a request that may not use the model", async () => {
    const { callModel } = await guard();
    for (const grok of ["unauthenticated", "rate_limited", "no_api_key"] as const) {
      await expect(callModel({ userId: "u1", grok }, CHAT)).resolves.toBeNull();
    }
    expect(seams.checkDailyBudget).not.toHaveBeenCalled();
    expect(seams.grokChat).not.toHaveBeenCalled();
  });

  it("does not call the model when the daily budget cannot be read", async () => {
    const { callModel } = await guard();
    seams.checkDailyBudget.mockResolvedValue("unavailable");
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).resolves.toBeNull();
    expect(seams.grokChat).not.toHaveBeenCalled();
  });

  it("says the daily limit is reached, without calling the model, once the budget is spent", async () => {
    const { callModel } = await guard();
    const { DailyLimitReached } = await import("./types");
    seams.checkDailyBudget.mockResolvedValue("spent");
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).rejects.toBeInstanceOf(
      DailyLimitReached,
    );
    expect(seams.grokChat).not.toHaveBeenCalled();
  });

  it("spends the budget under the caller's plan: free by default, paid for a paid firm", async () => {
    const { callModel } = await guard();
    await callModel({ userId: "u1", grok: "allowed" }, CHAT);
    expect(seams.loadEntitlements.mock.calls[0]?.[1]).toBe("u1");
    expect(seams.checkDailyBudget).toHaveBeenLastCalledWith(
      expect.any(Function),
      "u1",
      undefined,
      undefined,
      null,
      "free",
    );
    seams.aiPlan = "paid";
    await callModel({ userId: "u2", grok: "allowed" }, CHAT);
    expect(seams.checkDailyBudget).toHaveBeenLastCalledWith(
      expect.any(Function),
      "u2",
      undefined,
      undefined,
      null,
      "paid",
    );
  });

  it("uses the free allowance when the plan cannot be read, and still calls the model", async () => {
    const { callModel } = await guard();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    seams.loadEntitlements.mockRejectedValue(new Error("down"));
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).resolves.toEqual({
      text: "brief",
      model: "grok",
    });
    expect(seams.checkDailyBudget.mock.calls[0]?.[5]).toBe("free");
    quiet.mockRestore();
  });

  it("names the ceiling met and the figures in force on the thrown error", async () => {
    const { callModel } = await guard();
    seams.checkDailyBudget.mockResolvedValue("spent");
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).rejects.toMatchObject({
      dailyLimit: { scope: "user", plan: "free", limit: 100, paidLimit: 400 },
    });
    seams.aiPlan = "paid";
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).rejects.toMatchObject({
      dailyLimit: { scope: "user", plan: "paid", limit: 400, paidLimit: 400 },
    });
    seams.checkDailyBudget.mockResolvedValue("spent-global");
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).rejects.toMatchObject({
      dailyLimit: { scope: "global", plan: "paid", limit: 400, paidLimit: 400 },
    });
    // A pool the caller shares (address, unverified, free) is its own scope,
    // so the sentence does not claim the caller's own figure was reached.
    seams.checkDailyBudget.mockResolvedValue("spent-pool");
    await expect(callModel({ userId: "u1", grok: "allowed" }, CHAT)).rejects.toMatchObject({
      dailyLimit: { scope: "pool", plan: "paid", limit: 400, paidLimit: 400 },
    });
    expect(seams.grokChat).not.toHaveBeenCalled();
    expect(seams.reportServerError).toHaveBeenCalledTimes(1);
  });

  it("reports the global ceiling once a day, not on every refused call", async () => {
    const { callModel } = await guard();
    seams.checkDailyBudget.mockResolvedValue("spent-global");
    for (let i = 0; i < 3; i += 1) {
      await expect(callModel({ userId: `u${i}`, grok: "allowed" }, CHAT)).rejects.toMatchObject({
        dailyLimit: { scope: "global" },
      });
    }
    expect(seams.reportServerError).toHaveBeenCalledTimes(1);
    expect(seams.reportServerError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "llm global ceiling reached" }),
      "llm-daily-global",
    );
    // The caller's own ceiling is the everyday case and is not reported.
    seams.checkDailyBudget.mockResolvedValue("spent");
    await expect(callModel({ userId: "u9", grok: "allowed" }, CHAT)).rejects.toMatchObject({
      dailyLimit: { scope: "user" },
    });
    expect(seams.reportServerError).toHaveBeenCalledTimes(1);
  });
});
