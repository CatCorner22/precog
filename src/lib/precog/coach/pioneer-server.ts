import { createServerFn } from "@tanstack/react-start";
import { runGrokAgentLoop } from "../llm/agent-loop";
import { heavyLlmMiddleware } from "../llm/middleware";
import type { LlmAccess } from "../llm/guard.server";
import type { ToolContext } from "../llm/tools";
import type { AgentRunResult } from "../llm/types";
import { invalidRequest } from "@/lib/request-errors";
import { resolveClientDate } from "../continuity/coverage";
import type { PracticeProfile } from "../practice-profile";
import { parsePioneerInput } from "../public-inputs";
import { pioneerProfileFrom, type PioneerProfileInput } from "./pioneer-profile";
import { localBrief } from "./local-brief";

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

const PIONEER_FAILED_MESSAGE =
  "Pioneer could not build a brief for this map. Try again in a moment.";

export const runPioneerCoach = createServerFn({ method: "POST" })
  .middleware([heavyLlmMiddleware])
  .validator(
    (input: {
      question?: string;
      preferLocal?: boolean;
      profile?: PioneerProfileInput;
      today?: string;
    }) => {
      const request = parsePioneerInput(input);
      let profile: PracticeProfile;
      try {
        profile = pioneerProfileFrom(request.profile);
      } catch (error) {
        // The schema checked the shapes Pioneer walks; anything it missed is
        // still the caller's input, answered as such without the internal text.
        console.error("[pioneer] profile rejected", error);
        throw invalidRequest();
      }
      return {
        question: request.question,
        preferLocal: request.preferLocal,
        profile,
        today: resolveClientDate(request.today),
      };
    },
  )
  .handler(async ({ data, context }): Promise<PioneerCoachResult | PioneerCoachError> => {
    const question =
      data.question ||
      "Brief me with residual risk, ML leading indicators, variable cascades, and what to do this week.";

    const ctx: ToolContext = { profile: data.profile, question, today: data.today };

    try {
      const result =
        data.preferLocal || context.llm.grok !== "allowed"
          ? localBrief(question, ctx, data.profile)
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
      // Logged in full here; the caller gets a plain message, never the
      // internal error text.
      console.error("[pioneer] runPioneerCoach failed", e);
      return { ok: false, error: PIONEER_FAILED_MESSAGE };
    }
  });
