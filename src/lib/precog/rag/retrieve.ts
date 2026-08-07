/**
 * Lightweight TF-IDF retrieval over the curated corpus.
 * No external embedding API required — works offline and in SSR.
 */
import { KNOWLEDGE_CORPUS, type KnowledgeChunk } from "./corpus";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const STOP = new Set([
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

const DOC_TOKENS = KNOWLEDGE_CORPUS.map((c) =>
  meaningful(tokenize(`${c.title} ${c.tags.join(" ")} ${c.text}`)),
);
const IDF = idfMap(DOC_TOKENS);
const DOC_VECS = DOC_TOKENS.map((toks) => tfidfVec(toks, IDF));

export interface RetrievalHit {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
}

export function retrieveKnowledge(
  query: string,
  opts: { topK?: number; domain?: KnowledgeChunk["domain"] } = {},
): RetrievalHit[] {
  const topK = opts.topK ?? 4;
  const qVec = tfidfVec(meaningful(tokenize(query)), IDF);

  const scored = KNOWLEDGE_CORPUS.map((chunk, i) => {
    if (opts.domain && chunk.domain !== opts.domain) {
      return { chunk, score: -1, rank: 0 };
    }
    let score = cosine(qVec, DOC_VECS[i]);
    // Boost exact tag hits
    const q = query.toLowerCase();
    for (const tag of chunk.tags) {
      if (q.includes(tag.toLowerCase())) score += 0.08;
    }
    return { chunk, score, rank: 0 };
  })
    .filter((h) => h.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((h, idx) => ({ ...h, rank: idx + 1 }));

  return scored;
}

export function formatRetrievalForPrompt(hits: RetrievalHit[]): string {
  if (hits.length === 0) return "No corpus hits.";
  return hits
    .map(
      (h) =>
        `[${h.chunk.id} · score ${h.score.toFixed(3)} · ${h.chunk.domain}] ${h.chunk.title}: ${h.chunk.text}`,
    )
    .join("\n\n");
}
