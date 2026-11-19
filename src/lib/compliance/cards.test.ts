import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { parseComplianceCard, searchComplianceCards, type ComplianceCard } from "./cards";

const cardRoot = resolve(process.cwd(), "knowledge/compliance");

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? markdownFiles(path)
      : entry.isFile() && entry.name.endsWith(".md")
        ? [path]
        : [];
  });
}

const cards: ComplianceCard[] = markdownFiles(cardRoot)
  .sort()
  .map((path) => {
    const section = relative(cardRoot, dirname(path)).split(sep)[0];
    return parseComplianceCard(readFileSync(path, "utf8"), section);
  });

describe("compliance knowledge cards", () => {
  it("parses front matter and the first source URL", () => {
    const card = parseComplianceCard(
      [
        "---",
        "id: sample-rule",
        "title: Sample rule",
        "status: verified",
        "last_verified: 2026-11-18",
        "review_days: 90",
        "citations:",
        "- 29 CFR 1910.1030",
        "sources:",
        "- https://example.gov/rule (official source)",
        "---",
        "# Sample rule",
        "",
        "The office keeps the required record.",
      ].join("\n"),
      "osha",
    );

    expect(card).toMatchObject({
      id: "sample-rule",
      title: "Sample rule",
      section: "osha",
      status: "verified",
      citation: "29 CFR 1910.1030",
      last_verified: "2026-11-18",
      source_url: "https://example.gov/rule",
      review_days: 90,
    });
    expect(card.body).toContain("The office keeps the required record.");
  });

  it("loads exactly 254 cards, including 227 verified cards", () => {
    expect(cards).toHaveLength(254);
    expect(cards.filter((card) => card.status === "verified")).toHaveLength(227);
    expect(cards.every((card) => /^https?:\/\//.test(card.source_url))).toBe(true);
  });

  it("finds both child- and adult-abuse cards for abuse searches", () => {
    const results = searchComplianceCards("abuse", cards).map((card) => card.id);
    expect(results).toEqual(
      expect.arrayContaining([
        "tn-37-1-403-child-abuse-reporting",
        "tn-71-6-103-adult-abuse-reporting",
      ]),
    );
  });

  it("ranks an OSHA card in the top three for sharps-container searches", () => {
    expect(
      searchComplianceCards("sharps container", cards, { limit: 3 }).some(
        (card) => card.section === "osha",
      ),
    ).toBe(true);
  });

  it("returns no results for an empty search", () => {
    expect(searchComplianceCards("  ", cards)).toEqual([]);
  });

  it("marks verified cards stale after their review interval", () => {
    const card = parseComplianceCard(
      [
        "---",
        "id: sample-rule",
        "title: Sample rule",
        "status: verified",
        "last_verified: 2026-01-01",
        "review_days: 30",
        "---",
        "Annual compliance check.",
      ].join("\n"),
      "osha",
    );
    expect(
      searchComplianceCards("compliance", [card], { now: new Date("2026-03-01") })[0].stale,
    ).toBe(true);
  });
});
