/**
 * Lightweight TF-IDF retrieval over the curated corpus.
 * No external embedding API required — works offline and in SSR.
 */
import { KNOWLEDGE_CORPUS, type KnowledgeChunk } from "./corpus";
import type { IndustryId } from "../industry";

interface RetrievalHit {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
}

/**
 * The chunks that best match a query. A chunk is only returned when at least
 * one of the query's words appears in it; the tag and industry boosts then
 * order those, and never admit a chunk on their own.
 */
export function retrieveKnowledge(
  query: string,
  opts: { topK?: number; domain?: KnowledgeChunk["domain"]; industry?: IndustryId } = {},
): RetrievalHit[] {
  const topK = opts.topK ?? 4;
  const queryTokens = meaningful(tokenize(query));
  const queryWords = new Set(queryTokens);
  const qVec = tfidfVec(queryTokens, IDF);
  const industry = opts.industry;

  return KNOWLEDGE_CORPUS.flatMap((chunk, i) => {
    if (opts.domain && chunk.domain !== opts.domain) return [];
    // A chunk written for one vertical is only ever served to that vertical;
    // a retail owner never reads dental guidance. Chunks for every vertical
    // (industry: "general", or untagged) are always eligible.
    const ownVertical = Boolean(industry && chunk.industry && chunk.industry !== "general");
    if (ownVertical && chunk.industry !== industry) return [];
    const overlap = cosine(qVec, DOC_VECS[i]);
    if (overlap <= 0) return [];
    // Ranking heuristics, not measured quantities: a tag whose every word is a
    // whole word of the query, and a chunk written for the caller's vertical.
    const tagHits = chunk.tags.filter((tag) => {
      const words = meaningful(tokenize(tag));
      return words.length > 0 && words.every((word) => queryWords.has(word));
    }).length;
    return [{ chunk, score: overlap + 0.08 * tagHits + (ownVertical ? 0.12 : 0), rank: 0 }];
  })
    .filter((h) => h.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((h, idx) => ({ ...h, rank: idx + 1 }));
}

/** Words of two letters or more; two-letter abbreviations (AP, AR, PO, AI) count, and the stop list drops the rest. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function meaningful(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP.has(t));
}

function idfMap(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  const N = docs.length;
  for (const doc of docs) {
    const uniq = new Set(doc);
    for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, d] of df) {
    idf.set(t, Math.log((N + 1) / (d + 1)) + 1);
  }
  return idf;
}

function tfidfVec(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const vec = new Map<string, number>();
  const len = tokens.length || 1;
  for (const [t, c] of tf) {
    vec.set(t, (c / len) * (idf.get(t) ?? 0));
  }
  return vec;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    if (b.has(k)) dot += v * (b.get(k) ?? 0);
  }
  for (const [, v] of b) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const STOP = new Set([
  "a",
  "an",
  "as",
  "at",
  "be",
  "by",
  "do",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "no",
  "of",
  "on",
  "or",
  "so",
  "to",
  "up",
  "us",
  "we",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "are",
  "was",
  "were",
  "have",
  "has",
  "not",
  "but",
  "you",
  "your",
  "can",
  "all",
  "any",
  "into",
  "than",
  "then",
  "when",
  "what",
  "how",
  "who",
  "why",
  "does",
  "did",
  "may",
  "must",
  "should",
  "will",
  "also",
  "only",
  "such",
  "each",
  "other",
  "about",
  "their",
  "them",
  "they",
  "been",
  "being",
  "over",
  "under",
  "between",
]);

const DOC_TOKENS = KNOWLEDGE_CORPUS.map((c) =>
  meaningful(tokenize(`${c.title} ${c.tags.join(" ")} ${c.text}`)),
);
const IDF = idfMap(DOC_TOKENS);
const DOC_VECS = DOC_TOKENS.map((toks) => tfidfVec(toks, IDF));
