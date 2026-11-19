import { describe, expect, it } from "vitest";
import { listLicenseReferencesFromDisk } from "./reference.server";

describe("license reference loader", () => {
  const references = listLicenseReferencesFromDisk();

  it("returns six ordered references with verification dates and source links", () => {
    expect(references.map((reference) => reference.id)).toEqual([
      "dentist",
      "dentist-sedation-permits",
      "dental-hygienist",
      "dental-assistant-registered",
      "dental-assistant-practical",
      "treatments",
    ]);
    expect(references).toHaveLength(6);
    for (const reference of references) {
      expect(reference.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(reference.sources.length).toBeGreaterThan(0);
    }
  });

  it("parses the treatments table with at least twenty rows", () => {
    const treatments = references.find((reference) => reference.id === "treatments");
    const table = treatments?.blocks.find((block) => block.type === "table");
    expect(table?.type).toBe("table");
    if (table?.type !== "table") throw new Error("The treatments table is missing.");
    expect(table.rows.length).toBeGreaterThanOrEqual(20);
    expect(table.rows.some((row) => row[0] === "Local anesthesia")).toBe(true);
  });
});
