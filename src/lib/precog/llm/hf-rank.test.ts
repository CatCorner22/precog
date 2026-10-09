import { afterEach, describe, expect, it, vi } from "vitest";
import type { BriefClaim } from "./brief-selection";
import { chooseHighlightIds, rankClaimsWithHuggingFace, topSimilar } from "./hf-rank";

const claims: BriefClaim[] = [
  {
    id: "move-0",
    text: "Separate who adds a vendor from who pays them.\n\nOne person can do both.",
  },
  { id: "move-1", text: "Mark a stand-in for payroll.\n\nOnly one person can run it." },
  { id: "move-2", text: "Read the bank statement this month.\n\nNobody else sees it." },
];

describe("chooseHighlightIds", () => {
  it("keeps a model id only when the encoder also ranked it near the top", () => {
    const chosen = chooseHighlightIds({
      claimIds: ["move-0", "move-1", "move-2", "move-3"],
      embedScores: [0.2, 0.95, 0.4, 0.05],
      llmIds: ["move-1", "move-3"],
    });
    expect(chosen).toEqual({ ids: ["move-1"], source: "both" });
  });

  it("drops every model id when none of them are near, and keeps the nearest statement", () => {
    const chosen = chooseHighlightIds({
      claimIds: ["move-0", "move-1", "move-2", "move-3"],
      embedScores: [0.95, 0.4, 0.2, 0.01],
      llmIds: ["move-3"],
    });
    expect(chosen).toEqual({ ids: ["move-0"], source: "huggingface" });
  });

  it("uses the nearest statement when no language model answered", () => {
    expect(
      chooseHighlightIds({
        claimIds: ["move-0", "move-1"],
        embedScores: [0.1, 0.8],
        llmIds: null,
      }),
    ).toEqual({ ids: ["move-1"], source: "huggingface" });
  });

  it("keeps parsed model ids, in rules order, when there is no encoder score", () => {
    expect(
      chooseHighlightIds({
        claimIds: ["move-0", "move-1", "move-2"],
        embedScores: null,
        llmIds: ["move-2", "not-real", "move-0"],
      }),
    ).toEqual({ ids: ["move-0", "move-2"], source: "llm" });
  });

  it("returns nothing when there is no score and no valid id", () => {
    expect(
      chooseHighlightIds({
        claimIds: ["move-0"],
        embedScores: null,
        llmIds: ["nope"],
      }),
    ).toBeNull();
  });
});

describe("topSimilar", () => {
  it("breaks ties by rules order and drops a non-finite score", () => {
    expect(topSimilar(["a", "b", "c"], [0.5, Number.NaN, 0.5], 3)).toEqual(["a", "c"]);
  });

  it("rejects a score list that does not match the statements", () => {
    expect(topSimilar(["a"], [0.2, 0.3], 1)).toBeNull();
  });
});

describe("rankClaimsWithHuggingFace", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not call the network without a token", async () => {
    vi.stubEnv("HF_TOKEN", "");
    const fetchImpl = vi.fn();
    expect(await rankClaimsWithHuggingFace("Who can pay a vendor?", claims, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ranks with the encoder and keeps only a selection that names real ids", async () => {
    vi.stubEnv("HF_TOKEN", "test-token");
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("sentence-similarity")) {
        return new Response(JSON.stringify([0.2, 0.91, 0.4]), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ version: 1, highlightIds: ["move-1"] }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const ranked = await rankClaimsWithHuggingFace("Who runs payroll?", claims, fetchImpl);
    expect(ranked).toEqual({ scores: [0.2, 0.91, 0.4], llmIds: ["move-1"] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers && (init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token",
    );
  });

  it("drops model prose and still returns the scores", async () => {
    vi.stubEnv("HF_TOKEN", "test-token");
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes("sentence-similarity")) {
        return new Response(JSON.stringify([0.4, 0.5, 0.6]), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Your employee stole $104,000." } }],
        }),
        { status: 200 },
      );
    });
    const ranked = await rankClaimsWithHuggingFace("What is exposed?", claims, fetchImpl);
    expect(ranked?.scores).toEqual([0.4, 0.5, 0.6]);
    expect(ranked?.llmIds).toBeNull();
  });
});
