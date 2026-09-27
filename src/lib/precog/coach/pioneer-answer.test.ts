import { afterEach, describe, expect, it, vi } from "vitest";
import { utcDateKey } from "../dates";
import { defaultProfile } from "../practice-profile";
import {
  MODEL_FAILED_WARNING,
  PIONEER_FAILED_MESSAGE,
  answerPioneer,
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
// The daily model budget lives in the database; these tests are about the brief.
vi.mock("../llm/daily-usage", () => ({ withinDailyBudget: async () => true }));
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

  it("answers the default question when none is sent, with the rules brief and no model", async () => {
    const res = await answerPioneer(request(""), access("no_api_key"));
    if (!res.ok) throw new Error(res.error);
    expect(res.source).toBe("local-agent");
    expect(res.modelStatus).toBe("not-asked");
    expect(res.partial).toBe(false);
    expect(res.markdown).toMatch(/Question: _Brief me on my biggest risks/);
    // No key on the server: nothing for the owner to do, so no model warning.
    expect(res.warnings.some((w) => /Grok/.test(w))).toBe(false);
    expect(res.decisions.length).toBeGreaterThan(0);
    expect(res.decisions.some((d) => d.link)).toBe(true);
  });

  it("tells a signed-out caller that signing in gets the Grok-written brief", async () => {
    const res = await answerPioneer(
      request("What should I fix this week?"),
      access("unauthenticated"),
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.warnings.at(-1)).toMatch(/^Sign in to have Grok write the brief/);
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
