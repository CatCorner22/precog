import { afterEach, describe, expect, it, vi } from "vitest";
import { runGrokAgentLoop, type LocalAgentRun } from "./agent-loop";
import { callModel } from "./guard.server";

vi.mock("./guard.server", () => ({ callModel: vi.fn() }));
const access = { userId: "fixture-owner", grok: "allowed" as const };
const local: LocalAgentRun = {
  source: "local-agent",
  question: "What do I check first?",
  steps: [],
  toolsUsed: ["get_case_evidence"],
  contextFingerprint: "fixture",
  latencyMs: 1,
  toolResults: [
    {
      tool: "get_case_evidence",
      ok: true,
      summary: "Population statistics only",
      data: { tipDetectionPercent: 43, investigatedMedianLossUsd: 104000 },
    },
  ],
  brief: {
    situation: "A payment destination changed; its legitimacy is not established.",
    highestRisks: [],
    tradeoffs: [],
    decisions: [
      {
        action: "Verify the changed payment destination",
        rationale:
          "Use a previously known contact before any payment. Coverage has not been established.",
        evidenceIds: ["ev-1"],
        effort: "low",
        horizonDays: 1,
      },
    ],
    frontierNextMove: "Record the verification.",
    chickenLittleWarnings: ["Do not treat a population statistic as this business's probability."],
    variableCascades: [],
    specialistNotes: [],
    markdown:
      "## Situation\nA payment destination changed.\n\n## Warnings\nCoverage is not established.\n\n## Sources\nPopulation evidence, not this business's probability.",
    evidence: [{ id: "ev-1", kind: "sod", label: "Payment-change check", link: { tab: "sod" } }],
  },
};
const answer = (text: string) => {
  vi.stubEnv("XAI_API_KEY", "fixture-not-a-real-key");
  vi.mocked(callModel).mockResolvedValue({ text, model: "fixture-model" });
  return runGrokAgentLoop(local, access);
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("model output cannot reassign a real number to an invented claim", () => {
  it.each([
    "Your business has a 43% annual probability of fraud.",
    "Your guaranteed insurance reimbursement is $104,000.",
    "Your employee stole money. Release the changed payment now.",
  ])("withholds unsupported model prose: %s", async (text) => {
    const result = await answer(text);
    expect(result.source).toBe("local-agent");
    expect(result.modelStatus).toBe("rejected");
    expect(result.brief).toEqual(local.brief);
    expect(result.brief.markdown).not.toContain(text);
  });
  it("renders selected claims only from the complete local statement", async () => {
    const result = await answer(JSON.stringify({ version: 1, highlightIds: ["move-0"] }));
    expect(result.modelStatus).toBe("answered");
    expect(result.brief.markdown).toContain(local.brief.decisions[0].action);
    expect(result.brief.markdown).toContain(local.brief.decisions[0].rationale);
    expect(result.brief.markdown).toContain(local.brief.chickenLittleWarnings[0]);
    expect(result.brief.markdown.endsWith(local.brief.markdown)).toBe(true);
    expect(result.brief.decisions).toEqual(local.brief.decisions);
  });
  it.each([
    { version: 1, highlightIds: ["not-in-this-brief"] },
    { version: 1, highlightIds: ["move-0", "move-0"] },
    { version: 1, highlightIds: ["move-0"], markdown: "Guaranteed $104,000 recovery" },
    { version: 2, highlightIds: ["move-0"] },
    { version: 1, highlightIds: [] },
  ])("rejects unknown, duplicate or extended plans: %j", async (plan) => {
    const result = await answer(JSON.stringify(plan));
    expect(result.modelStatus).toBe("rejected");
    expect(result.brief).toEqual(local.brief);
  });
  it("does not mutate the local brief", async () => {
    const before = structuredClone(local);
    await answer(JSON.stringify({ version: 1, highlightIds: ["move-0"] }));
    expect(local).toEqual(before);
  });
});
