import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile, type DecisionEntry, type DecisionReview } from "../practice-profile";
import { buildControlReportModel } from "./build-control-report";
import {
  continuityFollowThrough,
  decisionLog,
  decisionStatus,
  executiveSummary,
  REPORT_CAVEATS,
} from "./report-summary";

function decision(id: string, extra: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id,
    createdAt: "2026-09-01T12:00:00.000Z",
    subject: `Decision ${id}`,
    kind: "remediate",
    note: "",
    ...extra,
  };
}

function review(outcome: DecisionReview["outcome"]): DecisionReview {
  return { at: "2026-09-10T12:00:00.000Z", outcome } as DecisionReview;
}

describe("decisionStatus", () => {
  it("reads open, closed as done, and closed as no longer relevant", () => {
    expect(decisionStatus(decision("a"))).toBe("open");
    expect(decisionStatus(decision("b", { status: "closed", reviews: [review("done")] }))).toBe(
      "closed as done",
    );
    expect(
      decisionStatus(decision("c", { status: "closed", reviews: [review("no_longer_relevant")] })),
    ).toBe("closed as no longer relevant");
  });
});

describe("decisionLog", () => {
  it("shows the ten newest with their status and counts the rest", () => {
    const decisions = Array.from({ length: 14 }, (_, i) =>
      decision(`d${i}`, i < 5 ? { status: "closed", reviews: [review("done")] } : {}),
    );
    const log = decisionLog(decisions);
    expect(log.shown).toHaveLength(10);
    expect(log.more).toBe(4);
    expect(log.shown[0].status).toBe("closed as done");
    expect(log.shown[9].status).toBe("open");
  });

  it("leaves nothing out when the log is short", () => {
    expect(decisionLog([decision("a")]).more).toBe(0);
  });
});

describe("continuityFollowThrough", () => {
  const linked = (id: string, extra: Partial<DecisionEntry> = {}) =>
    decision(id, {
      linkedTab: "knowledge",
      linkedId: `k-${id}`,
      linkedIndustry: "dental",
      ...extra,
    });

  it("counts open, done and dropped steps in one pass, open ones by earliest review", () => {
    const result = continuityFollowThrough(
      [
        linked("late", { reviewBy: "2026-12-01" }),
        linked("early", { reviewBy: "2026-10-01" }),
        linked("done", { status: "closed", reviews: [review("done")] }),
        linked("dropped", { status: "closed", reviews: [review("no_longer_relevant")] }),
        decision("unlinked"),
        linked("other-industry", { linkedIndustry: "retail" }),
      ],
      "dental",
    );
    expect(result.total).toBe(4);
    expect(result.open.map((d) => d.id)).toEqual(["early", "late"]);
    expect(result.done).toBe(1);
    expect(result.dropped).toBe(1);
  });
});

describe("executive summary", () => {
  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: plain sentences, none of the threat screen's jargon",
    (industry) => {
      const profile = defaultProfile(industry);
      const tpl = resolveTemplate(profile);
      const model = buildControlReportModel({
        tpl,
        profile,
        mapCustomized: false,
        today: "2026-09-26",
        trackFreshness: false,
        mapReady: false,
        businessName: "Sample",
      });
      const text = model.summary.join(" ");
      expect(model.summary.length).toBeGreaterThan(1);
      expect(text).not.toMatch(/AO:|act-now|static segregation|Leading indicators|\(s\)/);
      expect(text).toMatch(/duty conflict/);
    },
  );

  it("says continuity is not assessed rather than printing a figure", () => {
    const lines = executiveSummary({
      conflicts: [],
      firstStep: null,
      registerReady: false,
      coverageIndex: 0,
      singlePoints: 0,
      mapHealth: null,
      topPriority: null,
    });
    expect(lines).toEqual([
      "No open duty conflicts: no one person holds two duties that should be split.",
      "Continuity is not assessed yet: nobody is marked on the register of duties and know-how.",
    ]);
  });

  it("writes its own caveats instead of the threat screen's demo-priors line", () => {
    expect(REPORT_CAVEATS).not.toMatch(/demo priors/);
  });
});
