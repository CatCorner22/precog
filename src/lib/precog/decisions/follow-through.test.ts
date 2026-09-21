import { describe, expect, it } from "vitest";
import { defaultDualReleasePolicy } from "../controls/dual-release";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import { coverageReport, documentationState } from "../continuity/coverage";
import { portfolioSummary } from "../scoring/residual-engine";
import { SCORING_VERSION } from "../scoring/weights";
import { detectSodConflicts } from "../sod/detect";
import type { DecisionEntry, DecisionReview, DecisionSnapshot } from "../practice-profile";
import {
  applyDecisionReview,
  captureContinuitySnapshot,
  captureDecisionSnapshot,
  continuityStepKey,
  continuitySlips,
  decisionDelta,
  decisionsDue,
  linkedContinuityStep,
  linkedKnowledgeId,
  linkedToIndustry,
  localDateKey,
  registerCloseOut,
  slipLabels,
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

describe("continuity snapshots", () => {
  const report = coverageReport(dental);
  const single = report.singlePoints[0];

  it("only knowledge-linked decisions carry a register id", () => {
    expect(linkedKnowledgeId({ linkedTab: "knowledge", linkedId: "k1" }, "dental")).toBe("k1");
    expect(linkedKnowledgeId({ linkedTab: "sod", linkedId: "k1" }, "dental")).toBeUndefined();
    expect(linkedKnowledgeId({ linkedTab: "knowledge" }, "dental")).toBeUndefined();
  });

  it("does not follow a link into another industry's template, which reuses the same ids", () => {
    const dentalLink = {
      linkedTab: "knowledge",
      linkedId: "k3",
      linkedIndustry: "dental",
    } as const;
    expect(linkedKnowledgeId(dentalLink, "dental")).toBe("k3");
    expect(linkedKnowledgeId(dentalLink, "retail")).toBeUndefined();
    expect(linkedToIndustry(dentalLink, "retail")).toBe(false);
    // entries logged before the industry was recorded keep working where they are
    expect(linkedKnowledgeId({ linkedTab: "knowledge", linkedId: "k3" }, "retail")).toBe("k3");
    expect(linkedToIndustry({}, "retail")).toBe(true);
  });

  it("records coverage and the linked item's status, dropping the status when the item is gone", () => {
    expect(captureContinuitySnapshot(dental, single.item.id)).toEqual({
      coverageIndex: report.coverageIndex,
      singlePoints: report.singlePoints.length,
      itemStatus: single.status,
      itemDocumentation: documentationState(single.item),
    });
    expect(captureContinuitySnapshot(dental, "k-deleted")).toEqual({
      coverageIndex: report.coverageIndex,
      singlePoints: report.singlePoints.length,
    });
    const plain = captureDecisionSnapshot(dental, dental.staffComposition, dualRelease, "x");
    expect("continuity" in plain).toBe(false);
    expect(
      captureDecisionSnapshot(
        dental,
        dental.staffComposition,
        dualRelease,
        single.item.name,
        new Date(),
        single.item.id,
      ).continuity?.itemStatus,
    ).toBe(single.status);
  });

  it("shows then-vs-now coverage once a backup is trained", () => {
    const trainee = dental.people.find(
      (p) => p.active && !single.primaries.some((h) => h.id === p.id),
    )!;
    const trained = resolveTemplate({
      industry: "dental",
      customRelations: [
        ...dental.relations,
        { personId: trainee.id, knowledgeId: single.item.id, level: "proficient" },
      ],
    });
    const then = captureDecisionSnapshot(
      dental,
      dental.staffComposition,
      dualRelease,
      single.item.name,
      new Date("2025-01-01T00:00:00.000Z"),
      single.item.id,
    );
    const now = captureDecisionSnapshot(
      trained,
      dental.staffComposition,
      dualRelease,
      single.item.name,
      new Date("2025-02-01T00:00:00.000Z"),
      single.item.id,
    );
    const delta = decisionDelta(
      decision({ linkedTab: "knowledge", linkedId: single.item.id, snapshot: then }),
      now,
    );
    expect(delta?.continuity).toEqual({
      coverageIndex: now.continuity!.coverageIndex - then.continuity!.coverageIndex,
      singlePoints: -1,
      itemThen: single.status,
      itemNow: "covered",
      docsThen: documentationState(single.item),
      docsNow: documentationState(single.item),
    });
    expect(delta!.continuity!.coverageIndex).toBeGreaterThan(0);
    expect(
      decisionDelta(decision({ snapshot: then }), { ...now, continuity: undefined })?.continuity,
    ).toBeUndefined();
  });
});

describe("continuity steps", () => {
  it("treats entries logged before steps existed as coverage moves", () => {
    expect(linkedContinuityStep({})).toBe("cover");
    expect(linkedContinuityStep({ linkedStep: "document" })).toBe("document");
  });

  it("keys distinct steps on the same item separately", () => {
    const keys = new Set([
      continuityStepKey("k1", "cover"),
      continuityStepKey("k1", "handoff"),
      continuityStepKey("k1", "document"),
      continuityStepKey("k1", "locate"),
      continuityStepKey("k2", "cover"),
    ]);
    expect(keys.size).toBe(5);
    expect(continuityStepKey("k1", "cover")).toBe(continuityStepKey("k1", "cover"));
  });

  it("shows then-vs-now documentation once the procedure is written and located", () => {
    const report = coverageReport(dental);
    const unwritten = report.items.find((i) => documentationState(i.item) === "none")!;
    const written = resolveTemplate({
      industry: "dental",
      customKnowledge: dental.knowledge.map((k) =>
        k.id === unwritten.item.id
          ? { ...k, documented: true, procedureLocation: "Shared drive / Procedures" }
          : k,
      ),
    });
    const then = captureDecisionSnapshot(
      dental,
      dental.staffComposition,
      dualRelease,
      unwritten.item.name,
      new Date("2025-01-01T00:00:00.000Z"),
      unwritten.item.id,
    );
    const now = captureDecisionSnapshot(
      written,
      dental.staffComposition,
      dualRelease,
      unwritten.item.name,
      new Date("2025-02-01T00:00:00.000Z"),
      unwritten.item.id,
    );
    const delta = decisionDelta(
      decision({
        linkedTab: "knowledge",
        linkedId: unwritten.item.id,
        linkedStep: "document",
        snapshot: then,
      }),
      now,
    );
    expect(delta?.continuity?.docsThen).toBe("none");
    expect(delta?.continuity?.docsNow).toBe("located");
    expect(delta?.continuity?.itemThen).toBe(delta?.continuity?.itemNow);
  });
});

describe("continuitySlips", () => {
  const report = coverageReport(dental);
  const covered = report.items.find((i) => i.status === "covered")!;
  const closedDone = (overrides: Partial<DecisionEntry> = {}) =>
    decision({
      id: "cont",
      linkedTab: "knowledge",
      linkedId: covered.item.id,
      status: "closed",
      reviews: [
        {
          at: "2025-02-01T00:00:00.000Z",
          outcome: "done",
          snapshot: captureDecisionSnapshot(
            dental,
            dental.staffComposition,
            dualRelease,
            covered.item.name,
            new Date("2025-02-01T00:00:00.000Z"),
            covered.item.id,
          ),
        },
      ],
      ...overrides,
    });
  const backup = covered.primaries[1];
  const withoutBackup = resolveTemplate({
    industry: "dental",
    customRelations: dental.relations.filter(
      (r) => !(r.knowledgeId === covered.item.id && r.personId === backup.id),
    ),
  });

  it("flags a done decision whose item lost a backup, and nothing while coverage holds", () => {
    expect(continuitySlips([closedDone()], dental)).toEqual([]);
    const slips = continuitySlips([closedDone()], withoutBackup);
    expect(slips).toHaveLength(1);
    expect(slips[0].decision.id).toBe("cont");
    expect(slips[0].step).toBe("cover");
    expect(slips[0].measure).toBe("coverage");
    expect(slips[0].from).toBe("covered");
    expect(["single", "thin", "uncovered"]).toContain(slips[0].to);
  });

  it("ignores open, not-relevant, unlinked, legacy and deleted-item decisions", () => {
    const done = closedDone();
    const cases: DecisionEntry[] = [
      closedDone({ id: "open", status: "open" }),
      closedDone({
        id: "irrelevant",
        reviews: [{ ...done.reviews![0], outcome: "no_longer_relevant" }],
      }),
      closedDone({ id: "unlinked", linkedTab: "sod" }),
      closedDone({
        id: "legacy",
        reviews: [
          {
            ...done.reviews![0],
            snapshot: { ...done.reviews![0].snapshot, continuity: undefined },
          },
        ],
      }),
      closedDone({ id: "deleted", linkedId: "k-gone" }),
    ];
    expect(continuitySlips(cases, withoutBackup)).toEqual([]);
  });

  it("does not judge a dental decision against a retail item that happens to share its id", () => {
    const retail = getBaseTemplate("retail");
    const sharesId = retail.knowledge.some((k) => k.id === covered.item.id);
    expect(sharesId).toBe(true);
    expect(continuitySlips([closedDone({ linkedIndustry: "dental" })], retail)).toEqual([]);
    expect(continuitySlips([closedDone({ linkedIndustry: "dental" })], withoutBackup)).toHaveLength(
      1,
    );
  });

  it("uses the latest review, so a reopened-then-fixed decision is judged from its last close", () => {
    const reopened = closedDone({
      reviews: [
        ...closedDone().reviews!,
        {
          at: "2025-03-01T00:00:00.000Z",
          outcome: "still_open",
          snapshot: captureDecisionSnapshot(
            withoutBackup,
            dental.staffComposition,
            dualRelease,
            covered.item.name,
            new Date("2025-03-01T00:00:00.000Z"),
            covered.item.id,
          ),
        },
      ],
      status: "open",
    });
    expect(continuitySlips([reopened], withoutBackup)).toEqual([]);
  });

  it("uses documentation state for document steps", () => {
    const documented = resolveTemplate({
      industry: "dental",
      customKnowledge: dental.knowledge.map((item) => ({
        ...item,
        documented: true,
        procedureLocation: "Shared drive / Procedures",
      })),
    });
    const item = documented.knowledge[0];
    const decisionWithDocumentation = decision({
      id: "document",
      linkedTab: "knowledge",
      linkedId: item.id,
      linkedStep: "document",
      status: "closed",
      reviews: [
        {
          at: "2025-02-01T00:00:00.000Z",
          outcome: "done",
          snapshot: captureDecisionSnapshot(
            documented,
            dental.staffComposition,
            dualRelease,
            item.name,
            new Date("2025-02-01T00:00:00.000Z"),
            item.id,
          ),
        },
      ],
    });
    const slips = continuitySlips([decisionWithDocumentation], dental);
    expect(slips).toHaveLength(1);
    expect(slips[0].step).toBe("document");
    expect(slips[0].measure).toBe("documentation");
    expect(slips[0].from).toBe("located");
    expect(slips[0].to).toBe("none");
  });

  it("does not treat backup loss as a documentation slip", () => {
    const documented = resolveTemplate({
      industry: "dental",
      customKnowledge: dental.knowledge.map((item) => ({
        ...item,
        documented: true,
        procedureLocation: "Shared drive / Procedures",
      })),
    });
    const documentedWithoutBackup = resolveTemplate({
      industry: "dental",
      customKnowledge: documented.knowledge,
      customRelations: dental.relations.filter(
        (r) => !(r.knowledgeId === covered.item.id && r.personId === backup.id),
      ),
    });
    const item = documented.knowledge[0];
    const decisionWithDocumentation = decision({
      linkedTab: "knowledge",
      linkedId: item.id,
      linkedStep: "document",
      status: "closed",
      reviews: [
        {
          at: "2025-02-01T00:00:00.000Z",
          outcome: "done",
          snapshot: captureDecisionSnapshot(
            documented,
            dental.staffComposition,
            dualRelease,
            item.name,
            new Date("2025-02-01T00:00:00.000Z"),
            item.id,
          ),
        },
      ],
    });
    expect(continuitySlips([decisionWithDocumentation], documentedWithoutBackup)).toEqual([]);
  });

  it("uses coverage measure for handoff steps", () => {
    const slips = continuitySlips([closedDone({ linkedStep: "handoff" })], withoutBackup);
    expect(slips).toHaveLength(1);
    expect(slips[0].step).toBe("handoff");
    expect(slips[0].measure).toBe("coverage");
  });

  it("ignores legacy document snapshots without documentation state", () => {
    const prior = closedDone().reviews![0].snapshot;
    const legacy = closedDone({
      linkedStep: "document",
      reviews: [
        {
          ...closedDone().reviews![0],
          snapshot: {
            ...prior,
            continuity: {
              coverageIndex: prior.continuity?.coverageIndex ?? 0,
              singlePoints: prior.continuity?.singlePoints ?? 0,
              itemStatus: prior.continuity?.itemStatus,
              itemDocumentation: undefined,
            },
          },
        },
      ],
    });
    expect(continuitySlips([legacy], dental)).toEqual([]);
  });

  it("labels coverage and documentation slips in lower case", () => {
    const [coverage] = continuitySlips([closedDone({ linkedStep: "handoff" })], withoutBackup);
    const documented = resolveTemplate({
      industry: "dental",
      customKnowledge: dental.knowledge.map((item) => ({
        ...item,
        documented: true,
        procedureLocation: "Shared drive / Procedures",
      })),
    });
    const documentDecision = decision({
      linkedTab: "knowledge",
      linkedId: documented.knowledge[0].id,
      linkedStep: "document",
      status: "closed",
      reviews: [
        {
          ...closedDone().reviews![0],
          snapshot: captureDecisionSnapshot(
            documented,
            dental.staffComposition,
            dualRelease,
            documented.knowledge[0].name,
            new Date("2025-02-01T00:00:00.000Z"),
            documented.knowledge[0].id,
          ),
        },
      ],
    });
    const [documentation] = continuitySlips([documentDecision], dental);
    expect(slipLabels(coverage)).toEqual({
      from: "two or more can do this",
      to: expect.any(String),
    });
    expect(slipLabels(documentation)).toEqual({
      from: "written and findable",
      to: "nothing written down",
    });
  });
});

describe("registerCloseOut", () => {
  const report = coverageReport(dental);
  const single = report.items.find((i) => i.status === "single")!;
  const covered = report.items.find((i) => i.status === "covered")!;
  const coverDecision = (overrides: Partial<DecisionEntry> = {}) =>
    decision({
      linkedTab: "knowledge",
      linkedId: single.item.id,
      linkedStep: "cover",
      ...overrides,
    });

  it("asks who can now run a still-single item alone, preferring the trainee the decision named", () => {
    const suggested = single.suggestedBackups[0].person;
    const out = registerCloseOut(coverDecision(), dental);
    expect(out?.step).toBe("cover");
    if (out?.step !== "cover") throw new Error("expected a cover close-out");
    expect(out.status).toBe("single");
    expect(out.trainee).toBeNull();
    expect(out.candidates[0].id).toBe(suggested.id);
    expect(out.candidates.every((p) => p.active)).toBe(true);
    expect(out.candidates.map((p) => p.id)).not.toContain(single.primaries[0].id);

    const other = out.candidates[out.candidates.length - 1];
    const named = registerCloseOut(coverDecision({ linkedPersonId: other.id }), dental);
    if (named?.step !== "cover") throw new Error("expected a cover close-out");
    expect(named.trainee?.id).toBe(other.id);
  });

  it("returns nothing once the register already shows the outcome", () => {
    expect(registerCloseOut(coverDecision({ linkedId: covered.item.id }), dental)).toBeNull();
    expect(
      registerCloseOut(coverDecision({ linkedPersonId: single.primaries[0].id }), dental)?.step,
    ).toBe("cover");

    const trained = resolveTemplate({
      industry: "dental",
      customRelations: [
        ...dental.relations,
        {
          personId: single.suggestedBackups[0].person.id,
          knowledgeId: single.item.id,
          level: "proficient",
        },
      ],
    });
    expect(registerCloseOut(coverDecision(), trained)).toBeNull();
  });

  it("asks for the write-up or its location for documentation steps, and nothing for handoffs or unlinked entries", () => {
    const undocumented = resolveTemplate({
      industry: "dental",
      customKnowledge: dental.knowledge.map((k) =>
        k.id === single.item.id ? { ...k, documented: false, procedureLocation: undefined } : k,
      ),
    });
    const unlocated = resolveTemplate({
      industry: "dental",
      customKnowledge: dental.knowledge.map((k) =>
        k.id === single.item.id ? { ...k, documented: true, procedureLocation: undefined } : k,
      ),
    });
    const located = resolveTemplate({
      industry: "dental",
      customKnowledge: dental.knowledge.map((k) =>
        k.id === single.item.id ? { ...k, documented: true, procedureLocation: "Drive/ops" } : k,
      ),
    });
    const doc = coverDecision({ linkedStep: "document" });
    const loc = coverDecision({ linkedStep: "locate" });

    expect(registerCloseOut(doc, undocumented)?.step).toBe("document");
    expect(registerCloseOut(doc, unlocated)).toBeNull();
    expect(registerCloseOut(doc, located)).toBeNull();
    expect(registerCloseOut(loc, undocumented)?.step).toBe("locate");
    expect(registerCloseOut(loc, unlocated)?.step).toBe("locate");
    expect(registerCloseOut(loc, located)).toBeNull();

    expect(registerCloseOut(coverDecision({ linkedStep: "handoff" }), dental)).toBeNull();
    expect(registerCloseOut(decision(), dental)).toBeNull();
    expect(registerCloseOut(coverDecision({ linkedId: "missing" }), dental)).toBeNull();
    expect(registerCloseOut(coverDecision({ linkedIndustry: "retail" }), dental)).toBeNull();
  });
});
