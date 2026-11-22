import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { listLicenseReferencesFromDisk } from "@/lib/licenses/reference.server";
import {
  complianceIndex,
  parseComplianceCard,
  searchComplianceCards,
  type ComplianceCard,
} from "./cards";
import { officeMap } from "./office-map";

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

  it("loads exactly 255 cards, including 228 verified cards", () => {
    expect(cards).toHaveLength(255);
    expect(cards.filter((card) => card.status === "verified")).toHaveLength(228);
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

  it("finds a radiation card for an xray search through synonym expansion", () => {
    const results = searchComplianceCards("xray", cards);
    expect(results[0]?.section).toBe("controlled-substances-radiation");
    expect(results[0]?.title).toMatch(/x-ray|radiation|radiology/i);
  });

  it("returns plain-text full content for naloxone searches", () => {
    const result = searchComplianceCards("naloxone", cards).find(
      (card) => card.id === "tn-53-11-308-naloxone-offer",
    );
    expect(result).toBeDefined();
    expect(result?.body).toContain("Office checklist");
    expect(result?.body).toContain("Open.");
    expect(result?.body).not.toContain("](http");
    expect(result?.body).toContain("\n");
    expect(result?.body).not.toMatch(/<\/?[A-Za-z][^>]*>/);
  });

  it("ranks an OSHA card in the top three for sharps-container searches", () => {
    const results = searchComplianceCards("sharps container", cards, { limit: 3 });
    expect(results.some(({ title }) => /OSHA/i.test(title))).toBe(true);
  });

  it("returns no results for an empty search", () => {
    expect(searchComplianceCards("  ", cards)).toEqual([]);
  });

  it("browses every OSHA card for an empty section search", () => {
    const expected = cards
      .filter((card) => card.section === "osha")
      .sort((a, b) => a.title.localeCompare(b.title));
    const results = searchComplianceCards("", cards, { section: "osha" });
    expect(results).toHaveLength(expected.length);
    expect(results.map((card) => card.id)).toEqual(expected.map((card) => card.id));
  });

  it("indexes every section and counts abuse and OSHA subtopics", () => {
    const index = complianceIndex(cards);
    expect(index.sections.reduce((total, section) => total + section.count, 0)).toBe(255);
    expect(index.keywords.find(({ term }) => term === "abuse")?.count).toBeGreaterThanOrEqual(2);
    const osha = index.sections.find(({ id }) => id === "osha");
    expect(osha?.subtopics.map(({ term }) => term)).toEqual(expect.arrayContaining(["air", "ppm"]));
    expect(osha?.subtopics.find(({ term }) => term === "air")?.count).toBeGreaterThanOrEqual(1);
    expect(osha?.subtopics.find(({ term }) => term === "ppm")?.count).toBeGreaterThanOrEqual(1);
  });

  it("keeps Office map edges on resolved topics and real license tabs", () => {
    const map = officeMap(cards);
    const topicTerms = new Set(map.topics.map(({ term }) => term));
    for (const node of [...map.licenses, ...map.areas]) {
      expect(node.topics.every((term) => topicTerms.has(term))).toBe(true);
    }
    expect(map.licenses.find(({ id }) => id === "pda")?.topics).not.toContain("controlled");

    const licenseIds = new Set(listLicenseReferencesFromDisk().map(({ id }) => id));
    for (const license of map.licenses) {
      expect(license.licenseTab).toBeDefined();
      expect(licenseIds.has(license.licenseTab ?? "")).toBe(true);
    }
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
