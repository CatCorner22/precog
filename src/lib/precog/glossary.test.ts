import { describe, expect, it } from "vitest";
import { PRIORITY_SCALE, RISK_SCALE } from "./scoring/bands";
import { bandForScore } from "./scoring/weights";
import { TAB_IDS } from "./navigation";
import { GLOSSARY, glossaryForTab } from "./glossary";

/** Syllables in one word: vowel groups, less a silent final e, at least one. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g)?.length ?? 1;
  const silentE = /[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) && groups > 1 ? 1 : 0;
  return Math.max(1, groups - silentE);
}

/** Flesch-Kincaid grade of a passage. */
function fkGrade(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => /\w/.test(s)).length || 1;
  const words = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

/** The words the evaluation found owners did not understand, plus the plan's list. */
const REQUIRED = [
  "Duty conflict",
  "Dual release",
  "Residual risk",
  "Custody",
  "Stand-in",
  "Pioneer",
  "Plain and Tactical",
  "Unverified",
  "Exception",
  "Fix first",
  "Severe, High, Moderate, Low",
  "Detective control",
  "Register",
  "Control evidence log",
  "Self-review risk",
  "Positive Pay",
];

describe("the glossary", () => {
  it("defines every term the plan and the evaluation name, once each", () => {
    const terms = GLOSSARY.map((t) => t.term);
    for (const term of REQUIRED) expect(terms, term).toContain(term);
    expect(new Set(terms).size).toBe(terms.length);
    expect(new Set(GLOSSARY.map((t) => t.id)).size).toBe(GLOSSARY.length);
  });

  it("calls Pioneer Precog's assistant that answers from the owner's own records", () => {
    expect(GLOSSARY.find((t) => t.term === "Pioneer")?.definition).toMatch(
      /^Precog's assistant; it answers from your own records\./,
    );
  });

  it("gives each term one or two plain sentences at grade 8 or lower", () => {
    for (const { term, definition } of GLOSSARY) {
      const sentences = definition.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length;
      expect(sentences, term).toBeGreaterThanOrEqual(1);
      expect(sentences, term).toBeLessThanOrEqual(2);
      expect(fkGrade(definition), `${term}: ${definition}`).toBeLessThanOrEqual(8);
    }
  });

  it("follows the product's wording rules", () => {
    for (const { term, definition } of GLOSSARY) {
      expect(definition, term).not.toMatch(/\bshould\b|\be\.g\.|\bthe app\b|\bbackup\b/i);
    }
  });

  it("states the band cutoffs Precog scores with", () => {
    const bands = GLOSSARY.find((t) => t.term === "Severe, High, Moderate, Low")!.definition;
    expect(bands).toBe(
      `The four bands for residual risk. Severe is ${RISK_SCALE.critical} or more, High is ${RISK_SCALE.actNow} to ${RISK_SCALE.critical - 1}, Moderate is ${RISK_SCALE.mitigate} to ${RISK_SCALE.actNow - 1}, and Low is under ${RISK_SCALE.mitigate}.`,
    );
    expect(bandForScore(RISK_SCALE.critical).label).toBe("Severe");
    expect(GLOSSARY.find((t) => t.term === "Fix first")!.definition).toContain(
      `${PRIORITY_SCALE.top} or more`,
    );
  });

  it("puts the words a page uses first, and still lists every word", () => {
    for (const tab of TAB_IDS) {
      const { here, other } = glossaryForTab(tab);
      expect(here.length, tab).toBeGreaterThan(0);
      expect(here.length + other.length).toBe(GLOSSARY.length);
    }
    expect(glossaryForTab("residual").here.map((t) => t.term)).toContain("Residual risk");
    expect(glossaryForTab("monthly").here.map((t) => t.term)).toContain("Exception");
  });
});
