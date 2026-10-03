import { describe, expect, it } from "vitest";
import type { IndustryId } from "../industry";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
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

describe("runMetaAnalysis follows the business's own facts", () => {
  it("drops the 'read every index with the gaps in mind' line once the bank is reconciled independently", () => {
    const base = defaultProfile("dental");
    const without = runMetaAnalysis({
      ...base,
      staff: { ...base.staff, independentBankRec: false },
    });
    const withRec = runMetaAnalysis({
      ...base,
      staff: { ...base.staff, independentBankRec: true },
    });
    const line = /Read every index here with the gaps in mind/;
    expect(without.recommendations.some((r) => line.test(r))).toBe(true);
    expect(withRec.recommendations.some((r) => line.test(r))).toBe(false);
  });

  it("asks for dual release and a first decision only while they are missing", () => {
    const base = defaultProfile("retail");
    const bare = runMetaAnalysis({ ...base, decisions: [] });
    expect(bare.recommendations[0]).toBe(
      "Give Precog more to work with: turn on dual release and log a first decision in the Decisions log.",
    );
    const done = runMetaAnalysis({
      ...base,
      dualRelease: { ...base.dualRelease, enabled: true },
      decisions: [
        {
          id: "d1",
          createdAt: "2026-01-01",
          subject: "Bank rec",
          kind: "remediate",
          note: "",
        },
      ],
    });
    expect(done.recommendations.join(" ")).not.toMatch(/Give the app more to work with/);
  });

  it("words the Journal gap from the entries it has", () => {
    const gap = (decisions: PracticeProfile["decisions"]) =>
      runMetaAnalysis({ ...defaultProfile("general"), decisions }).items.find(
        (i) => i.id === "ku-decision-followthrough",
      )!.description;
    expect(gap([])).toBe("No Decisions log entry yet, so no fix has a recorded review.");
    expect(
      gap([
        { id: "a", createdAt: "2026-01-01", subject: "x", kind: "remediate", note: "" },
        {
          id: "b",
          createdAt: "2026-01-02",
          subject: "y",
          kind: "remediate",
          note: "",
          reviews: [
            {
              at: "2026-02-01",
              outcome: "done",
              snapshot: {} as never,
            },
          ],
        },
      ]),
    ).toBe("2 Decisions log entries, 1 with a review recorded.");
  });

  it("opens the control list from the cyber gap, where the old control layer opened", () => {
    const cyber = runMetaAnalysis(defaultProfile("general")).items.find(
      (i) => i.id === "uu-cyber-ransomware-ops",
    );
    expect(cyber?.link).toEqual({ tab: "sod", id: "controls" });
  });
});
