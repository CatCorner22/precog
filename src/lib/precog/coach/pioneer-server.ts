import { createServerFn } from "@tanstack/react-start";
import { runGrokAgentLoop, runLocalAgentLoop } from "../llm/agent-loop";
import type { ToolContext } from "../llm/tools";
import type { AgentRunResult } from "../llm/types";
import { pioneerProfileFrom, type PioneerProfileInput } from "./pioneer-profile";

export type PioneerCoachResult = {
  ok: true;
  source: AgentRunResult["source"];
  model?: string;
  markdown: string;
  contextFingerprint: string;
  latencyMs: number;
  toolsUsed: string[];
  steps: {
    phase: string;
    title: string;
    detail: string;
    toolSummaries?: string[];
  }[];
  evidence: {
    id: string;
    kind: string;
    label: string;
    metric?: string;
    link: { tab: string; id?: string };
  }[];
  warnings: string[];
  decisions: {
    action: string;
    rationale: string;
    effort: string;
    horizonDays: number;
  }[];
  specialistNotes: { agent: string; title: string; bullets: string[] }[];
};

export type PioneerCoachError = {
  ok: false;
  error: string;
};

export const runPioneerCoach = createServerFn({ method: "POST" })
  .validator(
    (input: { question?: string; preferLocal?: boolean; profile?: PioneerProfileInput }) => ({
      question: (input.question ?? "").trim().slice(0, 1500),
      preferLocal: Boolean(input.preferLocal),
      profile: pioneerProfileFrom(input.profile ?? {}),
    }),
  )
  .handler(async ({ data }): Promise<PioneerCoachResult | PioneerCoachError> => {
    const question =
      data.question ||
      "Brief me with residual risk, ML leading indicators, variable cascades, and what to do this week.";

    const ctx: ToolContext = { profile: data.profile, question };

    try {
      const result =
        data.preferLocal || !process.env.XAI_API_KEY
          ? runLocalAgentLoop(question, ctx)
          : await runGrokAgentLoop(question, ctx);

      return {
        ok: true,
        source: result.source,
        model: result.model,
        markdown: result.brief.markdown,
        contextFingerprint: result.contextFingerprint,
        latencyMs: result.latencyMs,
        toolsUsed: result.toolsUsed,
        steps: result.steps.map((s) => ({
          phase: s.phase,
          title: s.title,
          detail: s.detail,
          toolSummaries: s.toolResults?.map((t) => `${t.tool}: ${t.summary}`),
        })),
        evidence: result.brief.evidence,
        warnings: result.brief.chickenLittleWarnings,
        decisions: result.brief.decisions.map((d) => ({
          action: d.action,
          rationale: d.rationale,
          effort: d.effort,
          horizonDays: d.horizonDays,
        })),
        specialistNotes: result.brief.specialistNotes,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Pioneer agent failed",
      };
    }
  });

export const getLlmToolCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { TOOL_CATALOG } = await import("../llm/tools");
  return TOOL_CATALOG;
});
