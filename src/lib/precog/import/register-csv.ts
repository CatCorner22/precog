import type { IndustryTemplate } from "../templates/types";
import type {
  Criticality,
  KnowledgeItem,
  KnowledgeKind,
  KnowledgeLevel,
  KnowledgeRelation,
  Person,
} from "../types";
import { parseRows } from "./csv";

/**
 * Continuity register as a spreadsheet: one row per duty/task/know-how item,
 * one column per active team member holding that person's level
 * (expert / can do / learning / aware, or blank). This is the same grid the
 * planner shows, so owners can fill it in Excel and import it back.
 */

export interface RegisterImportIssue {
  row: number;
  message: string;
}

export interface RegisterImportResult {
  knowledge: KnowledgeItem[];
  relations: KnowledgeRelation[];
  issues: RegisterImportIssue[];
  /** Column headings that matched nobody on the active team; their levels were skipped. */
  unknownPeople: string[];
}

export const REGISTER_CSV_COLUMNS = [
  "item",
  "kind",
  "criticality",
  "documented",
  "procedure location",
  "description",
] as const;

const HEADER_ALIASES: Record<(typeof REGISTER_CSV_COLUMNS)[number], readonly string[]> = {
  item: ["item", "name", "duty", "task", "duty/task", "duty or task", "knowledge", "work"],
  kind: ["kind", "type"],
  criticality: ["criticality", "critical", "importance", "priority", "impact"],
  documented: ["documented", "written procedure", "procedure", "sop", "written down"],
  "procedure location": [
    "procedure location",
    "where documented",
    "where is the procedure",
    "sop location",
    "location",
    "link",
  ],
  description: ["description", "notes", "details"],
};

const KIND_ALIASES: Record<string, KnowledgeKind> = {
  duty: "duty",
  duties: "duty",
  responsibility: "duty",
  task: "task",
  tasks: "task",
  knowledge: "knowledge",
  knowhow: "knowledge",
  know: "knowledge",
  skill: "knowledge",
};

const CRITICALITY_ALIASES: Record<string, Criticality> = {
  critical: "critical",
  businessstopswithoutit: "critical",
  stops: "critical",
  high: "critical",
  "3": "critical",
  important: "important",
  hurtswithinaweek: "important",
  medium: "important",
  "2": "important",
  nicetohave: "nice-to-have",
  canwait: "nice-to-have",
  low: "nice-to-have",
  "1": "nice-to-have",
};

const LEVEL_ALIASES: Record<string, KnowledgeLevel> = {
  expert: "expert",
  e: "expert",
  teach: "expert",
  candoitaloneandteachit: "expert",
  "4": "expert",
  proficient: "proficient",
  p: "proficient",
  cando: "proficient",
  candoitalone: "proficient",
  yes: "proficient",
  y: "proficient",
  x: "proficient",
  "3": "proficient",
  basic: "basic",
  b: "basic",
  learning: "basic",
  learner: "basic",
  candoitwithnotesorhelp: "basic",
  "2": "basic",
  aware: "aware",
  a: "aware",
  knowsitexists: "aware",
  "1": "aware",
};

const NONE_TOKENS = new Set(["", "-", "none", "no", "n", "0"]);
const TRUE_TOKENS = new Set(["true", "yes", "y", "1", "x", "documented", "written"]);

const LEVEL_CELL: Record<KnowledgeLevel, string> = {
  expert: "expert",
  proficient: "can do",
  basic: "learning",
  aware: "aware",
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function parseRegisterCsv(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number } = {},
): RegisterImportResult {
  const rows = parseRows(text);
  const issues: RegisterImportIssue[] = [];
  const header = rows[0] ?? [];
  const columns = new Map<(typeof REGISTER_CSV_COLUMNS)[number], number>();
  for (const key of REGISTER_CSV_COLUMNS) {
    const index = header.findIndex((cell) =>
      HEADER_ALIASES[key].some((alias) => normalize(alias) === normalize(cell)),
    );
    if (index >= 0) columns.set(key, index);
  }
  const itemColumn = columns.get("item");
  if (itemColumn === undefined) {
    return {
      knowledge: [],
      relations: [],
      issues: [{ row: 0, message: "Missing an item column (duty, task or know-how name)" }],
      unknownPeople: [],
    };
  }

  const fixedColumns = new Set(columns.values());
  const activePeople = tpl.people.filter((p) => p.active);
  const personColumns: { index: number; person: Person }[] = [];
  const unknownPeople: string[] = [];
  header.forEach((cell, index) => {
    if (fixedColumns.has(index)) return;
    const heading = cell.trim();
    if (!heading) return;
    const person = activePeople.find((p) => normalize(p.name) === normalize(heading));
    if (person) {
      if (personColumns.some((c) => c.person.id === person.id)) {
        issues.push({ row: 0, message: `Duplicate column for ${person.name}` });
      } else {
        personColumns.push({ index, person });
      }
    } else {
      unknownPeople.push(heading);
    }
  });
  if (unknownPeople.length) {
    issues.push({
      row: 0,
      message: `Not on the active team, skipped: ${unknownPeople.join(", ")}`,
    });
  }

  const maxRows =
    opts.maxRows === undefined ? 500 : Math.max(0, Math.floor(Number(opts.maxRows) || 0));
  const dataRows = rows.slice(1);
  const rowsToImport = dataRows.slice(0, maxRows);
  if (dataRows.length > maxRows) {
    issues.push({ row: maxRows + 1, message: `Import truncated to ${maxRows} rows` });
  }

  const existingByName = new Map(tpl.knowledge.map((k) => [normalize(k.name), k]));
  const usedIds = new Set<string>();
  const seenNames = new Set<string>();
  const knowledge: KnowledgeItem[] = [];
  const relations: KnowledgeRelation[] = [];
  const cell = (cells: string[], key: (typeof REGISTER_CSV_COLUMNS)[number]) => {
    const index = columns.get(key);
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };

  rowsToImport.forEach((cells, index) => {
    const rowNumber = index + 1;
    const name = (cells[itemColumn] ?? "").trim();
    if (!name) {
      issues.push({ row: rowNumber, message: "Item name is required" });
      return;
    }
    const nameKey = normalize(name);
    if (seenNames.has(nameKey)) {
      issues.push({ row: rowNumber, message: `Duplicate item "${name}" skipped` });
      return;
    }
    seenNames.add(nameKey);

    const existing = existingByName.get(nameKey);
    const kindValue = cell(cells, "kind");
    let kind: KnowledgeKind = existing?.kind ?? "duty";
    if (kindValue) {
      const parsed = KIND_ALIASES[normalize(kindValue)];
      if (parsed) kind = parsed;
      else issues.push({ row: rowNumber, message: `Unknown kind "${kindValue}"; using ${kind}` });
    }
    const criticalityValue = cell(cells, "criticality");
    let criticality: Criticality = existing?.criticality ?? "important";
    if (criticalityValue) {
      const parsed = CRITICALITY_ALIASES[normalize(criticalityValue)];
      if (parsed) criticality = parsed;
      else
        issues.push({
          row: rowNumber,
          message: `Unknown criticality "${criticalityValue}"; using ${criticality}`,
        });
    }
    const documentedValue = cell(cells, "documented");
    const documented = documentedValue
      ? TRUE_TOKENS.has(documentedValue.toLowerCase())
      : Boolean(existing?.documented);
    const procedureLocation = columns.has("procedure location")
      ? cell(cells, "procedure location").slice(0, 200)
      : (existing?.procedureLocation ?? "");
    const description = columns.has("description")
      ? cell(cells, "description").slice(0, 500)
      : (existing?.description ?? "");

    let id = existing?.id ?? `k-${slug(name) || "item"}`;
    const baseId = id;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);

    knowledge.push({
      id,
      name: name.slice(0, 80),
      kind,
      criticality,
      category: existing?.category ?? (kind === "knowledge" ? "tribal" : "process"),
      description,
      linkedProcessIds: existing?.linkedProcessIds ?? [],
      documented,
      ...(procedureLocation ? { procedureLocation } : {}),
    });

    for (const { index: col, person } of personColumns) {
      const raw = (cells[col] ?? "").trim();
      if (NONE_TOKENS.has(raw.toLowerCase())) continue;
      const level = LEVEL_ALIASES[normalize(raw)];
      if (!level) {
        issues.push({
          row: rowNumber,
          message: `"${raw}" is not a level for ${person.name}; use expert, can do, learning or aware`,
        });
        continue;
      }
      relations.push({ personId: person.id, knowledgeId: id, level });
    }
  });

  return { knowledge, relations, issues, unknownPeople };
}

export function registerToCsv(tpl: IndustryTemplate): string {
  const people = tpl.people.filter((p) => p.active);
  const levelOf = new Map(tpl.relations.map((r) => [`${r.personId}|${r.knowledgeId}`, r.level]));
  const header = [...REGISTER_CSV_COLUMNS, ...people.map((p) => p.name)];
  const rows = tpl.knowledge.map((k) => [
    k.name,
    k.kind ?? "knowledge",
    k.criticality,
    k.documented ? "true" : "false",
    k.procedureLocation ?? "",
    k.description,
    ...people.map((p) => {
      const level = levelOf.get(`${p.id}|${k.id}`);
      return level ? LEVEL_CELL[level] : "";
    }),
  ]);
  return `${[header, ...rows].map((cells) => cells.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

/** Empty grid with the active team as columns and one example row. */
export function registerTemplateCsv(tpl: IndustryTemplate): string {
  const people = tpl.people.filter((p) => p.active);
  const header = [...REGISTER_CSV_COLUMNS, ...people.map((p) => p.name)];
  const example = [
    "Run month-end payroll",
    "duty",
    "critical",
    "false",
    "Shared drive > Office > Payroll checklist",
    "Who can do it: expert, can do, learning, aware, or leave blank",
    ...people.map((_, i) => (i === 0 ? "expert" : i === 1 ? "learning" : "")),
  ];
  return `${[header, example].map((cells) => cells.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}
