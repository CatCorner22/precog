import { describe, expect, it } from "vitest";
import { deleteDecisionPrompt, reviewDelta } from "./decision-journal-text";
import type { DecisionEntry, DecisionSnapshot } from "@/lib/precog/practice-profile";

const then: DecisionSnapshot = {
  at: "2026-09-01T12:00:00.000Z",
  scoringVersion: "v1",
  averageResidual: 42,
  subjectResidual: 95,
  sodOpenConflicts: 3,
  segregationHealth: 60,
};

const entry = (snapshot: DecisionSnapshot): DecisionEntry => ({
  id: "d1",
  createdAt: snapshot.at,
  subject: "Payroll",
  kind: "remediate",
  note: "",
  snapshot,
});

describe("reviewDelta", () => {
  it("names the continuity figure by the register's labels, not 'single points'", () => {
    const withContinuity = { ...then, continuity: { coverageIndex: 40, singlePoints: 5 } };
    const now = { ...then, continuity: { coverageIndex: 45, singlePoints: 4 } };
    const line = reviewDelta(entry(withContinuity), now);
    expect(line).not.toMatch(/single points/i);
    expect(line).toContain(
      'must-do items marked "Only one person" or "Nobody can do this alone" 5 → 4 (down 1, better)',
    );
    expect(line).toContain("with a stand-in 40% → 45% (up 5, better)");
  });

  it("says which way the exposure moved and whether that is better", () => {
    const line = reviewDelta(entry(then), { ...then, subjectResidual: 88, sodOpenConflicts: 4 });
    expect(line).toBe(
      "still exposed 95 → 88 (down 7, better) · open duty conflicts 3 → 4 (up 1, worse)",
    );
  });

  it("falls back to the average without a subject score", () => {
    const { subjectResidual: _unused, ...noSubject } = then;
    const line = reviewDelta(entry(noSubject), { ...noSubject, averageResidual: 42 });
    expect(line).toBe(
      "average still exposed 42 → 42 (no change) · open duty conflicts 3 → 3 (no change)",
    );
  });

  it("refuses to compare across scoring models", () => {
    expect(reviewDelta(entry(then), { ...then, scoringVersion: "v2" })).toMatch(
      /Precog cannot compare the figures/,
    );
  });
});

describe("deleteDecisionPrompt", () => {
  it("warns that reviews on record go with the entry", () => {
    const review = { at: then.at, outcome: "still_open" as const, snapshot: then };
    expect(deleteDecisionPrompt({ subject: "Payroll", reviews: [review, review] })).toBe(
      'Delete "Payroll" from the Decisions log? Precog also deletes its 2 reviews on record. You cannot undo this.',
    );
    expect(deleteDecisionPrompt({ subject: "Payroll" })).toBe(
      'Delete "Payroll" from the Decisions log? You cannot undo this.',
    );
  });
});
