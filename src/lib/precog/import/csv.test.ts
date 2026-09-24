import { describe, expect, it } from "vitest";
import { csvCell, locateTable, parseRows, sniffDelimiter } from "./csv";

const isHeader = (cells: readonly string[]) => cells.some((cell) => cell.trim() === "Name");

describe("sniffDelimiter", () => {
  it("picks a tab, a pipe, a semicolon, or a comma from the first line", () => {
    expect(sniffDelimiter("Name\tTitle\nAna Ruiz\tOwner")).toBe("\t");
    expect(sniffDelimiter("Name | Title | Department")).toBe("|");
    expect(sniffDelimiter("Name|Title|Department")).toBe("|");
    expect(sniffDelimiter("Nom;Prénom;Poste")).toBe(";");
    expect(sniffDelimiter("Name,Title")).toBe(",");
    expect(sniffDelimiter("Name")).toBe(",");
    expect(sniffDelimiter("Worker Report - as of 09/01/2026\n\nEmployee ID\tWorker")).toBe(",");
  });
});

describe("parseRows", () => {
  it("splits on a pipe and honours quotes with the other delimiters", () => {
    expect(parseRows("Name | Title\nAna Ruiz | Owner", "|")).toEqual([
      ["Name ", " Title"],
      ["Ana Ruiz ", " Owner"],
    ]);
    expect(parseRows('"Ruiz, Ana",Owner\n"Ochoa, Ben",Bookkeeper')).toEqual([
      ["Ruiz, Ana", "Owner"],
      ["Ochoa, Ben", "Bookkeeper"],
    ]);
  });
});

describe("locateTable", () => {
  it("finds the header among the first lines and sniffs the delimiter on that line", () => {
    const table = locateTable(
      "Worker Report - as of 09/01/2026\n\nEmployee ID\tName\tTitle\n1001\tAna Ruiz\tOwner",
      isHeader,
    );
    expect(table?.delimiter).toBe("\t");
    expect(table?.skipped).toEqual(["Worker Report - as of 09/01/2026"]);
    expect(table?.rows).toEqual([
      ["Employee ID", "Name", "Title"],
      ["1001", "Ana Ruiz", "Owner"],
    ]);
  });

  it("skips nothing when the header is the first line", () => {
    const table = locateTable("Name,Title\nAna Ruiz,Owner", isHeader);
    expect(table?.skipped).toEqual([]);
    expect(table?.rows).toEqual([
      ["Name", "Title"],
      ["Ana Ruiz", "Owner"],
    ]);
  });

  it("treats a one-cell line above a multi-cell line as a title, not a header", () => {
    expect(locateTable("Name\nAna Ruiz, Owner\nBen Ochoa, Bookkeeper", isHeader)).toBeUndefined();
    expect(locateTable("Name\nAna Ruiz - Owner", isHeader)).toBeUndefined();
    expect(locateTable("Name\nAna Ruiz\nBen Ochoa", isHeader)?.rows).toEqual([
      ["Name"],
      ["Ana Ruiz"],
      ["Ben Ochoa"],
    ]);
  });

  it("gives up when no header sits within the lookahead", () => {
    expect(locateTable("Ana Ruiz, Owner\nBen Ochoa, Bookkeeper", isHeader)).toBeUndefined();
    const late = ["a", "b", "c", "d", "e", "Name,Title", "Ana Ruiz,Owner"].join("\n");
    expect(locateTable(late, isHeader)).toBeUndefined();
    expect(locateTable(late, isHeader, 6)?.skipped).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("csvCell", () => {
  it.each([
    ['=HYPERLINK("http://x","click")', '"\'=HYPERLINK(""http://x"",""click"")"'],
    ["+1 555 0100", "'+1 555 0100"],
    ["-Office Manager", "'-Office Manager"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\tTabbed", "'\tTabbed"],
  ])("keeps %s from running as a spreadsheet formula", (value, cell) => {
    expect(csvCell(value)).toBe(cell);
  });

  it("leaves plain numbers and ordinary text alone", () => {
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell("+2.5")).toBe("+2.5");
    expect(csvCell("Ana Ruiz")).toBe("Ana Ruiz");
    expect(csvCell("Ruiz, Ana")).toBe('"Ruiz, Ana"');
  });

  it("reads a guarded cell back as it was written", () => {
    const values = ["=cmd|' /C calc'!A0", "+1 555 0100", "@home", "Ana Ruiz", "-5"];
    const line = values.map(csvCell).join(",");
    expect(parseRows(line)[0]).toEqual(values);
  });
});
