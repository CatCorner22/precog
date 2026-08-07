import { createServerFn } from "@tanstack/react-start";
import { runGrokAgentLoop, runLocalAgentLoop } from "../llm/agent-loop";
import type { AgentRunResult } from "../llm/types";
import {
  DEFAULT_RISK_VARIABLES,
  type RiskVariableState,
} from "../scoring/dynamic-variables";
import type { StaffComposition } from "../types";
import { staffComposition as demoStaff } from "../demo-data";

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
    (input: {
      question?: string;
      preferLocal?: boolean;
      riskVariables?: Partial<RiskVariableState>;
      staff?: Partial<StaffComposition>;
      practiceName?: string;
    }) => ({
      question: (input.question ?? "").trim().slice(0, 1500),
      preferLocal: Boolean(input.preferLocal),
      riskVariables: input.riskVariables,
      staff: input.staff,
      practiceName: (input.practiceName ?? "").trim().slice(0, 80),
    }),
  )
  .handler(async ({ data }): Promise<PioneerCoachResult | PioneerCoachError> => {
    const question =
      data.question ||
      "Brief me with residual risk, ML leading indicators, variable cascades, and what to do this week.";

    const riskVariables: RiskVariableState = {
      ...DEFAULT_RISK_VARIABLES,
      ...(data.riskVariables ?? {}),
    };
    const staff: StaffComposition = {
      ...demoStaff,
      ...(data.staff ?? {}),
    };
    riskVariables.hasDualControl = staff.dualControlPayments;
    riskVariables.hasIndependentBankRec = staff.independentBankRec;

    const ctx = {
      riskVariables,
      staff,
      practiceName: data.practiceName || undefined,
      question,
    };

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

export const getLlmToolCatalog = createServerFn({ method: "GET" }).handler(
  async () => {
    const { TOOL_CATALOG } = await import("../llm/tools");
    return TOOL_CATALOG;
  },
);
