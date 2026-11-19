import type { PracticeFunction, PracticeSection, PracticeSearchResult } from "./reference.types";

const knowledgeFiles = import.meta.glob<string>("/knowledge/practice/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

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

function plainText(markdown: string) {
  return markdown
    .replace(/^<!--[\s\S]*?-->\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/{{index:[^}]+}}/g, "")
    .replace(/^\*\*(?:Rule|Elements|Test \/ steps|Open)\.\*\*\s*/gm, "")
    .replace(/^\*\*Examples\.\*\*\s*/gm, "")
    .replace(/^Last verified:\s*\d{4}-\d{2}-\d{2}\s*$/gm, "")
    .replace(/\s*\[S\d+(?:\s+at [^\]]+)?\]/g, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\[[^\]]+\]\([^)]*\)/g, "")
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
  return headingSections(referenceText()).map(({ id, title, body }) => ({
    id,
    title,
    text: plainText(body),
  }));
}

export function searchPracticeReferenceFromDisk(query: string): PracticeSearchResult[] {
  const normalizedQuery = query.toLocaleLowerCase("en-US").trim().replace(/\s+/g, " ");
  const terms = normalizedQuery.split(" ").filter(Boolean);
  if (!terms.length) return [];
  return listPracticeSectionsFromDisk()
    .map((section) => {
      const content = `${section.title} ${section.text}`;
      const normalized = content.toLocaleLowerCase("en-US");
      const matches = terms.filter((term) => normalized.includes(term)).length;
      const normalizedBody = section.text.toLocaleLowerCase("en-US");
      const phraseStart = normalizedBody.indexOf(normalizedQuery);
      const firstMatchingTerm = terms.find((term) => normalizedBody.includes(term));
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
      return { id: section.id, title: section.title, excerpt, matches };
    })
    .filter((result) => result.matches > 0)
    .sort((left, right) => right.matches - left.matches || left.id - right.id)
    .slice(0, 12)
    .map(({ id, title, excerpt }) => ({ id, title, excerpt }));
}
