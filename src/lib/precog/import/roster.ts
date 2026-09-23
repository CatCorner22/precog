import type { IndustryTemplate } from "../templates/types";
import { locateTable } from "./csv";
import {
  addSkippedLines,
  looksLikeRosterHeader,
  parsePeopleRows,
  splitListLine,
  type PeopleImportResult,
} from "./people-csv";

const LIST_HEADER = ["name", "role", "department"];

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

/** Words a list's title line uses and a person's name does not: "Staff List", "Team Roster". */
const LIST_TITLE =
  /\b(list|roster|staff|team|employees?|people|crew|directory|report|members?|personnel|workers?|payroll|schedule|contacts)\b|\d|:$/i;

/**
 * Reads a headerless list, one person per line. A one-cell first line above
 * lines that split into several parts is a title, not a person, and is
 * skipped when it is one word ("Employees") or reads as a list's title
 * ("Staff List", "Team Roster", "As of 09/01/2026"); a lone name such as
 * "Ana Ruiz" stays a person.
 */
function parseList(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date },
): PeopleImportResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map(splitListLine);
  const first = rows[0]?.[0] ?? "";
  const titleLine =
    rows.length > 1 &&
    rows[0].length === 1 &&
    rows[1].length > 1 &&
    (!/\s/.test(first) || LIST_TITLE.test(first))
      ? lines[0].trim()
      : undefined;
  const dataRows = titleLine ? rows.slice(1) : rows;
  const result = parsePeopleRows([LIST_HEADER, ...dataRows], tpl, opts);
  return titleLine ? addSkippedLines(result, [titleLine]) : result;
}

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
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return {
      people: [],
      issues: [],
      unknownEntitlements: [],
      titles: [],
      removed: tpl.people,
      skipped: 0,
      duplicates: 0,
      dropped: 0,
    };
  }
  const source = unwrapMarkdownTable(trimmed);
  const table = locateTable(source, looksLikeRosterHeader);
  if (table) return addSkippedLines(parsePeopleRows(table.rows, tpl, opts), table.skipped);
  return parseList(source, tpl, opts);
}
