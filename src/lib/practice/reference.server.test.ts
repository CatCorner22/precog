import { describe, expect, it } from "vitest";
import {
  listPracticeFunctionsFromDisk,
  listPracticeSectionsFromDisk,
  readPracticeKnowledgeFromDisk,
  searchPracticeReferenceFromDisk,
} from "./reference.server";

describe("Practice desk reference loader", () => {
  it("parses all 17 function records and their four rule groups", () => {
    const functions = listPracticeFunctionsFromDisk();
    expect(functions).toHaveLength(17);
    expect(functions[0]).toMatchObject({ id: 10, title: "Governance and ownership" });
    expect(functions[16]).toMatchObject({ id: 26, title: "Continuity and cross-training" });
    for (const item of functions) {
      expect(item.risks).not.toHaveLength(0);
      expect(item.sops).not.toHaveLength(0);
      expect(item.controls).not.toHaveLength(0);
      expect(item.metrics).not.toHaveLength(0);
    }
  });

  it("parses the full reference sections and searches their text", () => {
    expect(listPracticeSectionsFromDisk().some((section) => section.id === 60)).toBe(true);
    expect(searchPracticeReferenceFromDisk("two-deep").some((result) => result.id === 50)).toBe(
      true,
    );
    expect(searchPracticeReferenceFromDisk("Tier 2")[0]?.excerpt).toContain("Tier 2");
    expect(searchPracticeReferenceFromDisk("   ")).toEqual([]);
  });

  it("ranks whole phrases and substantive title terms", () => {
    expect(searchPracticeReferenceFromDisk("impact and likelihood")[0]?.id).toBe(30);
    expect(searchPracticeReferenceFromDisk("SOP")[0]?.id).toBe(40);
  });

  it("keeps practice-specific location names out of bundled Practice knowledge", () => {
    const privateLocationPattern = new RegExp(["corner", "stone|knox", "ville"].join(""), "i");
    expect(readPracticeKnowledgeFromDisk()).not.toMatch(privateLocationPattern);
  });
});
