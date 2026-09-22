import { createServerFn } from "@tanstack/react-start";
import { grokChat } from "../llm/grok-client.server";
import { llmMiddleware } from "../llm/middleware";
import {
  suggestLocally,
  type SuggestedIdea,
  type SuggestedRisk,
  type SuggestionInput,
  type SuggestionResult,
} from "./suggest";

const RISK_KINDS = new Set([
  "control",
  "fraud",
  "continuity",
  "quality",
  "compliance",
  "revenue",
  "safety",
]);
const IDEA_CATS = new Set(["control", "lean", "tech", "training", "policy"]);
const LEVELS = new Set(["low", "medium", "high"]);

function clampLevel(n: unknown): 1 | 2 | 3 | 4 | 5 {
  const v = Math.round(Number(n));
  return (Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 3) as 1 | 2 | 3 | 4 | 5;
}

function sanitizeRisk(r: Record<string, unknown>): SuggestedRisk | null {
  const title = String(r.title ?? "")
    .trim()
    .slice(0, 80);
  if (!title) return null;
  const kind = RISK_KINDS.has(String(r.kind))
    ? (String(r.kind) as SuggestedRisk["kind"])
    : "control";
  return {
    title,
    kind,
    severity: clampLevel(r.severity),
    likelihood: clampLevel(r.likelihood),
    note: String(r.note ?? "")
      .trim()
      .slice(0, 200),
  };
}

function sanitizeIdea(i: Record<string, unknown>): SuggestedIdea | null {
  const title = String(i.title ?? "")
    .trim()
    .slice(0, 80);
  if (!title) return null;
  const pick = <T extends string>(set: Set<string>, v: unknown, d: T) =>
    set.has(String(v)) ? (String(v) as T) : d;
  return {
    title,
    category: pick(IDEA_CATS, i.category, "control" as SuggestedIdea["category"]),
    effort: pick(LEVELS, i.effort, "low" as SuggestedIdea["effort"]),
    impact: pick(LEVELS, i.impact, "medium" as SuggestedIdea["impact"]),
    note: String(i.note ?? "")
      .trim()
      .slice(0, 200),
    status: "backlog",
  };
}

async function suggestWithGrok(
  input: SuggestionInput,
  apiKey: string,
): Promise<SuggestionResult | null> {
  const controlsList = input.availableControls.map((c) => `${c.id}: ${c.name}`).join("\n");
  const prompt = `You are an internal-controls advisor for a small ${input.industryLabel} business (2-20 people).
Process: "${input.processName}"
Description: ${input.description || "(none)"}
Owner roles: ${input.ownerRoles.join(", ") || "(none)"}
Already-listed risks: ${input.existingRiskTitles.join("; ") || "(none)"}
Already-listed ideas: ${input.existingIdeaTitles.join("; ") || "(none)"}
Available controls (choose ids only from this list):
${controlsList}

Return ONLY a JSON object, no prose, shaped exactly:
{"risks":[{"title":"","kind":"fraud|control|continuity|quality|compliance|revenue|safety","severity":1-5,"likelihood":1-5,"note":""}],
 "ideas":[{"title":"","category":"control|lean|tech|training|policy","effort":"low|medium|high","impact":"low|medium|high","note":""}],
 "controlIds":[""],
 "rationale":""}
Rules: 3-4 risks, 2-3 ideas, 0-3 controlIds. Plain English an owner understands. Do not repeat already-listed items. Never accuse people; describe control gaps. Notes under 160 characters.`;

  const response = await grokChat(apiKey, {
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1200,
    temperature: 0.4,
    jsonObject: true,
  });
  if (!response) return null;
  const text = response.text;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?/m, "").replace(/```$/m, "")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  const available = new Set(input.availableControls.map((c) => c.id));
  const risks = (Array.isArray(parsed.risks) ? parsed.risks : [])
    .map((r) => sanitizeRisk(r as Record<string, unknown>))
    .filter((r): r is SuggestedRisk => Boolean(r))
    .slice(0, 4);
  const ideas = (Array.isArray(parsed.ideas) ? parsed.ideas : [])
    .map((i) => sanitizeIdea(i as Record<string, unknown>))
    .filter((i): i is SuggestedIdea => Boolean(i))
    .slice(0, 3);
  const controlIds = (Array.isArray(parsed.controlIds) ? parsed.controlIds : [])
    .map(String)
    .filter((id) => available.has(id))
    .slice(0, 3);
  if (!risks.length && !ideas.length) return null;
  return {
    source: "grok",
    model: response.model,
    risks,
    ideas,
    controlIds,
    rationale:
      String(parsed.rationale ?? "").slice(0, 240) || "Grok reviewed the process description.",
  };
}

/** Suggest risks, improvement ideas, and controls for a process the user is building. */
export const suggestForProcess = createServerFn({ method: "POST" })
  .middleware([llmMiddleware])
  .validator((input: Partial<SuggestionInput>): SuggestionInput => ({
    processName: String(input.processName ?? "").slice(0, 80),
    description: String(input.description ?? "").slice(0, 400),
    industryLabel: String(input.industryLabel ?? "small business").slice(0, 60),
    existingRiskTitles: (input.existingRiskTitles ?? []).map(String).slice(0, 20),
    existingIdeaTitles: (input.existingIdeaTitles ?? []).map(String).slice(0, 20),
    availableControls: (input.availableControls ?? [])
      .map((c) => ({ id: String(c.id), name: String(c.name).slice(0, 80) }))
      .slice(0, 30),
    ownerRoles: (input.ownerRoles ?? []).map(String).slice(0, 10),
  }))
  .handler(async ({ data, context }): Promise<SuggestionResult> => {
    const local = suggestLocally(data);
    const apiKey = process.env.XAI_API_KEY;
    if (context.llm.grok !== "allowed" || !apiKey || !data.processName.trim())
      return { ...local, grokStatus: context.llm.grok };
    try {
      const ai = await suggestWithGrok(data, apiKey);
      if (!ai) return { ...local, grokStatus: context.llm.grok };
      // Pad thin AI output with local suggestions so the panel is never sparse.
      const seen = new Set(ai.risks.map((r) => r.title.toLowerCase()));
      for (const r of local.risks) {
        if (ai.risks.length >= 4) break;
        if (!seen.has(r.title.toLowerCase())) ai.risks.push(r);
      }
      if (!ai.controlIds.length) ai.controlIds = local.controlIds;
      return { ...ai, grokStatus: context.llm.grok };
    } catch {
      return { ...local, grokStatus: context.llm.grok };
    }
  });
