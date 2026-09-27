import type { IndustryTemplate } from "../templates";
import { parseProcessCsv, type ProcessImportResult } from "../import/process-csv";

/**
 * A spreadsheet import waiting for the owner to apply or cancel it. The
 * "remove processes not in the file" choice lives here, so it closes with
 * the preview and every new file starts by adding and updating only.
 */
export interface CsvImport {
  fileName: string;
  text: string;
  /** Remove the map's processes that the file leaves out. */
  replace: boolean;
  preview: ProcessImportResult;
}

type ImportTemplate = Pick<IndustryTemplate, "processes" | "people" | "controls">;

/** A new file's preview: it adds and updates, and removes nothing until the owner says so. */
export function openCsvImport(fileName: string, text: string, tpl: ImportTemplate): CsvImport {
  return { fileName, text, replace: false, preview: parseProcessCsv(text, tpl, { mode: "merge" }) };
}

/** The same file previewed with or without removing the processes it leaves out. */
export function withReplace(current: CsvImport, replace: boolean, tpl: ImportTemplate): CsvImport {
  return {
    ...current,
    replace,
    preview: parseProcessCsv(current.text, tpl, { mode: replace ? "replace" : "merge" }),
  };
}

/** How many processes the import adds, updates and (when chosen) removes. */
export function csvImportChangeCount({ preview, replace }: CsvImport): number {
  return preview.added.length + preview.updated.length + (replace ? preview.removed.length : 0);
}
