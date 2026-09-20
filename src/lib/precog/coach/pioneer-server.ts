import { createServerFn } from "@tanstack/react-start";
import { runGrokAgentLoop, runLocalAgentLoop } from "../llm/agent-loop";
import { llmMiddleware } from "../llm/middleware";
import type { LlmAccess } from "../llm/guard.server";
import type { ToolContext } from "../llm/tools";
import type { AgentRunResult } from "../llm/types";
import { resolveClientDate } from "../continuity/coverage";
import { pioneerProfileFrom, type PioneerProfileInput } from "./pioneer-profile";

export type PioneerCoachResult = {
  ok: true;
  source: AgentRunResult["source"];
  model?: string;
  grokStatus?: LlmAccess["grok"];
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
  .middleware([llmMiddleware])
  .validator(
    (input: {
      question?: string;
      preferLocal?: boolean;
      profile?: PioneerProfileInput;
      today?: string;
    }) => ({
      question: (input.question ?? "").trim().slice(0, 1500),
      preferLocal: Boolean(input.preferLocal),
      profile: pioneerProfileFrom(input.profile ?? {}),
      today: resolveClientDate(input.today),
    }),
  )
  .handler(async ({ data, context }): Promise<PioneerCoachResult | PioneerCoachError> => {
    const question =
      data.question ||
      "Brief me with residual risk, ML leading indicators, variable cascades, and what to do this week.";

    const ctx: ToolContext = { profile: data.profile, question, today: data.today };

    try {
      const result =
        data.preferLocal || context.llm.grok !== "allowed"
          ? runLocalAgentLoop(question, ctx)
          : await runGrokAgentLoop(question, ctx);
      const warnings = [...result.brief.chickenLittleWarnings];
      if (
        !data.preferLocal &&
        context.llm.grok !== "allowed" &&
        context.llm.grok !== "no_api_key"
      ) {
        warnings.push(
          context.llm.grok === "unauthenticated"
            ? "Sign in to get the Grok-written brief; this one is the deterministic local brief."
            : "Grok is rate-limited for the moment; showing the local brief.",
        );
      }

      return {
        ok: true,
        source: result.source,
        model: result.model,
        grokStatus: context.llm.grok,
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
        warnings,
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
