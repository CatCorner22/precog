import { afterEach, describe, expect, it, vi } from "vitest";
import { utcDateKey } from "../dates";
import { defaultProfile } from "../practice-profile";
import {
  MODEL_FAILED_WARNING,
  PIONEER_FAILED_MESSAGE,
  answerPioneer,
  dailyLimitWarning,
  readPioneerRequest,
  type PioneerRequestData,
} from "./pioneer-answer";
import { localBrief } from "./local-brief";
import { pioneerProfileFrom } from "./pioneer-profile";
import type { LlmAccess } from "../llm/guard.server";

vi.mock("./pioneer-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pioneer-profile")>();
  return { ...actual, pioneerProfileFrom: vi.fn(actual.pioneerProfileFrom) };
});
// The daily model budget and the caller's plan live in the database; these
// tests are about the brief.
const budget = vi.hoisted(() => ({
  state: "allowed" as Awaited<ReturnType<typeof import("../llm/daily-usage").checkDailyBudget>>,
  aiPlan: "free" as "free" | "paid",
}));
vi.mock("../llm/daily-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../llm/daily-usage")>()),
  checkDailyBudget: async () => budget.state,
}));
vi.mock("@/lib/db", () => ({ getSql: async () => ({}), databaseConfigured: false }));
vi.mock("@/lib/precog/firm/entitlements.server", () => ({
  loadEntitlements: async () => ({ aiPlan: budget.aiPlan }),
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: async () => {} }));
vi.mock("./local-brief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./local-brief")>();
  return { ...actual, localBrief: vi.fn(actual.localBrief) };
});

const TODAY = utcDateKey(new Date());

function access(grok: LlmAccess["grok"]): LlmAccess {
  return { userId: grok === "unauthenticated" ? null : "owner-1", grok };
}

function request(question = ""): PioneerRequestData {
  return readPioneerRequest({
    question,
    profile: defaultProfile("dental") as never,
    today: TODAY,
  });
}

describe("readPioneerRequest", () => {
  afterEach(() => vi.restoreAllMocks());

  it("answers a profile the builder rejects as a 400, without the internal text", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(pioneerProfileFrom).mockImplementationOnce(() => {
      throw new Error("internal detail");
    });
    let thrown: unknown;
    try {
      readPioneerRequest({ question: "hi", profile: {} as never });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ status: 400 });
    expect(String((thrown as Error).message)).not.toContain("internal detail");
  });

  it("keeps the question and the caller's day", () => {
    const data = request("What should I fix this week?");
    expect(data.question).toBe("What should I fix this week?");
    expect(data.today).toBe(TODAY);
    expect(data.profile.industry).toBe("dental");
  });
});

describe("answerPioneer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the requested local and unavailable-model messages", () => {
    expect(PIONEER_FAILED_MESSAGE).toBe(
      "Pioneer could not answer just now. Try again in a moment.",
    );
    expect(MODEL_FAILED_WARNING).toBe("Grok was unavailable, so Precog's rules wrote this brief.");
  });

  it("answers the default question when none is sent, with the rules brief and no model", async () => {
    const res = await answerPioneer(request(""), access("no_api_key"));
    if (!res.ok) throw new Error(res.error);
    expect(res.source).toBe("local-agent");
    expect(res.modelStatus).toBe("not-asked");
    expect(res.partial).toBe(false);
    expect(res.question).toBe("What are my biggest risks, and what do I do this week?");
    expect(res.markdown).toContain("## Answer");
    expect(res.markdown).not.toContain("Question:");
    // No key on the server: nothing for the owner to do, so no model warning.
    expect(res.warnings.some((w) => /Grok/.test(w))).toBe(false);
    expect(res.decisions.length).toBeGreaterThan(0);
    expect(res.decisions.some((d) => d.link)).toBe(true);
  });

  it("tells a signed-out caller what the constrained model adds", async () => {
    const res = await answerPioneer(
      request("What should I fix this week?"),
      access("unauthenticated"),
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.warnings.at(-1)).toMatch(/^Sign in to have Grok select the most relevant details/);
  });

  it("says so when the model was allowed but failed", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 401 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await answerPioneer(request("What should I fix this week?"), access("allowed"));
    if (!res.ok) throw new Error(res.error);
    expect(res.modelStatus).toBe("failed");
    expect(res.warnings).toContain(MODEL_FAILED_WARNING);
  });

  it("says today's AI limit is reached, not that Grok failed, once the daily budget is spent", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    budget.state = "spent";
    try {
      const res = await answerPioneer(request("What should I fix this week?"), access("allowed"));
      if (!res.ok) throw new Error(res.error);
      expect(res.modelStatus).toBe("daily-limit");
      expect(res.source).toBe("local-agent");
      // A free account hears its own figure and the Firm plan's, the figures in force.
      expect(res.warnings).toContain(
        "Precog has reached today's AI limit for the free plan (100 calls), so its rules built this brief. Try again tomorrow, or start the Firm plan for 400 a day.",
      );
      expect(res.warnings).not.toContain(MODEL_FAILED_WARNING);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      budget.state = "allowed";
    }
  });

  it("names the paid plan's own figure, and the ceiling across every account", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());
    budget.aiPlan = "paid";
    budget.state = "spent";
    try {
      const paid = await answerPioneer(request("x"), access("allowed"));
      if (!paid.ok) throw new Error(paid.error);
      expect(paid.warnings).toContain(
        "Precog has reached today's AI limit for your plan (400 calls), so its rules built this brief. Try again tomorrow.",
      );
      budget.state = "spent-global";
      const global = await answerPioneer(request("x"), access("allowed"));
      if (!global.ok) throw new Error(global.error);
      expect(global.modelStatus).toBe("daily-limit");
      expect(global.warnings).toContain(
        "Precog has reached its AI limit for today across every account, so its rules built this brief. Try again tomorrow.",
      );
      // A shared pool (one office address, say) names no figure of the account's own.
      budget.state = "spent-pool";
      const pool = await answerPioneer(request("x"), access("allowed"));
      if (!pool.ok) throw new Error(pool.error);
      expect(pool.modelStatus).toBe("daily-limit");
      expect(pool.warnings).toContain(
        "Precog has reached today's AI limit shared by your account and others, so its rules built this brief. Try again tomorrow.",
      );
    } finally {
      budget.state = "allowed";
      budget.aiPlan = "free";
    }
  });

  it("prints the limits in force, not typed figures", () => {
    const free = { scope: "user" as const, plan: "free" as const, limit: 100, paidLimit: 400 };
    expect(dailyLimitWarning(free)).toBe(
      "Precog has reached today's AI limit for the free plan (100 calls), so its rules built this brief. Try again tomorrow, or start the Firm plan for 400 a day.",
    );
    expect(dailyLimitWarning({ ...free, limit: 80, paidLimit: 600 })).toBe(
      "Precog has reached today's AI limit for the free plan (80 calls), so its rules built this brief. Try again tomorrow, or start the Firm plan for 600 a day.",
    );
    expect(dailyLimitWarning({ ...free, plan: "paid", limit: 600, paidLimit: 600 })).toBe(
      "Precog has reached today's AI limit for your plan (600 calls), so its rules built this brief. Try again tomorrow.",
    );
    expect(dailyLimitWarning({ ...free, scope: "global" })).toBe(
      "Precog has reached its AI limit for today across every account, so its rules built this brief. Try again tomorrow.",
    );
    for (const plan of ["free", "paid"] as const) {
      expect(dailyLimitWarning({ ...free, plan, scope: "pool" })).toBe(
        "Precog has reached today's AI limit shared by your account and others, so its rules built this brief. Try again tomorrow.",
      );
    }
  });

  it("returns the plain error envelope when building the brief throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(localBrief).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(answerPioneer(request("x"), access("no_api_key"))).resolves.toEqual({
      ok: false,
      error: PIONEER_FAILED_MESSAGE,
    });
  });
});
