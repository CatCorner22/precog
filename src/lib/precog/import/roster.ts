import type { IndustryTemplate } from "../templates/types";
import { parseRows, sniffDelimiter } from "./csv";
import { looksLikeRosterHeader, parsePeopleRows, type PeopleImportResult } from "./people-csv";

/**
 * Reads whatever an owner pastes for their team: a worker export from
 * Workday, SAP SuccessFactors, Oracle HCM Cloud, or a payroll provider
 * (with its header row), this app's own CSV, or a plain list with one
 * person per line as "Name, Title", "Name<tab>Title", or "Name - Title".
 * Job titles are read through the catalog of common titles so each person
 * lands with the duties that title typically holds.
 */
export function parseRoster(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return { people: [], issues: [], unknownEntitlements: [], titles: [], removed: tpl.people };
  }
  const delimiter = sniffDelimiter(trimmed);
  const rows = parseRows(trimmed, delimiter);
  if (rows[0] && looksLikeRosterHeader(rows[0])) return parsePeopleRows(rows, tpl, opts);

  // No header: each line is a person. Split on a tab, a comma, or a spaced dash.
  const listRows: string[][] = [["name", "role", "department"]];
  for (const line of trimmed.split(/\r?\n/)) {
    const source = line.trim();
    if (!source) continue;
    const parts = source.includes("\t")
      ? source.split("\t")
      : source.includes(",")
        ? source.split(",")
        : source.split(/\s[-–—]\s/);
    const [name = "", role = "", department = ""] = parts.map((p) => p.trim());
    listRows.push([name, role, department]);
  }
  return parsePeopleRows(listRows, tpl, opts);
}
