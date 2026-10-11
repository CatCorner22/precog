import { describe, expect, it, vi } from "vitest";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { runMetaAnalysis } from "./meta-analysis";
import { executeTool, executeTools } from "./tools";

// Count each costly computation; every one still runs for real.
const { calls, counted } = vi.hoisted(() => {
  const calls = new Map<string, number>();
  const counted =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A): R => {
      calls.set(name, (calls.get(name) ?? 0) + 1);
      return fn(...args);
    };
  return { calls, counted };
});

vi.mock("../active-template", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../active-template")>();
  return { ...actual, resolveTemplate: counted("resolveTemplate", actual.resolveTemplate) };
});
vi.mock("../sod/detect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sod/detect")>();
  return {
    ...actual,
    detectSodConflicts: counted("detectSodConflicts", actual.detectSodConflicts),
  };
});
vi.mock("../scoring/residual-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../scoring/residual-engine")>();
  return { ...actual, portfolioSummary: counted("portfolioSummary", actual.portfolioSummary) };
});
vi.mock("../ml/leading-indicators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ml/leading-indicators")>();
  return {
    ...actual,
    scoreLeadingIndicators: counted("scoreLeadingIndicators", actual.scoreLeadingIndicators),
  };
});

describe("one coach request computes each shared figure once", () => {
  it("the meta-analysis adds no second template, duty-conflict check, portfolio or conditions", () => {
    const profile = defaultProfile("dental");
    const counts = (tools: Parameters<typeof executeTools>[0]) => {
      calls.clear();
      executeTools(tools, { profile, question: "What do we know?" });
      return Object.fromEntries(calls);
    };
    const shared = [
      "get_sod_conflicts",
      "get_residual_portfolio",
      "get_leading_indicators",
    ] as const;
    const without = counts([...shared]);
    expect(without.resolveTemplate).toBe(1);
    expect(without.detectSodConflicts).toBe(1);
    expect(counts([...shared, "run_meta_analysis"])).toEqual(without);
  });

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s: the meta-analysis tool reports what runMetaAnalysis computes alone",
    (industry) => {
      const profile = defaultProfile(industry);
      const alone = runMetaAnalysis(profile);
      const [, , , tool] = executeTools(
        [
          "get_sod_conflicts",
          "get_residual_portfolio",
          "get_leading_indicators",
          "run_meta_analysis",
        ],
        { profile },
      );
      expect(tool.data).toMatchObject({
        summary: alone.summary,
        narrative: alone.narrative,
        recommendations: alone.recommendations,
      });
      expect(executeTool("run_meta_analysis", { profile })).toEqual(tool);
    },
  );
});
