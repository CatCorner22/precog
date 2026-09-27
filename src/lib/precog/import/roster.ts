import type { IndustryTemplate } from "../templates/types";
import { locateTable } from "./csv";
import {
  addSkippedLines,
  emptyResult,
  looksLikeRosterHeader,
  parsePeopleRows,
  splitListLine,
  type PeopleImportResult,
} from "./people-csv";
import { stripInvisibleControls } from "../text";

/**
 * Reads whatever an owner pastes for their team: a worker export from
 * Workday, SAP SuccessFactors, Oracle HCM Cloud, or a payroll provider
 * (with its header row, even under a report title), this app's own CSV, a
 * Markdown table, or a plain list with one person per line as "Name, Title",
 * "Name<tab>Title", "Name - Title", "Name | Title", "Name: Title" or
 * "Name (Title)". Job titles are read through the catalog of common titles
 * so each person lands with the duties that title typically holds.
 */
export function parseRoster(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  const trimmed = stripInvisibleControls(text).trim();
  if (!trimmed) return emptyResult([], tpl.people);
  const source = unwrapMarkdownTable(trimmed);
  const table = locateTable(source, looksLikeRosterHeader);
  if (table) return addSkippedLines(parsePeopleRows(table.rows, tpl, opts), table.skipped);
  return parseList(source, tpl, opts);
}

/** A Markdown table loses its outer pipes and its separator row; the pipes between cells stay as the delimiter. */
function unwrapMarkdownTable(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines.every((line) => line.startsWith("|") && line.endsWith("|"))) {
    return text;
  }
  return lines
    .filter((line) => !/^[\s|:-]+$/.test(line))
    .map((line) => line.slice(1, -1))
    .join("\n");
}

/**
 * Reads a headerless list, one person per line. A one-cell first line above
 * lines that split into several parts is skipped, and reported, when it reads
 * as the list's title (see isListTitle); a lone name such as "Ana Ruiz" or,
 * in a list of first names, "Jose" stays a person.
 */
function parseList(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date },
): PeopleImportResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map(splitListLine);
  const titleLine =
    rows.length > 1 &&
    rows[0].length === 1 &&
    rows[1].length > 1 &&
    isListTitle(rows[0][0].trim(), rows.slice(1))
      ? lines[0].trim()
      : undefined;
  const dataRows = titleLine ? rows.slice(1) : rows;
  const result = parsePeopleRows([LIST_HEADER, ...dataRows], tpl, opts);
  return titleLine ? addSkippedLines(result, [titleLine]) : result;
}

/**
 * Whether the first line of a headerless list is the list's title rather
 * than a person: it carries a date or ends in a colon ("As of 09/01/2026",
 * "Our crew:"); it starts with a list word or holds two ("Staff List",
 * "Acme Staff List"), while "Ana Staff" is a person; or it is one word that
 * is a list word ("Employees") or sits above people written with full names
 * ("Acme" above "Ana Ruiz, Owner"). One word above people written with first
 * names only is a first name too ("Jose" above "Maria, Server").
 */
function isListTitle(line: string, laterRows: readonly string[][]): boolean {
  if (/\d|:$/.test(line)) return true;
  const words = line.split(/\s+/);
  const listWords = words.filter((word) => LIST_WORD.test(word.replace(/[^a-z]/gi, ""))).length;
  if (words.length > 1) return LIST_WORD.test(words[0]) || listWords >= 2;
  return listWords === 1 || !laterRows.some((row) => !/\s/.test((row[0] ?? "").trim()));
}

/** The columns a headerless list's lines split into: "Name, Title, Department". */
const LIST_HEADER = ["name", "role", "department"];

/**
 * Words a list's title line uses and a person's name does not: "Staff List",
 * "Team Roster".
 */
const LIST_WORD =
  /^(list|roster|staff|team|employees?|people|crew|directory|report|members?|personnel|workers?|payroll|schedule|contacts)$/i;
