import { describe, expect, it } from "vitest";
import { defaultDualReleasePolicy } from "../controls/dual-release";
import { getBaseTemplate } from "../active-template";
import { portfolioSummary } from "../scoring/residual-engine";
import { SCORING_VERSION } from "../scoring/weights";
import { detectSodConflicts } from "../sod/detect";
import type { DecisionEntry, DecisionReview, DecisionSnapshot } from "../practice-profile";
import {
  applyDecisionReview,
  captureDecisionSnapshot,
  decisionDelta,
  decisionsDue,
  localDateKey,
} from "./follow-through";

const dental = getBaseTemplate("dental");
const dualRelease = defaultDualReleasePolicy(dental);

function decision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "d-1",
    createdAt: "2025-01-01T00:00:00.000Z",
    subject: "Practice-wide monitoring",
    kind: "monitor",
    note: "Monitor",
    ...overrides,
  };
}

function review(
  outcome: DecisionReview["outcome"],
  at = "2025-01-15T12:00:00.000Z",
): DecisionReview {
  return {
    at,
    outcome,
    snapshot: {
      at,
      scoringVersion: SCORING_VERSION,
      averageResidual: 50,
      subjectResidual: 60,
      sodOpenConflicts: 3,
      segregationHealth: 72,
    },
  };
}

describe("captureDecisionSnapshot", () => {
  it("captures scoring, residual, SoD, and segregation values", () => {
    const portfolio = portfolioSummary(dental, dental.staffComposition);
    const subject = portfolio.all[0].name;
    const snapshot = captureDecisionSnapshot(
      dental,
      dental.staffComposition,
      dualRelease,
      subject,
      new Date("2025-01-15T12:00:00.000Z"),
    );

    expect(snapshot).toEqual({
      at: "2025-01-15T12:00:00.000Z",
      scoringVersion: SCORING_VERSION,
      averageResidual: portfolio.averageResidual,
      subjectResidual: portfolio.all[0].residual,
      sodOpenConflicts: expect.any(Number),
      segregationHealth: expect.any(Number),
    });
    expect(
      captureDecisionSnapshot(
        dental,
        dental.staffComposition,
        dualRelease,
        "Not a scored subject",
        new Date("2025-01-15T12:00:00.000Z"),
      ).subjectResidual,
    ).toBeUndefined();
  });

  it("counts accepted residual controls as closed SoD conflicts", () => {
    const conflict = detectSodConflicts(dental, dental.staffComposition).conflicts.find(
      (item) => item.linkedControlId,
    );
    expect(conflict?.linkedControlId).toBeDefined();
    const accepted = {
      ...dental,
      controls: dental.controls.map((control) =>
        control.id === conflict?.linkedControlId
          ? { ...control, residualRiskAccepted: true }
          : control,
      ),
    };
    const withoutAcceptance = captureDecisionSnapshot(dental, dental.staffComposition, dualRelease);
    const withAcceptance = captureDecisionSnapshot(
      accepted,
      accepted.staffComposition,
      dualRelease,
    );
    expect(withAcceptance.sodOpenConflicts).toBeLessThan(withoutAcceptance.sodOpenConflicts);
  });
});

describe("decisionsDue", () => {
  it("splits overdue and due-soon decisions and ignores closed or later entries", () => {
    const now = new Date(2025, 0, 15);
    const result = decisionsDue(
      [
        decision({ id: "overdue", reviewBy: "2025-01-14" }),
        decision({ id: "today", reviewBy: "2025-01-15" }),
        decision({ id: "soon", reviewBy: "2025-01-22" }),
        decision({ id: "later", reviewBy: "2025-01-23" }),
        decision({ id: "closed", reviewBy: "2025-01-10", status: "closed" }),
      ],
      now,
    );

    expect(result.overdue.map((d) => d.id)).toEqual(["overdue"]);
    expect(result.dueSoon.map((d) => d.id)).toEqual(["today", "soon"]);
  });

  it("formats local calendar dates", () => {
    expect(localDateKey(new Date(2025, 0, 5))).toBe("2025-01-05");
  });
});

describe("applyDecisionReview", () => {
  it("closes completed and no-longer-relevant decisions", () => {
    const original = decision({ reviews: [review("still_open", "2024-12-01T00:00:00.000Z")] });

    expect(applyDecisionReview(original, review("done"))).toMatchObject({
      status: "closed",
      reviews: [...original.reviews!, review("done")],
    });
    expect(applyDecisionReview(original, review("no_longer_relevant")).status).toBe("closed");
  });

  it("extends still-open decisions and appends reviews in order", () => {
    const original = decision({ reviewBy: "2025-01-15", reviews: [review("still_open")] });
    const next = applyDecisionReview(original, review("still_open"), 30);

    expect(next.status).toBe("open");
    expect(next.reviewBy).toBe("2025-02-14");
    expect(next.reviews).toEqual([...original.reviews!, review("still_open")]);
  });
});

describe("decisionDelta", () => {
  it("returns null when no snapshot exists and signed deltas otherwise", () => {
    const now: DecisionSnapshot = {
      at: "2025-02-01T00:00:00.000Z",
      scoringVersion: SCORING_VERSION,
      averageResidual: 58,
      subjectResidual: 42,
      sodOpenConflicts: 4,
      segregationHealth: 81,
    };
    expect(decisionDelta(decision(), now)).toBeNull();
    expect(
      decisionDelta(
        decision({
          snapshot: {
            at: "2025-01-01T00:00:00.000Z",
            scoringVersion: SCORING_VERSION,
            averageResidual: 71,
            subjectResidual: 55,
            sodOpenConflicts: 6,
            segregationHealth: 74,
          },
        }),
        now,
      ),
    ).toEqual({
      subject: -13,
      average: -13,
      sodOpen: -2,
      segregation: 7,
      comparable: true,
    });
    expect(
      decisionDelta(
        decision({
          snapshot: {
            at: "2025-01-01T00:00:00.000Z",
            scoringVersion: "older-model",
            averageResidual: 71,
            sodOpenConflicts: 6,
            segregationHealth: 74,
          },
        }),
        now,
      )?.comparable,
    ).toBe(false);
  });
});
