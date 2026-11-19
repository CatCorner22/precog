export interface EvidenceModule {
  id: string;
  title: string;
  markdown: string;
  headings: string[];
}

export interface StudyGrade {
  grade: string;
  rationale: string;
}

export interface BenchmarkStudy {
  title: string;
  authors: string[];
  date: string | null;
  doi: string | null;
  pmid: string | null;
  grades: {
    design: StudyGrade;
    results: StudyGrade;
    conclusions: StudyGrade;
  };
}

const moduleFiles = import.meta.glob<string>("/knowledge/evidence/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const benchmarkFiles = import.meta.glob<string>("/knowledge/evidence/benchmarks.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

let moduleCache: EvidenceModule[] | undefined;
let benchmarkCache: BenchmarkStudy[] | undefined;

function readEvidenceModules(): EvidenceModule[] {
  if (moduleCache) return moduleCache;
  moduleCache = Object.entries(moduleFiles)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, markdown]) => {
      const id = path.split("/").at(-1)!.replace(/\.md$/, "");
      const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || id;
      const headings = [...markdown.matchAll(/^#{2,6}\s+(.+?)\s*#*\s*$/gm)].map((match) =>
        match[1].trim(),
      );
      return { id, title, markdown, headings };
    });
  return moduleCache;
}

function grade(value: unknown): StudyGrade {
  if (!value || typeof value !== "object")
    return { grade: "U", rationale: "No rationale supplied." };
  const item = value as { grade?: unknown; rationale?: unknown };
  return {
    grade: typeof item.grade === "string" ? item.grade : "U",
    rationale: typeof item.rationale === "string" ? item.rationale : "No rationale supplied.",
  };
}

function readBenchmarkStudies(): BenchmarkStudy[] {
  if (benchmarkCache) return benchmarkCache;
  const raw = Object.values(benchmarkFiles)[0];
  if (!raw) throw new Error("Benchmark studies were not bundled.");
  const data = JSON.parse(raw) as {
    studies?: Array<{
      record?: {
        title?: unknown;
        authors?: unknown;
        publicationDate?: unknown;
        doi?: unknown;
        pmid?: unknown;
        grades?: { design?: unknown; results?: unknown; conclusions?: unknown };
      };
    }>;
  };
  benchmarkCache = (data.studies ?? []).flatMap(({ record }) => {
    if (!record || typeof record.title !== "string") return [];
    return [
      {
        title: record.title,
        authors: Array.isArray(record.authors)
          ? record.authors.filter((author): author is string => typeof author === "string")
          : [],
        date: typeof record.publicationDate === "string" ? record.publicationDate : null,
        doi: typeof record.doi === "string" ? record.doi : null,
        pmid: typeof record.pmid === "string" ? record.pmid : null,
        grades: {
          design: grade(record.grades?.design),
          results: grade(record.grades?.results),
          conclusions: grade(record.grades?.conclusions),
        },
      },
    ];
  });
  return benchmarkCache;
}

export function listEvidenceModulesFromBundle() {
  return readEvidenceModules().map(({ id, title, headings }) => ({ id, title, headings }));
}

export function getEvidenceModuleFromBundle(id: string) {
  return readEvidenceModules().find((module) => module.id === id) ?? null;
}

export function listBenchmarkStudiesFromBundle() {
  return readBenchmarkStudies();
}
