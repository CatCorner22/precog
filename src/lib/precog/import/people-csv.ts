import type { IndustryTemplate } from "../templates";
import type { Person } from "../types";
import { nameKey, stripInvisibleControls } from "../text";
import {
  csvCell,
  locateTable,
  normalizeHeader,
  parseRows,
  rowCapMessage,
  sniffDelimiter,
  type ImportIssue,
} from "./csv";
import { datesAreDayFirst } from "./hire-date";
import { parseRoster } from "./roster";
import { looksLikeRosterHeader, mapColumns, startsWithColumnHeading } from "./roster-columns";
import { readPerson, type ImportContext, type TitleMapping } from "./roster-row-read";
import { householdMark } from "./people-backup";
import { personDuties } from "../sod/assignments";
import { ROLE_TEMPLATES } from "../sod/role-templates";

export interface PeopleImportResult {
  people: Person[];
  issues: ImportIssue[];
  /** Candidate roster rows the importer actually examined. */
  rowsRead: number;
  /** Examined rows that could not become a person because required data was invalid. */
  invalid: number;
  /** How each row's job title was read, for the review table after an import. */
  titles: TitleMapping[];
  /**
   * Current team members with no row in the file. Their ids are gone from
   * `people`, so register assignments and process ownerships pointing at them
   * will be dropped when the import is applied.
   */
  removed: Person[];
  /** Lines skipped because they were a report title, a repeated header, or a footer. */
  skipped: number;
  /** Rows skipped because an earlier row already named the same person with the same title. */
  duplicates: number;
  /** Rows past the row limit that were not read. */
  dropped: number;
  /**
   * Ids of people whose status says they are on leave ("Leave", "LOA",
   * "On Leave", ADP's "L"). They stay on the team; the caller can record
   * the absence.
   */
  onLeave: string[];
}

/**
 * Reads a team file: a worker export with its header row (even under a
 * report title), this app's own export, or a plain list saved from a text
 * editor, which reads as a pasted roster does. A header with no name column
 * is reported rather than read as people, and so is a file that is not text
 * (an Excel workbook, a zip, random bytes). A plain list whose lines mostly
 * have no job title only adds people: it never offers to replace the team.
 */
export function parsePeopleCsv(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  if (text.length > MAX_FILE_CHARACTERS) {
    const megabytes = Math.round(text.length / 100_000) / 10;
    return emptyResult(
      [
        {
          row: 0,
          message: `This file holds ${megabytes} MB of text, far more than a team list. Check that you picked the right file.`,
        },
      ],
      [],
    );
  }
  if (!looksLikeText(text)) return emptyResult([{ row: 0, message: NOT_TEXT_MESSAGE }], []);
  const source = stripInvisibleControls(text);
  const table = locateTable(source, looksLikeRosterHeader);
  if (table) return addSkippedLines(parsePeopleRows(table.rows, tpl, opts), table.skipped);
  const rows = parseRows(source, sniffDelimiter(source));
  if (startsWithColumnHeading(rows[0] ?? [])) return parsePeopleRows(rows, tpl, opts);
  const list = parseRoster(source, tpl, opts);
  // No header, and most lines carry no job title: too little to tell that
  // the file is the whole team, so it adds and updates and removes nobody.
  const untitled = list.titles.filter((mapping) => !mapping.title.trim()).length;
  if (list.removed.length && untitled * 2 > list.titles.length) {
    list.issues.unshift({ row: 0, message: NO_REPLACE_MESSAGE });
    list.removed = [];
  }
  return list;
}

/** What a team import says about a file that is not text. */
export const NOT_TEXT_MESSAGE =
  "This looks like an Excel or other non-text file. Save it as CSV, then import it.";

/** What a team import says when a headerless list cannot replace the team. */
export const NO_REPLACE_MESSAGE =
  "Precog found no header row and most lines have no job title, so this file only adds and updates people. To replace the team, import a file with a header row.";

/**
 * True when a file reads as text: no zip signature (an .xlsx is a zip), no
 * NUL or other control character except tab, line feed, carriage return,
 * vertical tab, form feed and a closing end-of-file mark (Ctrl-Z), and at
 * most 5% of characters unreadable (the replacement character, DEL and the
 * C1 controls).
 */
export function looksLikeText(text: string): boolean {
  if (text.startsWith("PK\u0003\u0004")) return false;
  const body = text.endsWith("\u001A") ? text.slice(0, -1) : text;
  if (CONTROL_CHARACTER.test(body)) return false;
  const unreadable = body.match(UNREADABLE_CHARACTER)?.length ?? 0;
  return unreadable * 20 <= body.length;
}

/**
 * The text of a team file from its bytes: UTF-16 when it starts with that
 * byte-order mark (Excel's "Unicode Text" export), else UTF-8.
 */
export function decodeTeamFile(bytes: Uint8Array): string {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  return new TextDecoder(encoding).decode(bytes);
}

// eslint-disable-next-line no-control-regex -- finding control characters is the point.
const CONTROL_CHARACTER = /[\u0000-\u0008\u000E-\u001F]/;
const UNREADABLE_CHARACTER = /[�\u007F-\u009F]/g;

/** Reads a table whose first row is the header. */
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

  const issues: ImportIssue[] = [];
  const headerKey = headerSignature(header);
  const candidates: { cells: string[]; row: number }[] = [];
  let skipped = 0;
  dataRows.forEach((cells, index) => {
    const row = index + 1;
    if (headerSignature(cells) === headerKey) {
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
      message: rowCapMessage(maxRows, dropped),
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
    // The hire and last-day columns are written the same way, so a date in
    // either that only fits day first ("15/12/2026") sets the order for both.
    dayFirst: datesAreDayFirst(
      [columns.hireDate, columns.lastDay].flatMap((column) =>
        column === undefined ? [] : kept.map(({ cells }) => cells[column] ?? ""),
      ),
    ),
    issues,
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

  // The household mark comes from the file's column when it has one (an
  // empty cell clears it); a file without the column keeps the matched team
  // member's mark, so related signers never turn into dual control.
  const householdColumn = header.findIndex((cell) => HOUSEHOLD_HEADERS.has(normalizeHeader(cell)));
  const existingById = new Map(tpl.people.map((person) => [person.id, person]));
  // Set on the person read, not a copy: a later row naming a second
  // position of this person updates that same object.
  const withHousehold = (person: Person, cells: readonly string[]): Person => {
    const mark =
      householdColumn >= 0
        ? householdMark(cells[householdColumn])
        : existingById.get(person.id)?.householdKey;
    if (mark) person.householdKey = mark;
    return person;
  };

  const people: Person[] = [];
  const titles: TitleMapping[] = [];
  let duplicates = 0;
  let invalid = 0;
  for (const { cells, row } of kept) {
    const read = readPerson(context, cells, row);
    if (read === "duplicate") duplicates += 1;
    if (read === "skip") invalid += 1;
    if (typeof read === "string") continue;
    if ("position" in read) {
      titles.push(read.position);
      continue;
    }
    people.push(withHousehold(read.person, cells));
    titles.push(read.mapping);
  }

  const removed = tpl.people.filter((person) => !context.usedIds.has(person.id));
  return {
    people,
    issues,
    rowsRead: kept.length,
    invalid,
    titles,
    removed,
    skipped,
    duplicates,
    dropped,
    onLeave: context.onLeave,
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
  result.skipped += lines.length;
  return result;
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

/** The duties the conflict engine reads for a person (see `personDuties`). */
export function effectiveDuties(
  person: Pick<Person, "role" | "entitlements">,
  roleTemplates: Readonly<Record<string, readonly string[]>>,
): string[] {
  return personDuties(person, roleTemplates);
}

/** True when neither the person nor their role gives any duties, so effectiveDuties falls back to reports only. */
export function dutiesUnknown(
  person: Pick<Person, "role" | "entitlements">,
  roleTemplates: Readonly<Record<string, readonly string[]>>,
): boolean {
  return (
    !person.entitlements?.length && !(roleTemplates[person.role] ?? ROLE_TEMPLATES[person.role])
  );
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
        person.householdKey ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `${rows.join("\r\n")}\r\n`;
}

/** A result with no people: a file-level problem, or nothing to read. */
export function emptyResult(issues: ImportIssue[], removed: Person[]): PeopleImportResult {
  return {
    people: [],
    issues,
    rowsRead: 0,
    invalid: 0,
    titles: [],
    removed,
    skipped: 0,
    duplicates: 0,
    dropped: 0,
    onLeave: [],
  };
}

/** A row's cells as header keys, to spot the header repeated further down the file. */
function headerSignature(cells: readonly string[]): string {
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

/** True when the header is this app's own team export, old or current. */
function isOwnExportHeader(header: readonly string[]): boolean {
  const keys = new Set(header.map(normalizeHeader));
  return PEOPLE_CSV_HEADER.filter((column) => !LATER_EXPORT_COLUMNS.includes(column)).every(
    (column) => keys.has(normalizeHeader(column)),
  );
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
 * A team file larger than this is the wrong file (a year of payroll detail,
 * a ledger): reading it would hold the page for seconds only to keep the
 * first 250 rows.
 */
const MAX_FILE_CHARACTERS = 5_000_000;

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
  "household",
] as const;

/** Columns this app's export added later; an older export without them is still its own. */
const LATER_EXPORT_COLUMNS: readonly string[] = [
  "employee_id",
  "owns_business",
  "duties_from_title",
  "household",
];

/** Headers of the household mark column: this app's export, and the field's name in the team editor. */
const HOUSEHOLD_HEADERS = new Set(
  ["household", "household mark", "household_key", "shares a household"].map(normalizeHeader),
);

/** First cell of a report footer row: totals, counts, page numbers, run stamps. */
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
