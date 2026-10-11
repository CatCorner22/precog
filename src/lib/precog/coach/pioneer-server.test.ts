import { beforeEach, describe, expect, it, vi } from "vitest";
import { LLM_LIMITS } from "../llm/rate-limit";

// The server functions run as plain handlers: each middleware's server step,
// then the validator, then the handler, so the real guard decides who may
// run them. The seams are the request, the session and the daily budget.
const seams = vi.hoisted(() => ({
  user: null as { id: string } | null,
  checkDailyBudget: vi.fn(),
  answerPioneerRules: vi.fn(),
  selectPioneerHighlights: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => {
  type Server = (args: {
    context: Record<string, unknown>;
    next: (out?: { context?: Record<string, unknown> }) => Promise<void>;
  }) => Promise<unknown>;
  type Middleware = { step?: Server };
  return {
    createMiddleware: () => {
      const middleware = {
        step: undefined as Server | undefined,
        client: () => middleware,
        server: (fn: Server) => {
          middleware.step = fn;
          return middleware;
        },
      };
      return middleware;
    },
    createServerFn: () => {
      let middlewares: Middleware[] = [];
      let validate = (input: unknown) => input;
      const chain = {
        middleware: (list: Middleware[]) => {
          middlewares = list;
          return chain;
        },
        validator: (fn: (input: unknown) => unknown) => {
          validate = fn;
          return chain;
        },
        handler:
          (fn: (args: { context: unknown; data: unknown }) => unknown) =>
          async (args: { data: unknown }) => {
            let context: Record<string, unknown> = {};
            for (const middleware of middlewares) {
              await middleware.step?.({
                context,
                next: async (out) => {
                  context = { ...context, ...out?.context };
                },
              });
            }
            return fn({ context, data: validate(args.data) });
          },
      };
      return chain;
    },
  };
});
vi.mock("@/lib/auth/isolation.server", () => ({ assertSameSiteRequest: () => {} }));
vi.mock("@/lib/auth/verify.server", () => ({
  DEV_USER_ID: "dev-user",
  authConfigured: true,
  getSessionUser: async () => seams.user,
}));
vi.mock("@/lib/request-ip.server", () => ({ requestIp: () => "203.0.113.9" }));
vi.mock("@/lib/db", () => ({ getSql: vi.fn(), databaseConfigured: true }));
vi.mock("../llm/daily-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../llm/daily-usage")>()),
  checkDailyBudget: seams.checkDailyBudget,
}));
vi.mock("../llm/grok-client.server", () => ({ grokChat: vi.fn() }));
vi.mock("../llm/usage-log.server", () => ({ insertUsage: vi.fn() }));
vi.mock("@/lib/precog/firm/entitlements.server", () => ({
  loadEntitlements: async () => ({ aiPlan: "free" }),
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: vi.fn() }));
vi.mock("./pioneer-answer", () => ({
  readPioneerRequest: (input: unknown) => input,
  answerPioneerRules: seams.answerPioneerRules,
  answerPioneer: vi.fn(),
  selectPioneerHighlights: seams.selectPioneerHighlights,
}));

/** A fresh module per test, so the guard's in-memory limiters start empty. */
async function pioneerServer() {
  vi.resetModules();
  return import("./pioneer-server");
}

type Call = (args: { data: unknown }) => Promise<unknown>;

/** One question as the screen asks it: the rules brief, then the highlights. */
async function askQuestion(server: Record<string, unknown>) {
  await (server.runPioneerRules as Call)({ data: {} });
  await (server.runPioneerHighlights as Call)({ data: {} });
}

beforeEach(() => {
  seams.user = null;
  seams.checkDailyBudget.mockReset().mockResolvedValue("allowed");
  seams.answerPioneerRules.mockReset().mockResolvedValue({ ok: true });
  seams.selectPioneerHighlights.mockReset().mockResolvedValue({ ok: true });
  vi.stubEnv("XAI_API_KEY", "key");
});

describe("runPioneerRules", () => {
  it("refuses a signed-out burst at the heavy gate and asks the caller to sign in", async () => {
    const server = await pioneerServer();
    const rules = server.runPioneerRules as unknown as Call;
    const limit = LLM_LIMITS.anonymousHeavyPerIp.limit;
    for (let i = 0; i < limit; i++) await rules({ data: {} });
    await expect(rules({ data: {} })).rejects.toMatchObject({
      status: 429,
      message: "Too many requests — sign in, or try again in a minute.",
    });
    expect(seams.answerPioneerRules).toHaveBeenCalledTimes(limit);
  });

  it("answers a signed-out visitor who asks four sample questions in a minute", async () => {
    const server = await pioneerServer();
    for (let i = 0; i < 4; i++) await askQuestion(server);
    expect(seams.answerPioneerRules).toHaveBeenCalledTimes(4);
    expect(seams.selectPioneerHighlights).toHaveBeenCalledTimes(4);
  });

  it("holds a signed-in caller to the per-user minute limit", async () => {
    const server = await pioneerServer();
    seams.user = { id: "owner-1" };
    const rules = server.runPioneerRules as unknown as Call;
    for (let i = 0; i < LLM_LIMITS.perUser.limit; i++) await rules({ data: {} });
    await expect(rules({ data: {} })).rejects.toMatchObject({ status: 429 });
  });

  it("spends no daily model unit", async () => {
    const server = await pioneerServer();
    seams.user = { id: "owner-2" };
    await (server.runPioneerRules as unknown as Call)({ data: {} });
    expect(seams.checkDailyBudget).not.toHaveBeenCalled();
  });
});

describe("pioneer-server exports", () => {
  it("no longer exports runPioneerCoach, which had no caller", async () => {
    const server = await pioneerServer();
    expect(Object.keys(server).sort()).toEqual(["runPioneerHighlights", "runPioneerRules"]);
    expect("runPioneerCoach" in server).toBe(false);
  });
});
