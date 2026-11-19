import type { LicenseBlock, LicenseReference, LicenseSource } from "./types";

export type { LicenseBlock, LicenseReference, LicenseSource } from "./types";

const knowledgeFiles = import.meta.glob<string>("/knowledge/licenses/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const fileOrder = [
  ["dentist.md", "Dentist"],
  ["dentist-sedation-permits.md", "Sedation permits"],
  ["dental-hygienist.md", "Hygienist"],
  ["dental-assistant-registered.md", "Registered assistant"],
  ["dental-assistant-practical.md", "Practical assistant"],
  ["treatments.md", "Who may do it"],
] as const;

function parseFrontMatter(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error("A license reference is missing its front matter.");

  const values: Record<string, string | string[]> = {};
  let listField: string | null = null;
  for (const line of match[1].split(/\r?\n/)) {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && listField === "sources") {
      (values.sources as string[]).push(listItem[1].trim());
      continue;
    }

    const field = line.match(/^([\w-]+):\s*(.*)$/);
    if (!field) continue;
    listField = null;
    if (field[1] === "sources" && !field[2].trim()) {
      values.sources = [];
      listField = "sources";
    } else {
      values[field[1]] = field[2].trim();
    }
  }

  return {
    values,
    body: markdown.slice(match[0].length),
  };
}

function parseSource(source: string): LicenseSource {
  const match = source.match(/https?:\/\/[^\s)]+/);
  if (!match) throw new Error(`A license source is missing a URL: ${source}`);
  const url = match[0];
  const suffix = source.slice((match.index ?? 0) + url.length).trim();
  const label = suffix.replace(/^\((.*)\)$/, "$1") || url;
  return { url, label };
}

function pipeCells(line: string) {
  let normalized = line.trim();
  if (normalized.startsWith("||")) normalized = normalized.slice(1);
  if (normalized.startsWith("|")) normalized = normalized.slice(1);
  if (normalized.endsWith("|")) normalized = normalized.slice(0, -1);
  return normalized.split("|").map((cell) => cell.trim());
}

function isPipeRow(line: string | undefined): line is string {
  return Boolean(line && line.trim().startsWith("|") && line.trim().endsWith("|"));
}

function isTableStart(lines: string[], index: number) {
  return (
    isPipeRow(lines[index]) &&
    isPipeRow(lines[index + 1]) &&
    pipeCells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index]?.trim() ?? "";
  return (
    /^#{1,6}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*+]\s+/.test(line) ||
    /^\d+[.)]\s+/.test(line) ||
    isTableStart(lines, index)
  );
}

function parseBlocks(markdown: string): LicenseBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: LicenseBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = pipeCells(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (isPipeRow(lines[index])) {
        rows.push(pipeCells(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const listItem = line.match(/^([-*+]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      const ordered = /^\d/.test(listItem[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^([-*+]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2]);
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quote.join(" ") });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

export function listLicenseReferencesFromDisk(): LicenseReference[] {
  const files = new Map(
    Object.entries(knowledgeFiles).map(([path, markdown]) => [
      path.slice(path.lastIndexOf("/") + 1),
      markdown,
    ]),
  );
  const references = fileOrder.map(([filename, tabLabel]) => {
    const markdown = files.get(filename);
    if (!markdown) throw new Error(`License reference ${filename} is missing.`);
    const { values, body } = parseFrontMatter(markdown);
    const title = values.title;
    const status = values.status;
    const lastVerified = values.last_verified;
    const reviewDays = Number(values.review_days);
    if (
      typeof title !== "string" ||
      typeof status !== "string" ||
      typeof lastVerified !== "string" ||
      !Number.isFinite(reviewDays)
    ) {
      throw new Error(`License reference ${filename} has incomplete metadata.`);
    }
    const rawSources = Array.isArray(values.sources) ? values.sources : [];
    return {
      id: filename.replace(/\.md$/, ""),
      tabLabel,
      ...(typeof values.license === "string" ? { license: values.license } : {}),
      title,
      status,
      last_verified: lastVerified,
      review_days: reviewDays,
      sources: rawSources.map(parseSource),
      blocks: parseBlocks(body),
    };
  });

  const sharedSourcesByUrl = new Map<string, LicenseSource>();
  for (const source of references.flatMap((reference) => reference.sources)) {
    if (!sharedSourcesByUrl.has(source.url)) sharedSourcesByUrl.set(source.url, source);
  }
  const sharedSources = [...sharedSourcesByUrl.values()];
  return references.map((reference) => ({
    ...reference,
    sources: reference.sources.length ? reference.sources : sharedSources,
  }));
}
