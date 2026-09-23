/** Cell separators the importers understand. */
export type Delimiter = "," | "\t" | ";" | "|";

/**
 * Splits delimited text into rows. The delimiter defaults to a comma; pass
 * "\t" for text pasted from a spreadsheet, or use `sniffDelimiter`.
 */
export function parseRows(text: string, delimiter: Delimiter = ","): string[][] {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      row.push(field);
      field = "";
      if (char === "\r" && source[i + 1] === "\n") i++;
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) => cells.map(unguardCsvCell));
}

/** A cell a spreadsheet would run as a formula: it starts with =, +, -, @, a tab or a carriage return. */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/**
 * One CSV cell, safe to open in a spreadsheet. A name such as "=HYPERLINK(…)"
 * would otherwise run as a formula when the owner opens the export (CSV
 * injection); it gets a leading apostrophe, which spreadsheets show as text.
 * Plain numbers such as -5 are left alone. Cells with a comma, a quote or a
 * line break are quoted.
 */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Removes the apostrophe `csvCell` adds, so the app's own export reads back as written. */
function unguardCsvCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/**
 * The delimiter the first line uses: a tab when pasted from a spreadsheet, a
 * pipe for a pipe-separated table, else a comma or semicolon.
 */
export function sniffDelimiter(text: string): Delimiter {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if (first.includes("\t")) return "\t";
  if (/\s\|\s/.test(first) || first.split("|").length > 2) return "|";
  if (!first.includes(",") && first.includes(";")) return ";";
  return ",";
}

export interface LocatedTable {
  /** The header row followed by the data rows. */
  rows: string[][];
  delimiter: Delimiter;
  /** Non-empty lines above the header, such as a report title. */
  skipped: string[];
}

/** True when a line splits into several cells or reads as "Name - Title", "Name | Title" or "Name: Title". */
function hasSeveralCells(line: string): boolean {
  const cells = parseRows(line, sniffDelimiter(line))[0] ?? [];
  return cells.length > 1 || /\s[-–—|]\s|:\s/.test(line);
}

/**
 * Finds the header among the first few non-empty lines, sniffing the
 * delimiter on each candidate, and parses the table from there. A one-cell
 * line above a multi-cell line is a title, not a header. Returns undefined
 * when no candidate satisfies `isHeader`.
 */
export function locateTable(
  text: string,
  isHeader: (cells: readonly string[]) => boolean,
  lookahead = 5,
): LocatedTable | undefined {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim())
    .slice(0, lookahead);
  for (const [position, { line, index }] of candidates.entries()) {
    const delimiter = sniffDelimiter(line);
    const cells = parseRows(line, delimiter)[0] ?? [];
    if (!isHeader(cells)) continue;
    const next = candidates[position + 1];
    if (cells.length === 1 && next && hasSeveralCells(next.line)) continue;
    return {
      rows: parseRows(lines.slice(index).join("\n"), delimiter),
      delimiter,
      skipped: candidates.slice(0, position).map((c) => c.line.trim()),
    };
  }
  return undefined;
}
