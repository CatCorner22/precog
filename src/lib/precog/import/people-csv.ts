import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { csvCell, locateTable, parseRows, sniffDelimiter, stripInvisibleControls } from "./csv";
import { datesAreDayFirst } from "./hire-date";

export { parseHireDate, readHireDate, tenureFromHireDate, type HireDateOptions } from "./hire-date";
import { ROLE_TEMPLATES } from "../sod/role-templates";

export { splitListLine } from "./roster-lines";
import {
  looksLikeRosterHeader,
  mapColumns,
  normalizeHeader,
  type ColumnMap,
} from "./roster-columns";
import { nameKey, readPerson, type ImportContext, type TitleMapping } from "./roster-row-read";

export { looksLikeRosterHeader } from "./roster-columns";
export type { TitleMapping } from "./roster-row-read";
export interface PeopleImportIssue {
  row: number;
  message: string;
}

export interface PeopleImportResult {
  people: Person[];
  issues: PeopleImportIssue[];
  unknownEntitlements: string[];
  /** How each row's job title was read, for the review table after an import. */
  titles: TitleMapping[];
  /**
   * Current team members with no row in the file. Their ids are gone from
   * `people`, so register assignments and process ownerships pointing at them
   * will be dropped when the import is applied.
   */
  removed: Person[];
  /** Lines skipped because they were a report title, a repeated header, or a footer. */
  skipped?: number;
  /** Rows skipped because an earlier row already named the same person with the same title. */
  duplicates?: number;
  /** Rows past the row limit that were not read. */
  dropped?: number;
  /**
   * Ids of people whose status says they are on leave ("Leave", "LOA",
   * "On Leave", ADP's "L"). They stay on the team; the caller can record
   * the absence.
   */
  onLeave?: string[];
  /**
   * The person fields the file had columns for. A row that names someone
   * already on the team keeps that person's value for every other field.
   */
  supplied?: PersonField[];
}

/** The fields of a person a file can carry. */
type PersonField =
  | "role"
  | "department"
  | "tenureYears"
  | "active"
  | "lastDay"
  | "entitlements"
  | "employeeId"
  | "owner"
  | "dutiesFromTitle";

const PEOPLE_CSV_HEADER = [
  "name",
  "employee_id",
  "role",
  "department",
  "tenure_years",
  "active",
  "last_day",
  "entitlements",
  "owns_business",
  "duties_from_title",
] as const;

/** Columns this app's export added later; an older export without them is still its own. */
const LATER_EXPORT_COLUMNS: readonly string[] = [
  "employee_id",
  "owns_business",
  "duties_from_title",
];

/** Name parts after a comma that are a credential or generation, not a first name. */
const FOOTER_PATTERN =
  /^((grand |sub ?)?totals?\b|count[:\s]*\d+\b|page \d+|report (generated|date|run)|generated (on|by|at)|printed (on|by)|end of (report|list)|record count|(accrual|cash) basis\b|\d+ (records?|rows?|employees?|people|workers?)\b)/i;

/** What may stand beside a footer label: numbers, or a count such as "9 employees". */
const FOOTER_VALUE =
  /^([\d.,%\s-]+|\d[\d,]*\s+(employees?|people|persons?|records?|rows?|workers?|staff|members?))$/i;

/**
 * A report's run stamp on a line of its own, as QuickBooks and payroll
 * reports print it under the table: "Tuesday, Sep 23, 2026 09:14 AM
 * GMT-04:00", "Accrual basis Tuesday, September 23, 2026", "09/23/2026 9:14
 * AM". A person's row never reads as a date and time.
 */
const RUN_STAMP =
  /^((accrual|cash) basis\s+)?((mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})(,?\s+\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?m\.?)?)?(\s*(gmt|utc)\s*([+-]\d{1,2}(:?\d{2})?)?)?$/i;

/** A CSV cell guarded against formula injection (see `csvCell`). */
const escapeCsv = csvCell;

function emptyResult(issues: PeopleImportIssue[], removed: Person[]): PeopleImportResult {
  return {
    people: [],
    issues,
    unknownEntitlements: [],
    titles: [],
    removed,
    skipped: 0,
    duplicates: 0,
    dropped: 0,
    onLeave: [],
  };
}

/** Adds the lines skipped above the table to the result as one file-level issue. */
export function addSkippedLines(
  result: PeopleImportResult,
  lines: readonly string[],
): PeopleImportResult {
  if (!lines.length) return result;
  const shown = lines.map((line) => `"${line.slice(0, 60)}"`).join(", ");
  result.issues.unshift({
    row: 0,
    message: `Skipped ${lines.length} ${lines.length === 1 ? "line" : "lines"} at the top: ${shown}`,
  });
  result.skipped = (result.skipped ?? 0) + lines.length;
  return result;
}

export function parsePeopleCsv(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  const source = stripInvisibleControls(text);
  const table = locateTable(source, looksLikeRosterHeader);
  if (table) return addSkippedLines(parsePeopleRows(table.rows, tpl, opts), table.skipped);
  return parsePeopleRows(parseRows(source, sniffDelimiter(source)), tpl, opts);
}

function rowKey(cells: readonly string[]): string {
  const keys = cells.map(normalizeHeader);
  while (keys.length && !keys[keys.length - 1]) keys.pop();
  return keys.join("|");
}

/** The footer label when a row is a total, count, page or run stamp with nothing but numbers beside it. */
function footerLabel(cells: readonly string[]): string | undefined {
  const filled = cells.map((cell) => cell.trim()).filter(Boolean);
  const [first, ...rest] = filled;
  if (!first) return undefined;
  const line = filled.join(", ");
  if (line.length <= 80 && RUN_STAMP.test(line)) return line;
  if (!FOOTER_PATTERN.test(first)) return undefined;
  return rest.every((cell) => FOOTER_VALUE.test(cell)) ? first : undefined;
}

export function parsePeopleRows(
  rows: string[][],
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  const clean = rows.map((cells) => cells.map(stripInvisibleControls));
  const header = clean[0] ?? [];
  const dataRows = clean.slice(1);
  const columns = mapColumns(header, dataRows);
  if (columns.name === undefined && (columns.first === undefined || columns.last === undefined)) {
    const shown = header
      .map((cell) => cell.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(", ");
    return emptyResult([{ row: 0, message: `Missing a name column (header: ${shown})` }], []);
  }

  const issues: PeopleImportIssue[] = [];
  const headerKey = rowKey(header);
  const candidates: { cells: string[]; row: number }[] = [];
  let skipped = 0;
  dataRows.forEach((cells, index) => {
    const row = index + 1;
    if (rowKey(cells) === headerKey) {
      skipped += 1;
      issues.push({ row, message: "Skipped a repeated header row" });
      return;
    }
    const footer = footerLabel(cells);
    if (footer) {
      skipped += 1;
      issues.push({ row, message: `Skipped a footer row: "${footer}"` });
      return;
    }
    candidates.push({ cells, row });
  });

  const maxRows =
    opts.maxRows === undefined ? 250 : Math.max(0, Math.floor(Number(opts.maxRows) || 0));
  const kept = candidates.slice(0, maxRows);
  const dropped = candidates.length - kept.length;
  if (dropped) {
    issues.push({
      row: candidates[maxRows].row,
      message: `Read the first ${maxRows} rows; ${dropped} more ${dropped === 1 ? "row was" : "rows were"} not read, because one import reads up to ${maxRows}`,
    });
  }

  // Rows that name someone already on the team keep that person's id, so the
  // who-knows-what register and process ownership survive a re-import.
  const existingByName = new Map<string, Person[]>();
  const existingByEmployeeId = new Map<string, Person>();
  for (const person of tpl.people) {
    const key = nameKey(person.name);
    existingByName.set(key, [...(existingByName.get(key) ?? []), person]);
    const idKey = person.employeeId ? nameKey(person.employeeId) : "";
    if (idKey && !existingByEmployeeId.has(idKey)) existingByEmployeeId.set(idKey, person);
  }
  const today = opts.today ?? new Date();
  const context: ImportContext = {
    tpl,
    columns,
    today,
    dayFirst:
      columns.hireDate !== undefined &&
      datesAreDayFirst(kept.map(({ cells }) => cells[columns.hireDate!] ?? "")),
    issues,
    unknownEntitlements: [],
    unknownStatuses: new Set(),
    seenNames: new Map(),
    byEmployeeId: new Map(),
    onLeave: [],
    existingByName,
    existingByEmployeeId,
    usedIds: new Set(),
    byNameTitle: new Map(),
    ownExport: isOwnExportHeader(header),
  };

  const people: Person[] = [];
  const titles: TitleMapping[] = [];
  let duplicates = 0;
  for (const { cells, row } of kept) {
    const read = readPerson(context, cells, row);
    if (read === "duplicate") duplicates += 1;
    if (typeof read === "string") continue;
    if ("position" in read) {
      titles.push(read.position);
      continue;
    }
    people.push(read.person);
    titles.push(read.mapping);
  }

  const removed = tpl.people.filter((person) => !context.usedIds.has(person.id));
  return {
    people,
    issues,
    unknownEntitlements: context.unknownEntitlements,
    titles,
    removed,
    skipped,
    duplicates,
    dropped,
    onLeave: context.onLeave,
    supplied: suppliedFields(columns),
  };
}

/** The person fields a file's columns carry. */
function suppliedFields(columns: ColumnMap): PersonField[] {
  const has: [PersonField, boolean][] = [
    ["role", columns.titles.length > 0],
    ["department", columns.department !== undefined],
    ["tenureYears", columns.tenure !== undefined || columns.hireDate !== undefined],
    [
      "active",
      columns.statuses.length + columns.workerTypes.length + columns.inactiveFlags.length > 0,
    ],
    ["lastDay", columns.lastDay !== undefined],
    ["entitlements", columns.entitlements !== undefined],
    ["employeeId", columns.employeeId !== undefined],
    ["owner", columns.ownsBusiness !== undefined],
    ["dutiesFromTitle", columns.dutiesFromTitle !== undefined],
  ];
  return has.filter(([, present]) => present).map(([field]) => field);
}

/** True when the header is this app's own team export, old or current. */
function isOwnExportHeader(header: readonly string[]): boolean {
  const keys = new Set(header.map(normalizeHeader));
  return PEOPLE_CSV_HEADER.filter((column) => !LATER_EXPORT_COLUMNS.includes(column)).every(
    (column) => keys.has(normalizeHeader(column)),
  );
}

/**
 * The team after an import that adds and updates without removing anyone:
 * each imported person replaces the team member with the same id (the
 * importer gives a row that names a team member that member's id and keeps
 * what the file does not say), people new to the team are added at the end,
 * and everyone the file leaves out stays.
 */
export function mergeImportedPeople(
  current: readonly Person[],
  imported: readonly Person[],
): { people: Person[]; added: Person[]; updated: Person[] } {
  const byId = new Map(imported.map((person) => [person.id, person]));
  const updated: Person[] = [];
  const people = current.map((person) => {
    const next = byId.get(person.id);
    if (!next) return person;
    byId.delete(person.id);
    if (!samePerson(person, next)) updated.push(next);
    return next;
  });
  const added = [...byId.values()];
  return { people: [...people, ...added], added, updated };
}

function samePerson(a: Person, b: Person): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof Person)[]);
  return [...keys].every((key) => {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) || Array.isArray(y)) {
      return (
        JSON.stringify([...((x as string[]) ?? [])].sort()) ===
        JSON.stringify([...((y as string[]) ?? [])].sort())
      );
    }
    return x === y;
  });
}

/**
 * The duties the conflict engine reads for a person: their own list, else
 * their role's duties in this line of business, else the shared role list.
 * Mirrors `buildAssignments` in the duty-conflict engine.
 */
export function effectiveDuties(
  person: Pick<Person, "role" | "entitlements">,
  roleTemplates: Readonly<Record<string, readonly string[]>>,
): string[] {
  if (person.entitlements?.length) return [...person.entitlements];
  return [...(roleTemplates[person.role] ?? ROLE_TEMPLATES[person.role] ?? ["view_reports_only"])];
}

/** What an import would take with it: register assignments and process owner slots held by `removed`. */
export function removedPeopleImpact(
  tpl: IndustryTemplate,
  removed: readonly Person[],
): { assignments: number; processOwnerships: number } {
  const ids = new Set(removed.map((p) => p.id));
  return {
    assignments: tpl.relations.filter((r) => ids.has(r.personId)).length,
    processOwnerships: tpl.processes.reduce(
      (n, p) => n + (p.ownerPersonIds ?? []).filter((id) => ids.has(id)).length,
      0,
    ),
  };
}

/**
 * The team as this app's own CSV. Each person's duties are written as the
 * conflict engine reads them, so a person whose duties come from their role
 * re-imports with the same duties; pass the line of business's role
 * templates for that.
 */
export function peopleToCsv(
  people: readonly Person[],
  roleTemplates?: Readonly<Record<string, readonly string[]>>,
): string {
  const rows = [
    PEOPLE_CSV_HEADER.join(","),
    ...people.map((person) =>
      [
        person.name,
        person.employeeId ?? "",
        person.role,
        person.department ?? "",
        person.tenureYears === undefined ? "" : String(person.tenureYears),
        person.active ? "true" : "false",
        person.lastDay ?? "",
        (roleTemplates ? effectiveDuties(person, roleTemplates) : (person.entitlements ?? [])).join(
          ";",
        ),
        person.owner === undefined ? "" : person.owner ? "yes" : "no",
        person.dutiesFromTitle ? "yes" : "",
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];
  return `${rows.join("\r\n")}\r\n`;
}
