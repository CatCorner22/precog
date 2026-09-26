import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../industry";
import { KNOWLEDGE_CORPUS } from "./corpus";
import { formatRetrievalForPrompt, retrieveKnowledge } from "./retrieve";

describe("KNOWLEDGE_CORPUS", () => {
  it("has unique ids and only tags industries the app offers", () => {
    const ids = new Set<string>();
    const industries = new Set<string>(INDUSTRIES.map((i) => i.id));
    for (const c of KNOWLEDGE_CORPUS) {
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
      if (c.industry) expect(industries.has(c.industry), `${c.id}: ${c.industry}`).toBe(true);
    }
  });

  for (const { id: industry } of INDUSTRIES.filter((i) => i.id !== "dental")) {
    it(`serves a ${industry} business no dental, patient or health-privacy wording`, () => {
      const eligible = KNOWLEDGE_CORPUS.filter(
        (c) => !c.industry || c.industry === "general" || c.industry === industry,
      );
      for (const c of eligible) {
        expect(`${c.title} ${c.text}`, c.id).not.toMatch(
          /patient|\bPMS\b|HIPAA|\bOCR\b|ePHI|\bPHI\b|dental|clinical/i,
        );
      }
    });
  }
});

describe("retrieveKnowledge", () => {
  it("ranks hits 1..k in descending score and honours topK", () => {
    const hits = retrieveKnowledge("segregation of duties bank reconciliation", { topK: 3 });
    expect(hits.length).toBeLessThanOrEqual(3);
    expect(hits.length).toBeGreaterThan(0);
    hits.forEach((h, i) => expect(h.rank).toBe(i + 1));
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it("finds the dental cash chunk for a dental caller but never serves it to retail", () => {
    const q = "cash deposits front desk patient payments";
    const dental = retrieveKnowledge(q, { topK: 10, industry: "dental" });
    expect(dental.map((h) => h.chunk.id)).toContain("sod-dental-cash");

    const retail = retrieveKnowledge(q, { topK: 50, industry: "retail" });
    expect(retail.length).toBeGreaterThan(0);
    for (const h of retail) {
      expect(["retail", "general", undefined], h.chunk.id).toContain(h.chunk.industry);
    }
  });

  it("restricts to one domain when asked", () => {
    const hits = retrieveKnowledge("fraud cash controls", { topK: 20, domain: "retail_ops" });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.chunk.domain).toBe("retail_ops");
  });

  it("returns nothing for a query with no overlap", () => {
    expect(retrieveKnowledge("zxqv wplm")).toEqual([]);
    expect(formatRetrievalForPrompt([])).toBe("No corpus hits.");
  });
});
