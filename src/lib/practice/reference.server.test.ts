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

  it("pins the revised tier cutoffs and their source note", () => {
    const section = listPracticeSectionsFromDisk().find(({ id }) => id === 30);

    expect(section?.text).toContain(
      "Tier 1 is any gate or score ≥24; Tier 2 is 16–23; Tier 3 is 9–15; Tier 4 is below 9.",
    );
    expect(section?.text).toContain(
      "Precog uses the Frontier GRC cutoffs (24/16/9); the source rubric used 30/20/10.",
    );
  });

  it("omits generated apparatus sections and preserves source keys", () => {
    const sections = listPracticeSectionsFromDisk();
    expect(sections.some(({ id }) => [2, 91, 92, 99].includes(id))).toBe(false);
    expect(sections.every(({ text }) => !/^[\s\p{Pd}]*$/u.test(text))).toBe(true);
    expect(sections.find(({ id }) => id === 90)?.text).toContain("[S1]");
  });

  it("ranks whole phrases and substantive title terms", () => {
    expect(searchPracticeReferenceFromDisk("impact and likelihood")[0]?.id).toBe(30);
    expect(searchPracticeReferenceFromDisk("SOP")[0]?.id).toBe(40);
  });

  it("searches index aliases without exposing them in section text or excerpts", () => {
    const section = listPracticeSectionsFromDisk().find(({ id }) => id === 30);
    const result = searchPracticeReferenceFromDisk("detectability")[0];
    expect(section?.keywords).toContain("detectability");
    expect(section?.text).not.toContain("detectability");
    expect(result?.id).toBe(30);
    expect(result?.excerpt).not.toContain("detectability");
  });

  it("keeps practice-specific location names out of bundled Practice knowledge", () => {
    const privateLocationPattern = new RegExp(["corner", "stone|knox", "ville"].join(""), "i");
    expect(readPracticeKnowledgeFromDisk()).not.toMatch(privateLocationPattern);
  });
});
