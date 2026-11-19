export interface ComplianceCard {
  id: string;
  title: string;
  section: string;
  status: string;
  citation: string;
  last_verified: string;
  source_url: string;
  body: string;
  review_days: number | null;
}

export interface ComplianceCardResult extends Pick<
  ComplianceCard,
  "id" | "title" | "section" | "status" | "citation" | "last_verified" | "source_url"
> {
  body: string;
  excerpt: string;
  stale: boolean;
}

type FrontMatterValue = string | string[];

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontMatter(markdown: string): {
  fields: Record<string, FrontMatterValue>;
  body: string;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) throw new Error("Compliance card has no front matter.");

  const fields: Record<string, FrontMatterValue> = {};
  let listKey: string | undefined;
  for (const line of match[1].split(/\r?\n/)) {
    const listItem = line.match(/^\s*-\s*(.*)$/);
    if (listItem && listKey) {
      const existing = fields[listKey];
      if (Array.isArray(existing)) existing.push(unquote(listItem[1]));
      continue;
    }

    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!value) {
      fields[key] = [];
      listKey = key;
    } else {
      fields[key] = unquote(value);
      listKey = undefined;
    }
  }

  return { fields, body: markdown.slice(match[0].length).trim() };
}

function field(fields: Record<string, FrontMatterValue>, key: string) {
  const value = fields[key];
  return typeof value === "string" ? value : "";
}

function fieldList(fields: Record<string, FrontMatterValue>, key: string) {
  const value = fields[key];
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function parseComplianceCard(markdown: string, section: string): ComplianceCard {
  const { fields, body } = parseFrontMatter(markdown);
  const id = field(fields, "id");
  const title = field(fields, "title");
  if (!id || !title) throw new Error("Compliance card needs an id and title.");
  const sources = fieldList(fields, "sources");
  const sourceUrl =
    field(fields, "source_url") ||
    sources.map((source) => source.match(/https?:\/\/[^\s)]+/)?.[0]).find(Boolean) ||
    "";

  return {
    id,
    title,
    section,
    status: field(fields, "status") || "not_verified",
    citation: fieldList(fields, "citations").join("; "),
    last_verified: field(fields, "last_verified"),
    source_url: sourceUrl,
    body,
    review_days: Number.parseInt(field(fields, "review_days"), 10) || null,
  };
}

function tokens(text: string) {
  return text.toLocaleLowerCase("en-US").match(/[a-z0-9]+/g) ?? [];
}

function count(tokensToCount: string[]) {
  const result = new Map<string, number>();
  for (const token of tokensToCount) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}

function excerpt(body: string) {
  const plain = body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 320 ? `${plain.slice(0, 317).trimEnd()}…` : plain;
}

function plainText(markdown: string) {
  return markdown
    .replace(/^<!--[\s\S]*?-->\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isStale(card: ComplianceCard, now: Date) {
  if (card.status !== "verified" || !card.review_days || !card.last_verified) return false;
  const verifiedAt = Date.parse(card.last_verified);
  return Number.isFinite(verifiedAt) && now.getTime() - verifiedAt > card.review_days * 86_400_000;
}

export function searchComplianceCards(
  query: string,
  cards: ComplianceCard[],
  options: { section?: string; now?: Date; limit?: number } = {},
): ComplianceCardResult[] {
  const queryTokens = [...new Set(tokens(query))];
  if (queryTokens.length === 0) return [];

  const candidates = cards.filter((card) => !options.section || card.section === options.section);
  if (candidates.length === 0) return [];

  const documents = candidates.map((card) => {
    const title = count(tokens(card.title));
    const citation = count(tokens(card.citation));
    const body = count(tokens(card.body));
    const all = count(tokens(`${card.title} ${card.citation} ${card.body}`));
    return { card, title, citation, body, all, length: tokens(card.body).length };
  });
  const averageLength =
    documents.reduce((total, document) => total + document.length, 0) / documents.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const token of new Set(document.all.keys())) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const now = options.now ?? new Date();
  const ranked = documents.map((document) => {
    let score = 0;
    for (const token of queryTokens) {
      const frequency =
        (document.title.get(token) ?? 0) * 3 +
        (document.citation.get(token) ?? 0) * 2 +
        (document.body.get(token) ?? 0);
      if (!frequency) continue;
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      score +=
        (idf * frequency * 2.2) /
        (frequency + 1.2 * (0.25 + 0.75 * (document.length / averageLength)));
    }
    return {
      score,
      result: {
        id: document.card.id,
        title: document.card.title,
        section: document.card.section,
        status: document.card.status,
        citation: document.card.citation,
        last_verified: document.card.last_verified,
        source_url: document.card.source_url,
        body: plainText(document.card.body),
        excerpt: excerpt(document.card.body),
        stale: isStale(document.card, now),
      },
    };
  });

  return ranked
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title))
    .slice(0, options.limit ?? 10)
    .map(({ result }) => result);
}
