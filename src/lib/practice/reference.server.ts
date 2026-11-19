import type { PracticeFunction, PracticeSection, PracticeSearchResult } from "./reference.types";

const knowledgeFiles = import.meta.glob<string>("/knowledge/practice/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const generatedApparatusSectionIds = new Set([2, 91, 92, 99]);

function readFiles() {
  return Object.entries(knowledgeFiles)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, text]) => ({ path, text }));
}

export function readPracticeKnowledgeFromDisk() {
  return readFiles()
    .map(({ text }) => text)
    .join("\n");
}

function referenceText() {
  const reference = readFiles().find(({ path }) =>
    path.endsWith("/knowledge/practice/practice-desk-reference.md"),
  );
  if (!reference) throw new Error("Practice desk reference is missing.");
  return reference.text;
}

function plainText(markdown: string, preserveSourceKeys = false) {
  const text = markdown
    .replace(/^<!--[\s\S]*?-->\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/{{index:[^}]+}}/g, "")
    .replace(/^\*\*(?:Rule|Elements|Test \/ steps|Open)\.\*\*\s*/gm, "")
    .replace(/^\*\*Examples\.\*\*\s*/gm, "")
    .replace(/^Last verified:\s*\d{4}-\d{2}-\d{2}\s*$/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return preserveSourceKeys
    ? text
    : text
        .replace(/\s*\[S\d+(?:\s+at [^\]]+)?\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function headingSections(markdown: string) {
  const headings = [...markdown.matchAll(/^## \[(\d+)\] (.+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index! + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    return {
      id: Number(heading[1]),
      title: heading[2].trim(),
      body: markdown.slice(start, end).trim(),
    };
  });
}

export function listPracticeFunctionsFromDisk(): PracticeFunction[] {
  return headingSections(referenceText())
    .filter(({ id }) => id >= 10 && id <= 26)
    .map(({ id, title, body }) => {
      const fields: PracticeFunction = {
        id,
        title,
        risks: [],
        sops: [],
        controls: [],
        metrics: [],
      };
      const subsections = [
        ...body.matchAll(/^### \[\d+\.\d+\] (Risks|SOPs|Controls|Metrics) — ([^\n]+)$/gm),
      ];
      for (const [index, subsection] of subsections.entries()) {
        const category = subsection[1].toLowerCase() as "risks" | "sops" | "controls" | "metrics";
        const start = subsection.index! + subsection[0].length;
        const end = subsections[index + 1]?.index ?? body.length;
        fields[category].push(plainText(`${subsection[2]}. ${body.slice(start, end)}`));
      }
      return fields;
    });
}

export function listPracticeSectionsFromDisk(): PracticeSection[] {
  return headingSections(referenceText())
    .filter(({ id }) => !generatedApparatusSectionIds.has(id))
    .map(({ id, title, body }) => ({
      id,
      title,
      text: plainText(body, id === 90),
    }));
}

export function searchPracticeReferenceFromDisk(query: string): PracticeSearchResult[] {
  const normalizedQuery = query.toLocaleLowerCase("en-US").trim().replace(/\s+/g, " ");
  const rawTerms = normalizedQuery.split(" ").filter(Boolean);
  if (!rawTerms.length) return [];
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "or",
    "the",
    "of",
    "to",
    "in",
    "for",
    "on",
    "with",
    "by",
    "at",
    "is",
    "are",
  ]);
  const terms = rawTerms.filter((term) => !stopwords.has(term));
  const searchTerms = terms.length ? terms : rawTerms;
  return listPracticeSectionsFromDisk()
    .map((section) => {
      const normalizedTitle = section.title.toLocaleLowerCase("en-US");
      const content = `${section.title} ${section.text}`;
      const normalized = content.toLocaleLowerCase("en-US");
      const normalizedBody = section.text.toLocaleLowerCase("en-US");
      const titlePhraseMatch = normalizedTitle.includes(normalizedQuery);
      const bodyPhraseMatch = normalizedBody.includes(normalizedQuery);
      const allTermsInTitle = searchTerms.every((term) => normalizedTitle.includes(term));
      const matches = searchTerms.filter((term) => normalized.includes(term)).length;
      const phraseStart = normalizedBody.indexOf(normalizedQuery);
      const firstMatchingTerm = searchTerms.find((term) => normalizedBody.includes(term));
      const start =
        phraseStart >= 0
          ? phraseStart
          : firstMatchingTerm
            ? normalizedBody.indexOf(firstMatchingTerm)
            : -1;
      const excerpt =
        start < 0
          ? section.text.slice(0, 240)
          : section.text.slice(Math.max(0, start - 80), Math.min(section.text.length, start + 180));
      return {
        id: section.id,
        title: section.title,
        excerpt,
        titlePhraseMatch,
        bodyPhraseMatch,
        allTermsInTitle,
        matches,
      };
    })
    .filter((result) => result.matches > 0)
    .sort(
      (left, right) =>
        Number(right.titlePhraseMatch) - Number(left.titlePhraseMatch) ||
        Number(right.bodyPhraseMatch) - Number(left.bodyPhraseMatch) ||
        Number(right.allTermsInTitle) - Number(left.allTermsInTitle) ||
        right.matches - left.matches ||
        left.id - right.id,
    )
    .slice(0, 12)
    .map(({ id, title, excerpt }) => ({ id, title, excerpt }));
}
