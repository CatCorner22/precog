import { runGrokAgentLoop, type ModelOutcome, type ModelStatus } from "../llm/agent-loop";
import type { LlmAccess } from "../llm/guard.server";
import type { ToolContext } from "../llm/tools";
import type {
  AgentRunResult,
  DailyLimitInfo,
  DecisionLink,
  EvidenceRef,
  GrokAccess,
} from "../llm/types";
import { invalidRequest } from "@/lib/request-errors";
import { resolveClientDate } from "../dates";
import type { PracticeProfile } from "../practice-profile";
import { parsePioneerInput } from "../public-inputs";
import { pioneerProfileFrom, type PioneerProfileInput } from "./pioneer-profile";
import { DEFAULT_COACH_QUESTION, localBrief } from "./local-brief";

/**
 * What the coach's server function does, apart from the transport: read the
 * request, build the rules brief for this business, have the model select complete statements
 * when this caller may use the model, and say in the warnings when it could
 * not. pioneer-server.ts wraps these two functions in the server function.
 */

/** What the coach screen sends. */
export interface PioneerCoachInput {
  question?: string;
  profile?: PioneerProfileInput;
  today?: string;
}

/** The request after validation: the canonical profile and the caller's calendar day. */
export interface PioneerRequestData {
  question: string;
  profile: PracticeProfile;
  today: string;
}

export type PioneerCoachResult = {
  ok: true;
  source: AgentRunResult["source"];
  model?: string;
  /** Whether a model selected complete statements; the screen labels the brief with it. */
  modelStatus: ModelStatus;
  /** True when only the conflict-only brief could be built. */
  partial: boolean;
  markdown: string;
  contextFingerprint: string;
  latencyMs: number;
  toolsUsed: string[];
  steps: { phase: string; title: string; detail: string }[];
  evidence: EvidenceRef[];
  warnings: string[];
  decisions: {
    action: string;
    rationale: string;
    effort: string;
    horizonDays: number;
    link?: DecisionLink;
  }[];
  specialistNotes: { agent: string; title: string; bullets: string[] }[];
};

type PioneerCoachError = {
  ok: false;
  error: string;
};

export const PIONEER_FAILED_MESSAGE =
  "Pioneer could not build a brief for this map. Try again in a moment.";

/** The warning when the model was asked and gave no answer. */
export const MODEL_FAILED_WARNING =
  "Grok could not answer this time, so Precog's rules built this brief.";

/**
 * The warning when today's model budget is used up; it lasts until tomorrow.
 * Names the ceiling met and the figures in force: a free account's own
 * allowance (and the Firm plan's, which is the way past it), a paid
 * account's own, or Precog's across every account. A ceiling the account
 * shares with others names no figure, since the account's own was not reached.
 */
export function dailyLimitWarning(l: DailyLimitInfo): string {
  if (l.scope === "global") {
    return "Precog has reached its AI limit for today across every account, so its rules built this brief. Try again tomorrow.";
  }
  if (l.scope === "pool") {
    return "Precog has reached today's AI limit shared by your account and others, so its rules built this brief. Try again tomorrow.";
  }
  if (l.plan === "paid") {
    return `Precog has reached today's AI limit for your plan (${l.limit} calls), so its rules built this brief. Try again tomorrow.`;
  }
  return `Precog has reached today's AI limit for the free plan (${l.limit} calls), so its rules built this brief. Try again tomorrow, or start the Firm plan for ${l.paidLimit} a day.`;
}

/** Validates the coach request; a profile the schema let through but the builder rejects is a 400. */
export function readPioneerRequest(input: PioneerCoachInput): PioneerRequestData {
  const request = parsePioneerInput(input);
  const today = resolveClientDate(request.today);
  let profile: PracticeProfile;
  try {
    profile = pioneerProfileFrom(request.profile, today);
  } catch (error) {
    // The schema checked the shapes Pioneer walks; anything it missed is
    // still the caller's input, answered as such without the internal text.
    console.error("[pioneer] profile rejected", error);
    throw invalidRequest();
  }
  return {
    question: request.question,
    profile,
    today,
  };
}

/**
 * The brief for one validated request. The rules brief is always built first
 * and the model only selects complete statements, so both paths carry the same
 * decisions, evidence and warnings for this business.
 */
export async function answerPioneer(
  data: PioneerRequestData,
  access: LlmAccess,
): Promise<PioneerCoachResult | PioneerCoachError> {
  const grok = access.grok;
  const question = data.question || DEFAULT_COACH_QUESTION;
  const ctx: ToolContext = { profile: data.profile, question, today: data.today };

  try {
    const local = localBrief(question, ctx, data.profile);
    const result =
      grok === "allowed"
        ? await runGrokAgentLoop(local, access)
        : { ...local, modelStatus: "not-asked" as const };
    const warnings = [...result.brief.chickenLittleWarnings];
    const why = modelWarning(grok, result);
    if (why) warnings.push(why);

    return {
      ok: true,
      source: result.source,
      model: result.model,
      modelStatus: result.modelStatus,
      partial: result.partial,
      markdown: result.brief.markdown,
      contextFingerprint: result.contextFingerprint,
      latencyMs: result.latencyMs,
      toolsUsed: result.toolsUsed,
      steps: result.steps.map((s) => ({ phase: s.phase, title: s.title, detail: s.detail })),
      evidence: result.brief.evidence,
      warnings,
      decisions: result.brief.decisions.map((d) => ({
        action: d.action,
        rationale: d.rationale,
        effort: d.effort,
        horizonDays: d.horizonDays,
        link: d.link,
      })),
      specialistNotes: result.brief.specialistNotes,
    };
  } catch (e) {
    // Logged in full here; the caller gets a plain message, never the
    // internal error text.
    console.error("[pioneer] runPioneerCoach failed", e);
    return { ok: false, error: PIONEER_FAILED_MESSAGE };
  }
}

/**
 * Why the model did not select highlights, when the owner could do something
 * about it or should know. With no model key on the server there is nothing
 * the owner can do, so no warning: the screen's status line already says the
 * brief was built by this app's rules.
 */
function modelWarning(grok: GrokAccess, outcome: ModelOutcome): string | null {
  const status = outcome.modelStatus;
  if (grok === "unauthenticated") {
    return "Sign in to have Grok select the most relevant details; Precog's rules built this brief.";
  }
  if (grok === "rate_limited") {
    return "Grok is busy for the moment, so Precog's rules built this brief.";
  }
  if (status === "daily-limit" && outcome.dailyLimit) return dailyLimitWarning(outcome.dailyLimit);
  if (status === "rejected") {
    return "The model's response could not be validated and was not shown. This is the unchanged brief from Precog's rules.";
  }
  return status === "failed" ? MODEL_FAILED_WARNING : null;
}
