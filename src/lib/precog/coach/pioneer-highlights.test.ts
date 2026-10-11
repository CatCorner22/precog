import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { utcDateKey } from "../dates";
import { defaultProfile } from "../practice-profile";
import { runGrokAgentLoop } from "../llm/agent-loop";
import { spendCallerDailyUnit } from "../llm/guard.server";
import { HF_EMBED_MODEL } from "../llm/hf-rank";
import { readPioneerRequest, selectPioneerHighlights } from "./pioneer-answer";

vi.mock("../llm/agent-loop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../llm/agent-loop")>()),
  runGrokAgentLoop: vi.fn(),
}));
vi.mock("../llm/guard.server", () => ({ spendCallerDailyUnit: vi.fn() }));

const REJECTED_WARNING =
  "Grok's reply failed Precog's checks and is not shown. Precog's rules wrote this brief.";

/** Every event in call order: budget units, model calls starting and ending. */
let events: string[] = [];

function request() {
  return readPioneerRequest({
    question: "Who can pay a vendor alone?",
    profile: defaultProfile("dental") as never,
    today: utcDateKey(new Date()),
  });
}

/** Grok answers with these ids (or an empty selection) as a selection that passed the protocol. */
function grokSelects(ids: string[]) {
  vi.mocked(runGrokAgentLoop).mockImplementation(async (local) => {
    events.push("grok-start");
    return {
      ...local,
      modelStatus: "answered" as const,
      highlightIds: ids,
      source: "grok-agent" as const,
      model: "grok-4.5",
    };
  });
}

/** The encoder scores each statement with `score(index, count)`. */
function encoderScores(score: (index: number, count: number) => number, wait?: Promise<unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      events.push("hf-start");
      if (wait) await wait;
      events.push("hf-end");
      const { inputs } = JSON.parse(String(init?.body)) as { inputs: { sentences: string[] } };
      const count = inputs.sentences.length;
      return new Response(JSON.stringify(inputs.sentences.map((_, i) => score(i, count))), {
        status: 200,
      });
    }),
  );
}

describe("selectPioneerHighlights", () => {
  beforeEach(() => {
    events = [];
    vi.stubEnv("HF_TOKEN", "test-token");
    vi.mocked(spendCallerDailyUnit).mockImplementation(async () => {
      events.push("hf-unit");
      return { budget: "allowed", plan: "free" };
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("says Grok's reply is not shown when the encoder rejects every id it picked", async () => {
    // Grok picks the last statement; the encoder ties the first three and
    // ranks the last one low, so no id agrees and no statement is clearly nearest.
    encoderScores((i) => (i < 3 ? 0.5 : 0.1));
    vi.mocked(runGrokAgentLoop).mockImplementation(async (local) => ({
      ...local,
      modelStatus: "answered" as const,
      highlightIds: [`move-${Math.min(local.brief.decisions.length, 6) - 1}`],
      source: "grok-agent" as const,
      model: "grok-4.5",
    }));
    const res = await selectPioneerHighlights(request(), { userId: "owner-1", grok: "allowed" });
    if (!res.ok) throw new Error(res.error);
    expect(res.highlightIds).toEqual([]);
    expect(res.ranker).toBeUndefined();
    expect(res.modelStatus).toBe("rejected");
    expect(res.model).toBeUndefined();
    expect(res.warning).toBe(REJECTED_WARNING);
  });

  it("marks nothing and warns of nothing when Grok finds no statement relevant", async () => {
    encoderScores((i) => (i === 0 ? 0.9 : 0.1));
    grokSelects([]);
    const res = await selectPioneerHighlights(request(), { userId: "owner-1", grok: "allowed" });
    if (!res.ok) throw new Error(res.error);
    expect(res.highlightIds).toEqual([]);
    expect(res.ranker).toBeUndefined();
    expect(res.modelStatus).toBe("answered");
    expect(res.warning).toBeNull();
  });

  it("starts the Grok call before the Hugging Face reply, after the Hugging Face unit is spent", async () => {
    let release: () => void = () => {};
    const grokStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The encoder replies once Grok has started, or after 300 ms when the
    // calls run one after the other.
    encoderScores(
      (i) => (i === 0 ? 0.9 : 0.1),
      Promise.race([grokStarted, new Promise((resolve) => setTimeout(resolve, 300))]),
    );
    vi.mocked(runGrokAgentLoop).mockImplementation(async (local) => {
      events.push("grok-start");
      release();
      return { ...local, modelStatus: "answered" as const, highlightIds: ["move-0"] };
    });
    const res = await selectPioneerHighlights(request(), { userId: "owner-1", grok: "allowed" });
    if (!res.ok) throw new Error(res.error);
    expect(events.indexOf("hf-unit")).toBe(0);
    expect(events.indexOf("hf-unit")).toBeLessThan(events.indexOf("hf-start"));
    expect(events.indexOf("grok-start")).toBeLessThan(events.indexOf("hf-end"));
    expect(res.highlightIds).toEqual(["move-0"]);
    expect(res.ranker).toBe("both");
  });

  it("makes no Hugging Face call when its daily unit is refused", async () => {
    vi.mocked(spendCallerDailyUnit).mockResolvedValue({ budget: "spent", plan: "free" });
    encoderScores(() => 0.5);
    grokSelects(["move-0"]);
    const res = await selectPioneerHighlights(request(), { userId: "owner-1", grok: "allowed" });
    if (!res.ok) throw new Error(res.error);
    expect(fetch).not.toHaveBeenCalled();
    expect(res.ranker).toBe("grok");
  });

  it("names the encoder from hf-rank, not a second copy of its name", async () => {
    encoderScores((i) => (i === 0 ? 0.9 : 0.1));
    vi.stubEnv("XAI_API_KEY", "");
    const res = await selectPioneerHighlights(request(), {
      userId: "owner-1",
      grok: "no_api_key",
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.ranker).toBe("huggingface");
    expect(res.model).toBe(HF_EMBED_MODEL);
    const source = readFileSync(new URL("./pioneer-answer.ts", import.meta.url), "utf8");
    expect(source).not.toContain(HF_EMBED_MODEL);
  });
});
