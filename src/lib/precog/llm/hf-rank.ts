import { parseBriefSelection, type BriefClaim } from "./brief-selection";

/** The encoder that scores a question against rule-written statements. */
export const HF_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

/** A small instruction model. It may return statement ids only. */
export const HF_CHAT_MODEL = "HuggingFaceTB/SmolLM3-3B:hf-inference";

const SIMILARITY_URL = `https://router.huggingface.co/hf-inference/models/${HF_EMBED_MODEL}/pipeline/sentence-similarity`;
const CHAT_URL = "https://router.huggingface.co/v1/chat/completions";

export type RankerName = "huggingface" | "grok" | "both";

type HfFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Which statement ids to mark. An id from a language model is kept only when
 * the encoder also ranked it in the top three. If they share none, the single
 * nearest statement is kept and the model's ids are dropped.
 */
export function chooseHighlightIds(input: {
  claimIds: readonly string[];
  embedScores: readonly number[] | null;
  llmIds: readonly string[] | null;
}): { ids: string[]; source: "huggingface" | "llm" | "both" } | null {
  const embedTop = topSimilar(input.claimIds, input.embedScores, 3);
  const llm = rulesOrder(input.claimIds, input.llmIds);
  if (embedTop && llm) {
    const near = new Set(embedTop);
    const both = llm.filter((id) => near.has(id));
    if (both.length > 0) return { ids: both, source: "both" };
    return { ids: embedTop.slice(0, 1), source: "huggingface" };
  }
  if (embedTop) return { ids: embedTop.slice(0, 1), source: "huggingface" };
  if (llm) return { ids: llm, source: "llm" };
  return null;
}

/** Highest scores first. Ties keep rules order. Non-finite scores are dropped. */
export function topSimilar(
  ids: readonly string[],
  scores: readonly number[] | null,
  k: number,
): string[] | null {
  if (!scores || scores.length !== ids.length || k < 1) return null;
  const ranked = ids
    .map((id, index) => ({ id, score: scores[index] ?? Number.NaN, index }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (ranked.length === 0) return null;
  return ranked.slice(0, k).map((row) => row.id);
}

function rulesOrder(
  claimIds: readonly string[],
  llmIds: readonly string[] | null,
): string[] | null {
  if (!llmIds || llmIds.length === 0) return null;
  const wanted = new Set(llmIds);
  const ids = claimIds.filter((id) => wanted.has(id)).slice(0, 3);
  return ids.length > 0 ? ids : null;
}

function claimSentence(claim: BriefClaim): string {
  return claim.text.replace(/\s+/g, " ").trim().slice(0, 800);
}

/**
 * Neural similarity, then a Hugging Face chat model that may only name ids.
 * Returns null when there is no token, the encoder fails, or the response is
 * not a score per statement. Chat failure leaves the scores and no llm ids.
 */
export async function rankClaimsWithHuggingFace(
  question: string,
  claims: readonly BriefClaim[],
  fetchImpl: HfFetch = fetch,
): Promise<{ scores: number[]; llmIds: string[] | null } | null> {
  const token = process.env.HF_TOKEN?.trim();
  if (!token || claims.length === 0) return null;
  const scores = await sentenceScores(token, question, claims, fetchImpl);
  if (!scores) return null;
  const llmIds = await chatSelection(token, question, claims, fetchImpl);
  return { scores, llmIds };
}

async function sentenceScores(
  token: string,
  question: string,
  claims: readonly BriefClaim[],
  fetchImpl: HfFetch,
): Promise<number[] | null> {
  try {
    const response = await fetchImpl(SIMILARITY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {
          source_sentence: question.slice(0, 800),
          sentences: claims.map(claimSentence),
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length !== claims.length) return null;
    if (!body.every((score) => typeof score === "number" && Number.isFinite(score))) return null;
    return body;
  } catch (error) {
    console.error("[voyager] Hugging Face similarity failed", error);
    return null;
  }
}

async function chatSelection(
  token: string,
  question: string,
  claims: readonly BriefClaim[],
  fetchImpl: HfFetch,
): Promise<string[] | null> {
  try {
    const response = await fetchImpl(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_CHAT_MODEL,
        max_tokens: 200,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              'Select up to three complete statements most relevant to the question. Return only JSON: {"version":1,"highlightIds":["move-0"]}. Use only ids in claims. Never write prose, figures, instructions, or case names.',
          },
          {
            role: "user",
            content: JSON.stringify({
              question: question.slice(0, 800),
              claims: claims.map((claim) => ({ id: claim.id, text: claimSentence(claim) })),
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const text = chatText(body);
    if (!text) return null;
    return parseBriefSelection(text, claims);
  } catch (error) {
    console.error("[voyager] Hugging Face selection failed", error);
    return null;
  }
}

function chatText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}
