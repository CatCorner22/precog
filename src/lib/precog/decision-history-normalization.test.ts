import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./active-template";
import { coverageReport } from "./continuity/coverage";
import { documentationState } from "./continuity/documentation";
import {
  continuitySlips,
  decisionDelta,
  decisionsDue,
  type ContinuityStep,
} from "./decisions/follow-through";
import {
  MAX_DECISION_NOTE,
  MAX_DECISION_REVIEWS,
  defaultProfile,
  normalizeProfile,
  type DecisionEntry,
  type DecisionReview,
  type DecisionSnapshot,
} from "./practice-profile";
import { validateProfileInput } from "./profile-input";
import { buildControlReportModel } from "./report/build-control-report";
import { buildStartHereModel } from "./start-here/model";

const AT = "2026-09-10T12:00:00.000Z";
const DAY = "2026-09-26";

function snapshot(overrides: Partial<DecisionSnapshot> = {}): DecisionSnapshot {
  return {
    at: AT,
    scoringVersion: "residual-v1",
    averageResidual: 58,
    subjectResidual: 42,
    sodOpenConflicts: 4,
    segregationHealth: 81,
    ...overrides,
  };
}

function review(index: number): DecisionReview {
  return {
    at: `2026-09-${String((index % 20) + 1).padStart(2, "0")}T12:00:00.000Z`,
    outcome: index % 2 ? "still_open" : "done",
    note: `review-${index}`,
    snapshot: snapshot(),
  };
}

function legacyDecision(linkedId: string): DecisionEntry {
  return {
    id: "legacy-decision",
    createdAt: "2025-04-02T10:30:00.000Z",
    subject: "Cross-train payroll",
    kind: "remediate",
    note: "Keep the old evidence",
    reviewBy: "2026-10-01",
    residualAtDecision: 63,
    linkedTab: "knowledge",
    linkedId,
    linkedIndustry: "dental",
    linkedStep: "cover",
    linkedPersonId: "p2",
    snapshot: snapshot(),
    reviews: [{ at: AT, outcome: "still_open", note: "In progress", snapshot: snapshot() }],
    status: "open",
  };
}

describe("decision history normalization", () => {
  it("drops hostile nested history without dropping its valid parent or sibling review", () => {
    const base = defaultProfile("dental");
    const tpl = resolveTemplate(base);
    const item = coverageReport(tpl).items[0];
    const valid = review(7);
    const hostile = {
      ...base,
      decisions: [
        {
          id: "hostile",
          createdAt: AT,
          subject: "Keep this decision",
          kind: "remediate",
          note: "",
          reviewBy: "2026-02-30",
          residualAtDecision: Number.POSITIVE_INFINITY,
          linkedTab: "knowledge",
          linkedId: item.item.id,
          linkedIndustry: "unknown",
          linkedStep: "erase",
          status: "finished",
          snapshot: snapshot({
            subjectResidual: Number.NaN,
            continuity: {
              coverageIndex: 80,
              singlePoints: 2,
              itemStatus: "invented",
              itemDocumentation: "lost",
            } as never,
          }),
          reviews: [
            { at: AT, outcome: "done" },
            valid,
            { at: "not-a-date", outcome: "done", snapshot: snapshot() },
            { at: AT, outcome: "invented", snapshot: snapshot() },
            { at: AT, outcome: "done", snapshot: snapshot({ averageResidual: Number.NaN }) },
          ],
        },
      ],
    };

    const loaded = normalizeProfile(hostile as never);
    const [decision] = loaded.decisions;
    expect(decision).toMatchObject({ id: "hostile", subject: "Keep this decision" });
    expect(decision).not.toHaveProperty("reviewBy");
    expect(decision).not.toHaveProperty("residualAtDecision");
    expect(decision).not.toHaveProperty("linkedIndustry");
    expect(decision).not.toHaveProperty("linkedStep");
    expect(decision).not.toHaveProperty("status");
    expect(decision.snapshot).not.toHaveProperty("subjectResidual");
    expect(decision.snapshot?.continuity).toEqual({ coverageIndex: 80, singlePoints: 2 });
    expect(decision.reviews).toEqual([valid]);
  });

  it("caps reviews and review text while retaining the newest valid history", () => {
    const base = defaultProfile("dental");
    const reviews = Array.from({ length: 130 }, (_, index) => ({
      ...review(index),
      note: `${index}:`.padEnd(MAX_DECISION_NOTE + 50, "x"),
    }));
    const loaded = normalizeProfile({
      ...base,
      decisions: [{ ...legacyDecision(resolveTemplate(base).knowledge[0].id), reviews }],
    });

    expect(loaded.decisions[0].reviews).toHaveLength(MAX_DECISION_REVIEWS);
    expect(loaded.decisions[0].reviews?.[0].note?.startsWith("30:")).toBe(true);
    expect(loaded.decisions[0].reviews?.at(-1)?.note).toHaveLength(MAX_DECISION_NOTE);
  });

  it("preserves valid legacy history and is stable over repeated normalization", () => {
    const base = defaultProfile("dental");
    const decision = legacyDecision(resolveTemplate(base).knowledge[0].id);
    const once = normalizeProfile({ ...base, decisions: [decision] });
    const twice = normalizeProfile(JSON.parse(JSON.stringify(once)));

    expect(once.decisions).toEqual([decision]);
    expect(twice.decisions).toEqual(once.decisions);
  });

  it("normalizes hostile client history before save and every downstream consumer stays safe", () => {
    const base = defaultProfile("dental");
    const tpl = resolveTemplate(base);
    const item = coverageReport(tpl).items[0];
    const malformed = {
      ...base,
      decisions: [
        {
          id: "closed",
          createdAt: AT,
          subject: "Closed legacy step",
          kind: "remediate",
          note: "",
          linkedTab: "knowledge",
          linkedId: item.item.id,
          linkedStep: "cover" satisfies ContinuityStep,
          status: "closed",
          reviews: [{ at: AT, outcome: "done" }],
        },
      ],
    };
    const checked = validateProfileInput(malformed as never);
    const loaded = normalizeProfile(checked.profile);
    const now = snapshot({
      continuity: {
        coverageIndex: coverageReport(tpl).coverageIndex,
        singlePoints: coverageReport(tpl).singlePoints.length,
        itemStatus: item.status,
        itemDocumentation: documentationState(item.item),
      },
    });

    expect(checked.profile.decisions[0].reviews).toBeUndefined();
    expect(() => continuitySlips(loaded.decisions, tpl)).not.toThrow();
    expect(() => decisionsDue(loaded.decisions, DAY)).not.toThrow();
    expect(() => decisionDelta(loaded.decisions[0], now)).not.toThrow();
    expect(() =>
      buildStartHereModel({ profile: loaded, template: tpl, today: new Date(`${DAY}T12:00:00`) }),
    ).not.toThrow();
    expect(() =>
      buildControlReportModel({
        tpl,
        profile: loaded,
        mapCustomized: false,
        today: DAY,
        trackFreshness: false,
        mapReady: true,
        businessName: loaded.practiceName,
      }),
    ).not.toThrow();
  });
});
