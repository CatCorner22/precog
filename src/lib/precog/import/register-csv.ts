/**
 * Continuity register as a spreadsheet: one row per duty/task/know-how item,
 * one column per active team member holding that person's level
 * (expert / can do / learning / aware, or blank). This is the same grid the
 * planner shows, so owners can fill it in Excel and import it back.
 */
import type { IndustryTemplate } from "../templates/types";
import type {
  Criticality,
  KnowledgeItem,
  KnowledgeKind,
  KnowledgeLevel,
  KnowledgeRelation,
  Person,
} from "../types";
import { isCalendarDate, localDateKey } from "../dates";
import {
  csvCell,
  DOCUMENTED_WORDS,
  normalizeHeader,
  parseRows,
  readYesNo,
  rowCapMessage,
  sniffDelimiter,
  type ImportIssue,
} from "./csv";
import { nameKey, slug, stripInvisibleControls, verb } from "../text";
import { defaultCategory } from "../continuity/knowledge-category";

interface RegisterImportResult {
  knowledge: KnowledgeItem[];
  relations: KnowledgeRelation[];
  issues: ImportIssue[];
  /** Rows the importer skipped because their item was already taken by an earlier row. */
  unmatched: { row: number; name: string }[];
}

const REGISTER_CSV_COLUMNS = [
  "item",
  "kind",
  "criticality",
  "documented",
  "procedure location",
  "last confirmed",
  "description",
] as const;

/**
 * The item's id, written after the people columns so the grid still reads
 * left to right. It tells apart items whose names differ only in
 * punctuation or case; files without it match by name.
 */
const ID_COLUMN = "precog id";
const ID_ALIASES = [ID_COLUMN, "item id"];

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
  "last confirmed": ["last confirmed", "confirmed", "confirmed on", "last checked"],
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

/** Level cells that mean the person does not hold the item. */
const NO_LEVEL = new Set(["", "-", "–", "—", "none", "no", "n", "0", "n/a", "na"]);

const LEVEL_CELL: Record<KnowledgeLevel, string> = {
  expert: "expert",
  proficient: "can do",
  basic: "learning",
  aware: "aware",
};

export function parseRegisterCsv(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: string } = {},
): RegisterImportResult {
  const today = opts.today ?? localDateKey(new Date());
  const rows = parseRows(stripInvisibleControls(text), sniffDelimiter(text));
  const issues: ImportIssue[] = [];
  const header = rows[0] ?? [];
  const columns = new Map<(typeof REGISTER_CSV_COLUMNS)[number], number>();
  for (const key of REGISTER_CSV_COLUMNS) {
    const index = header.findIndex((cell) =>
      HEADER_ALIASES[key].some((alias) => normalizeHeader(alias) === normalizeHeader(cell)),
    );
    if (index >= 0) columns.set(key, index);
  }
  const itemColumn = columns.get("item");
  if (itemColumn === undefined) {
    return {
      knowledge: [],
      relations: [],
      issues: [{ row: 0, message: "Missing an item column (duty, task or know-how name)" }],
      unmatched: [],
    };
  }
  const idColumn = header.findIndex((cell) =>
    ID_ALIASES.some((alias) => normalizeHeader(alias) === normalizeHeader(cell)),
  );

  const fixedColumns = new Set(columns.values());
  if (idColumn >= 0) fixedColumns.add(idColumn);
  const activePeople = tpl.people.filter((p) => p.active);
  const personColumns: { index: number; person: Person }[] = [];
  const unknownPeople: string[] = [];
  header.forEach((cell, index) => {
    if (fixedColumns.has(index)) return;
    const heading = cell.trim();
    if (!heading) return;
    // Namesakes get one column each, in team order (the order registerToCsv
    // writes them): the Nth column with a name is the Nth person with it.
    const named = activePeople.filter((p) => nameKey(p.name) === nameKey(heading));
    const person = named.find((p) => !personColumns.some((c) => c.person.id === p.id));
    if (person) {
      personColumns.push({ index, person });
      if (named.length > 1 && person === named[0]) {
        issues.push({
          row: 0,
          message: `${named.length} people on the active team are named ${person.name}; the importer read their columns in the order the team lists them`,
        });
      }
    } else if (named.length) {
      issues.push({
        row: 0,
        message: `Two columns name ${named[0].name}; the importer read the first`,
      });
    } else {
      unknownPeople.push(heading);
    }
  });
  if (unknownPeople.length) {
    issues.push({
      row: 0,
      message: `${verb(unknownPeople.length, "This column names someone", "These columns name people")} not on the active team, so the importer skipped ${verb(unknownPeople.length, "it", "them")}: ${unknownPeople.join(", ")}`,
    });
  }

  const maxRows =
    opts.maxRows === undefined ? 500 : Math.max(0, Math.floor(Number(opts.maxRows) || 0));
  const dataRows = rows.slice(1);
  const rowsToImport = dataRows.slice(0, maxRows);
  if (dataRows.length > maxRows) {
    issues.push({ row: maxRows + 1, message: rowCapMessage(maxRows, dataRows.length - maxRows) });
  }

  // A row takes the item its id names, else the first item in register
  // order with its name that no other row took. Ids go first, so a row
  // without one cannot take an item a later row names by id.
  const existingById = new Map(tpl.knowledge.map((k) => [k.id, k]));
  const existingByName = new Map<string, KnowledgeItem[]>();
  for (const k of tpl.knowledge) {
    const key = nameKey(k.name);
    existingByName.set(key, [...(existingByName.get(key) ?? []), k]);
  }
  const taken = new Set<string>();
  const rowExisting = new Map<number, KnowledgeItem>();
  rowsToImport.forEach((cells, index) => {
    const id = idColumn >= 0 ? (cells[idColumn] ?? "").trim() : "";
    const item = existingById.get(id);
    if (item && !taken.has(item.id) && (cells[itemColumn] ?? "").trim()) {
      taken.add(item.id);
      rowExisting.set(index, item);
    }
  });
  rowsToImport.forEach((cells, index) => {
    const name = (cells[itemColumn] ?? "").trim();
    if (!name || rowExisting.has(index)) return;
    const item = existingByName.get(nameKey(name))?.find((k) => !taken.has(k.id));
    if (item) {
      taken.add(item.id);
      rowExisting.set(index, item);
    }
  });

  // New items never take an id the register already uses.
  const usedIds = new Set(tpl.knowledge.map((k) => k.id));
  const seenNames = new Set<string>();
  const knowledge: KnowledgeItem[] = [];
  const relations: KnowledgeRelation[] = [];
  const unmatched: RegisterImportResult["unmatched"] = [];
  const cell = (cells: string[], key: (typeof REGISTER_CSV_COLUMNS)[number]) => {
    const index = columns.get(key);
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };

  rowsToImport.forEach((cells, index) => {
    const rowNumber = index + 1;
    const name = (cells[itemColumn] ?? "").trim();
    if (!name) {
      issues.push({ row: rowNumber, message: "Each row must have an item name" });
      return;
    }
    const itemKey = nameKey(name);
    const existing = rowExisting.get(index);
    if (!existing && seenNames.has(itemKey)) {
      issues.push({
        row: rowNumber,
        message: `"${name}" appears twice; the importer skipped the second row`,
      });
      unmatched.push({ row: rowNumber, name });
      return;
    }
    seenNames.add(itemKey);

    const kindValue = cell(cells, "kind");
    let kind: KnowledgeKind = existing?.kind ?? "duty";
    if (kindValue) {
      const parsed = KIND_ALIASES[nameKey(kindValue)];
      if (parsed) kind = parsed;
      else issues.push({ row: rowNumber, message: `Unknown kind "${kindValue}"; using ${kind}` });
    }
    const criticalityValue = cell(cells, "criticality");
    let criticality: Criticality = existing?.criticality ?? "important";
    if (criticalityValue) {
      const parsed = CRITICALITY_ALIASES[nameKey(criticalityValue)];
      if (parsed) criticality = parsed;
      else
        issues.push({
          row: rowNumber,
          message: `Unknown criticality "${criticalityValue}"; using ${criticality}`,
        });
    }
    const documentedValue = cell(cells, "documented");
    let documented = Boolean(existing?.documented);
    if (documentedValue) {
      const read = readYesNo(documentedValue, DOCUMENTED_WORDS);
      if (read === undefined) {
        issues.push({
          row: rowNumber,
          message: `Documented "${documentedValue}" must be yes or no; kept ${documented ? "yes" : "no"}`,
        });
      } else documented = read;
    }
    const procedureLocation = columns.has("procedure location")
      ? cell(cells, "procedure location").slice(0, 200)
      : (existing?.procedureLocation ?? "");
    // A blank or unreadable date keeps the confirmation on record; only an
    // unreadable one is reported.
    const confirmedValue = cell(cells, "last confirmed");
    let confirmedAt = existing?.confirmedAt;
    if (isCalendarDate(confirmedValue, today)) confirmedAt = confirmedValue;
    else if (confirmedValue) {
      issues.push({
        row: rowNumber,
        message: isCalendarDate(confirmedValue)
          ? `Last confirmed ${confirmedValue} is after today; Precog kept the date on record`
          : `Last confirmed "${confirmedValue}" is not a date; write it as YYYY-MM-DD`,
      });
    }
    const description = columns.has("description")
      ? cell(cells, "description").slice(0, 500)
      : (existing?.description ?? "");

    let id = existing?.id ?? `k-${slug(name) || "item"}`;
    if (!existing) {
      const baseId = id;
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
      usedIds.add(id);
    }

    knowledge.push({
      id,
      name: name.slice(0, 80),
      kind,
      criticality,
      category: existing?.category ?? defaultCategory(kind),
      description,
      linkedProcessIds: existing?.linkedProcessIds ?? [],
      documented,
      ...(procedureLocation ? { procedureLocation } : {}),
      ...(confirmedAt ? { confirmedAt } : {}),
    });

    for (const { index: col, person } of personColumns) {
      const raw = (cells[col] ?? "").trim();
      if (NO_LEVEL.has(raw.toLowerCase())) continue;
      const level = LEVEL_ALIASES[nameKey(raw)];
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

  return { knowledge, relations, issues, unmatched };
}

export function registerToCsv(tpl: IndustryTemplate): string {
  const people = tpl.people.filter((p) => p.active);
  const levelOf = new Map(tpl.relations.map((r) => [`${r.personId}|${r.knowledgeId}`, r.level]));
  const header = [...REGISTER_CSV_COLUMNS, ...people.map((p) => p.name), ID_COLUMN];
  const rows = tpl.knowledge.map((k) => [
    k.name,
    k.kind ?? "knowledge",
    k.criticality,
    k.documented ? "true" : "false",
    k.procedureLocation ?? "",
    k.confirmedAt && isCalendarDate(k.confirmedAt) ? k.confirmedAt : "",
    k.description,
    ...people.map((p) => {
      const level = levelOf.get(`${p.id}|${k.id}`);
      return level ? LEVEL_CELL[level] : "";
    }),
    k.id,
  ]);
  return `${[header, ...rows].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

interface RegisterContents {
  knowledge: readonly KnowledgeItem[];
  relations: readonly KnowledgeRelation[];
}

/**
 * The register after an import that replaces only the items the file names:
 * those items and their marks come from the file, every other item keeps
 * its place and its marks, and new items go on the end.
 */
export function mergeRegisterImport(
  register: RegisterContents,
  file: RegisterContents,
): { knowledge: KnowledgeItem[]; relations: KnowledgeRelation[] } {
  const fromFile = new Map(file.knowledge.map((k) => [k.id, k]));
  const current = new Set(register.knowledge.map((k) => k.id));
  return {
    knowledge: [
      ...register.knowledge.map((k) => fromFile.get(k.id) ?? k),
      ...file.knowledge.filter((k) => !current.has(k.id)),
    ],
    relations: [
      ...register.relations.filter((r) => !fromFile.has(r.knowledgeId)),
      ...file.relations,
    ],
  };
}

/** The import note for rows the importer skipped, or null when there are none. */
export function unmatchedRowsMessage(unmatched: RegisterImportResult["unmatched"]): string | null {
  if (!unmatched.length) return null;
  return `Precog could not match ${unmatched.length} ${unmatched.length === 1 ? "row" : "rows"} to items in your register: ${unmatched.map((u) => u.name).join(", ")}. It changed nothing for them.`;
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
    "",
    "Who can do it: expert, can do, learning, aware, or leave blank",
    ...people.map((_, i) => (i === 0 ? "expert" : i === 1 ? "learning" : "")),
  ];
  return `${[header, example].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
