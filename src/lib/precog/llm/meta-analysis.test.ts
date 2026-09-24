import { describe, expect, it } from "vitest";
import type { IndustryId } from "../industry";
import { defaultProfile } from "../practice-profile";
import { runMetaAnalysis } from "./meta-analysis";

const OTHERS: IndustryId[] = [
  "retail",
  "restaurant",
  "professional_services",
  "construction",
  "nonprofit",
  "general",
];

function wording(industry: IndustryId): string {
  const report = runMetaAnalysis(defaultProfile(industry));
  return [
    ...report.items.flatMap((i) => [i.title, i.description, i.probe?.action ?? ""]),
    ...report.realtimeCapabilities.flatMap((c) => [c.label, c.description, c.dependency]),
  ].join("\n");
}

describe("Patterns inventory wording", () => {
  for (const industry of OTHERS) {
    it(`speaks of no patients, PMS, HIPAA, Medicaid or dental labs for a ${industry} business`, () => {
      expect(wording(industry)).not.toMatch(
        /patient|\bPMS\b|HIPAA|\bOCR\b|Medicaid|\bDSO\b|ePHI|\blab\b|practices?\b/i,
      );
    });
  }

  it("keeps the dental and medical office terms for a dental or medical office", () => {
    const text = wording("dental");
    expect(text).toContain("PMS void / adjustment audit log");
    expect(text).toContain("Patient refund authorization trail");
    expect(text).toContain("HIPAA / OCR enforcement trajectory");
  });

  it("changes only words: every business gets the same inventory items in the same panes", () => {
    const shape = (industry: IndustryId) =>
      runMetaAnalysis(defaultProfile(industry)).items.map((i) => `${i.id}:${i.classification}`);
    for (const industry of OTHERS) expect(shape(industry)).toEqual(shape("dental"));
  });
});
