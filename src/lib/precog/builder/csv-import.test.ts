import { describe, expect, it } from "vitest";
import { csvImportChangeCount, openCsvImport, withReplace } from "./csv-import";
import { processesToCsv } from "../import/process-csv";
import { resolveTemplate } from "../active-template";
import { defaultProfile } from "../practice-profile";

const tpl = resolveTemplate(defaultProfile());
/** The map's own export with its last process left out. */
const fewer = processesToCsv(tpl.processes.slice(0, -1), tpl.people, tpl.controls);

describe("spreadsheet import", () => {
  it("previews removals only after the owner ticks the box", () => {
    const opened = openCsvImport("fewer.csv", fewer, tpl);
    expect(opened.replace).toBe(false);
    expect(opened.preview.removed).toHaveLength(1);
    expect(opened.preview.processes).toHaveLength(tpl.processes.length);
    expect(csvImportChangeCount(opened)).toBe(0);

    const replacing = withReplace(opened, true, tpl);
    expect(replacing.preview.processes).toHaveLength(tpl.processes.length - 1);
    expect(csvImportChangeCount(replacing)).toBe(1);
  });

  it("starts the next file without removals, whatever the last import chose", () => {
    const first = withReplace(openCsvImport("fewer.csv", fewer, tpl), true, tpl);
    expect(first.replace).toBe(true);
    const next = openCsvImport("again.csv", fewer, tpl);
    expect(next.replace).toBe(false);
    expect(next.preview.processes).toHaveLength(tpl.processes.length);
  });
});
