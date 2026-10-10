import { runGrokAgentLoop, type ModelOutcome, type ModelStatus } from "../llm/agent-loop";
import { briefClaims } from "../llm/brief-selection";
import { chooseHighlightIds, type RankerName, rankClaimsWithHuggingFace } from "../llm/hf-rank";
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
  question: string;
  markdown: string;
  contextFingerprint: string;
  latencyMs: number;
  toolsUsed: string[];
  steps: { phase: string; title: string; detail: string }[];
  evidence: EvidenceRef[];
  warnings: string[];
  /** Rules-authored statement ids the model selected. Empty when it did not. */
  highlightIds: readonly string[];
  /** Which model ranked those ids. Absent when none did. */
  ranker?: RankerName;
  decisions: {
    action: string;
    rationale: string;
    effort: string;
    horizonDays: number;
    link?: DecisionLink;
    evidenceIds?: readonly string[];
  }[];
  specialistNotes: { agent: string; title: string; bullets: string[] }[];
  details: { title: string; lines: string[] }[];
};

type PioneerCoachError = {
  ok: false;
  error: string;
};

export const PIONEER_FAILED_MESSAGE = "Voyager could not answer just now. Try again in a moment.";

/** The warning when the model was asked and gave no answer. */
export const MODEL_FAILED_WARNING = "Grok did not answer, so Precog's rules wrote this brief.";

/**
 * The warning when today's model budget is used up; it lasts until tomorrow.
 * Names the ceiling met and the figures in force: a free account's own
 * allowance (and the Firm plan's, which is the way past it), a paid
 * account's own, or Precog's across every account. A ceiling the account
 * shares with others names no figure, since the account's own was not reached.
 */
export function dailyLimitWarning(l: DailyLimitInfo): string {
  if (l.scope === "global") {
    return "Precog has reached its AI limit for today across every account. Precog's rules wrote this brief. Try again tomorrow.";
  }
  if (l.scope === "pool") {
    return "Precog has reached today's AI limit shared by your account and others. Precog's rules wrote this brief. Try again tomorrow.";
  }
  if (l.plan === "paid") {
    return `Precog has reached today's AI limit for your plan (${l.limit} calls). Precog's rules wrote this brief. Try again tomorrow.`;
  }
  return `Precog has reached today's AI limit for the free plan (${l.limit} calls). Precog's rules wrote this brief. Try again tomorrow, or start the Firm plan for ${l.paidLimit} a day.`;
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
        : { ...local, modelStatus: "not-asked" as const, highlightIds: [] as readonly string[] };
    const warnings = [...result.brief.chickenLittleWarnings];
    const why = modelWarning(grok, result);
    if (why) warnings.push(why);

    return {
      ok: true,
      source: result.source,
      model: result.model,
      modelStatus: result.modelStatus,
      partial: result.partial,
      question,
      markdown: result.brief.markdown,
      contextFingerprint: result.contextFingerprint,
      latencyMs: result.latencyMs,
      toolsUsed: result.toolsUsed,
      steps: result.steps.map((s) => ({ phase: s.phase, title: s.title, detail: s.detail })),
      evidence: result.brief.evidence,
      warnings,
      highlightIds: result.highlightIds ? [...result.highlightIds] : [],
      decisions: result.brief.decisions.map((d) => ({
        action: d.action,
        rationale: d.rationale,
        effort: d.effort,
        horizonDays: d.horizonDays,
        link: d.link,
      })),
      specialistNotes: result.brief.specialistNotes,
      details: [
        { title: "What else moves", lines: result.brief.variableCascades },
        {
          title: "Order of fixes (Precog's model)",
          lines: result.brief.advancedReasoning ?? [],
        },
        { title: "Tradeoffs", lines: result.brief.tradeoffs },
      ].filter((section) => section.lines.length > 0),
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
    return "Sign in to let Voyager rank the most relevant moves. Precog's rules wrote this brief.";
  }
  if (grok === "rate_limited") {
    return "Voyager is busy right now. Precog's rules wrote this brief.";
  }
  if (status === "daily-limit" && outcome.dailyLimit) return dailyLimitWarning(outcome.dailyLimit);
  if (status === "rejected") {
    return "Grok's reply failed Precog's checks and is not shown. Precog's rules wrote this brief.";
  }
  return status === "failed" ? MODEL_FAILED_WARNING : null;
}

/** The rules brief only. The screen paints this before any model call. */
export async function answerPioneerRules(
  data: PioneerRequestData,
): Promise<PioneerCoachResult | PioneerCoachError> {
  return answerPioneer(data, { userId: null, grok: "no_api_key" });
}

/** Ids only. The screen applies them when the fingerprint still matches the painted brief. */
export async function selectPioneerHighlights(
  data: PioneerRequestData,
  access: LlmAccess,
): Promise<
  | {
      ok: true;
      contextFingerprint: string;
      highlightIds: readonly string[];
      modelStatus: ModelStatus;
      model?: string;
      ranker?: RankerName;
      source: AgentRunResult["source"];
      warning: string | null;
    }
  | PioneerCoachError
> {
  const grok = access.grok;
  const question = data.question || DEFAULT_COACH_QUESTION;
  const ctx: ToolContext = { profile: data.profile, question, today: data.today };
  try {
    const local = localBrief(question, ctx, data.profile);
    const claims = briefClaims(local.brief);
    const hf = (await hfMayRank(access, grok))
      ? await rankClaimsWithHuggingFace(question, claims, fetch, { chat: grok !== "allowed" })
      : null;
    const result =
      grok === "allowed"
        ? await runGrokAgentLoop(local, access)
        : { ...local, modelStatus: "not-asked" as const, highlightIds: [] as readonly string[] };
    const grokIds = result.highlightIds ?? [];
    const chosen = chooseHighlightIds({
      claimIds: claims.map((claim) => claim.id),
      embedScores: hf?.scores ?? null,
      llmIds: grokIds.length > 0 ? grokIds : (hf?.llmIds ?? null),
    });
    const ranker = chosen
      ? rankerFor(chosen.source, grokIds.length > 0, Boolean(hf?.scores))
      : undefined;
    const modelStatus: ModelStatus = chosen && ranker ? "answered" : result.modelStatus;
    return {
      ok: true,
      contextFingerprint: result.contextFingerprint,
      highlightIds: chosen?.ids ?? [],
      modelStatus,
      model: ranker === "huggingface" ? "sentence-transformers/all-MiniLM-L6-v2" : result.model,
      ranker,
      source: result.source,
      warning: modelWarning(grok, { ...result, modelStatus }),
    };
  } catch (e) {
    console.error("[voyager] highlight failed", e);
    return { ok: false, error: PIONEER_FAILED_MESSAGE };
  }
}

function rankerFor(
  source: "huggingface" | "llm" | "both",
  grokPicked: boolean,
  embedded: boolean,
): RankerName {
  if (source === "huggingface" || (embedded && !grokPicked)) return "huggingface";
  if (source === "both" && grokPicked) return "both";
  if (source === "both") return "huggingface";
  return "grok";
}

/** Hugging Face runs for a signed-in caller and spends one daily unit, including when Grok will also run. */
async function hfMayRank(access: LlmAccess, grok: GrokAccess): Promise<boolean> {
  if (!access.userId || !process.env.HF_TOKEN?.trim()) return false;
  if (grok === "unauthenticated" || grok === "rate_limited") return false;
  const { checkDailyBudget } = await import("../llm/daily-usage");
  const { getSql } = await import("@/lib/db");
  return (await checkDailyBudget(getSql, access.userId)) === "allowed";
}
