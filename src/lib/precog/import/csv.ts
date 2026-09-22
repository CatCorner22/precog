/**
 * Splits delimited text into rows. The delimiter defaults to a comma; pass
 * "\t" for text pasted from a spreadsheet, or use `sniffDelimiter`.
 */
export function parseRows(text: string, delimiter: "," | "\t" | ";" = ","): string[][] {
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
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

/** The delimiter the first line uses: a tab when pasted from a spreadsheet, else a comma or semicolon. */
export function sniffDelimiter(text: string): "," | "\t" | ";" {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if (first.includes("\t")) return "\t";
  if (!first.includes(",") && first.includes(";")) return ";";
  return ",";
}
