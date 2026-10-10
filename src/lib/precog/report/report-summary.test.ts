import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { ownSetupProfile } from "../business-lifecycle";
import { buildOwnTeam } from "../onboarding/own-team";
import { INDUSTRIES } from "../industry";
import {
  defaultProfile,
  type DecisionEntry,
  type DecisionReview,
  type PracticeProfile,
} from "../practice-profile";
import { openFindings, partialDualReleaseCoverage } from "../sod/open-findings";
import { buildControlReportModel } from "./build-control-report";
import {
  concentrationMove,
  continuityFollowThrough,
  decisionLog,
  decisionStatus,
  executiveSummary,
  REPORT_BASIS,
  REPORT_BASIS_TITLE,
  REPORT_CAVEATS,
} from "./report-summary";
import { SPLIT_STEP_WITHOUT_NAMED_ROLE } from "../actions/do-next";

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

const noConflicts = { findings: [], open: 0, critical: 0, ownerHeld: 0, closedByDualRelease: 0 };

const noOpenFindings = {
  conflicts: noConflicts,
  firstStep: null,
  registerReady: false,
  coverageIndex: 0,
  criticalSinglePoints: 0,
  importantSinglePoints: 0,
  mapHealth: null,
  topPriority: null,
};

/** No open finding, with the owner's own pairs and the pairs dual release closes counted apart. */
const closedBy = (over: { ownerHeld?: number; closedByDualRelease?: number }) => ({
  ...noOpenFindings,
  conflicts: { ...noConflicts, ...over },
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

  it("counts open duty conflicts as the rest of the report does, dual release covering only above a threshold included", () => {
    const base = defaultProfile("dental");
    const profile = { ...base, dualRelease: { ...base.dualRelease, enabled: true } };
    const model = buildControlReportModel({
      tpl: resolveTemplate(profile),
      profile,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: false,
      businessName: "Sample",
    });
    const partial = partialDualReleaseCoverage(profile.dualRelease, model.sod.conflicts);
    const open = openFindings(model.sod.conflicts, partial);
    // A pair narrowed only above a threshold stays open, and one closed at
    // every amount does not: the summary must count both ways the same.
    expect(open.some((c) => c.dualReleaseMitigated)).toBe(true);
    expect(model.sod.conflicts.some((c) => c.dualReleaseMitigated && !partial.has(c.ruleId))).toBe(
      true,
    );
    expect(model.summary[0]).toMatch(new RegExp(`^${open.length} open duty conflicts`));
    // The concentration sentence counts against the same open count, not
    // against distinct rules: "10 of the 17", never "10 of the 12 open gaps".
    expect(model.summary[1]).toBe(
      "One person holds 10 of the 17 open duty conflicts; moving one duty, enter write-offs, to someone who holds none of the others closes 4 of them.",
    );
    expect(model.summary.join(" ")).not.toContain("open gaps");
  });

  it("counts the concentration move in the conflict table's rows", () => {
    const profile = defaultProfile("restaurant");
    const model = buildControlReportModel({
      tpl: resolveTemplate(profile),
      profile,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: false,
      businessName: "Sample",
    });
    const open = openFindings(model.sod.conflicts, model.partialCoverage);
    const move = concentrationMove(open);
    expect(move).not.toBeNull();
    const held = open.filter((c) => c.personId === move!.personId);
    expect(move!.held).toBe(held.length);
    expect(model.summary.slice(0, 2)).toEqual([
      "14 open duty conflicts, 3 of them critical, held by 4 people.",
      "One person holds 7 of the 14 open duty conflicts.",
    ]);
    expect(model.summary).toContain(
      "First step: move one duty, record payments received, away from Diego Ramirez to Tom Becker: it closes 3 of the 14 open duty conflicts. Then move prepare bank deposit away from Keisha Moore to Nina Petrova. The two moves close 6 of the 14.",
    );
  });

  /** The report model of `profile` as the report page builds it. */
  const modelOf = (profile: PracticeProfile) =>
    buildControlReportModel({
      tpl: resolveTemplate(profile),
      profile,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: false,
      businessName: "Sample",
    });

  it("pins each sample's concentration sentence, printed only when one person holds half or more", () => {
    const sentences = Object.fromEntries(
      INDUSTRIES.map(({ id }) => [
        id,
        modelOf(defaultProfile(id)).summary.find((line) => line.startsWith("One person holds")) ??
          null,
      ]),
    );
    const move = (held: number, open: number, duty: string, closes: number) =>
      `One person holds ${held} of the ${open} open duty conflicts; moving one duty, ${duty}, to someone who holds none of the others closes ${closes} of them.`;
    expect(sentences).toEqual({
      dental: move(12, 20, "enter write-offs", 4),
      // 7 of the 16 and 5 of the 13 are no longer printed: a minority of the open conflicts.
      retail: null,
      professional_services: move(7, 14, "reconcile the bank account", 3),
      restaurant: "One person holds 7 of the 14 open duty conflicts.",
      construction: move(8, 10, "reconcile the bank account", 3),
      automotive: move(14, 22, "reconcile the bank account", 5),
      nonprofit: move(15, 19, "reconcile the bank account", 5),
      general: null,
    });
  });

  it("never points at a concentrated role the summary does not name", () => {
    const unnamed: string[] = [];
    for (const { id } of INDUSTRIES) {
      const base = defaultProfile(id);
      for (const profile of [
        base,
        { ...base, dualRelease: { ...base.dualRelease, enabled: true } },
      ]) {
        const summary = modelOf(profile).summary;
        if (summary.some((line) => line.startsWith("One person holds"))) continue;
        unnamed.push(id);
        expect(summary.join(" "), id).not.toContain("concentrated role");
      }
    }
    expect(unnamed.length).toBeGreaterThan(0);
    expect(modelOf(defaultProfile("retail")).summary).toContain(
      "First step: move one duty, enter write-offs, away from Sam Nguyen: it closes 3 of the 16 open duty conflicts.",
    );
    // The first step names the person and the duty, against the same open count.
    expect(modelOf(defaultProfile("dental")).summary).toContain(
      "First step: move one duty, enter write-offs, away from Maya Chen: it closes 4 of the 20 open duty conflicts.",
    );
    expect(SPLIT_STEP_WITHOUT_NAMED_ROLE).not.toContain("concentrated");
    // It names no duty: the bank reconciliation may already sit with someone else.
    expect(SPLIT_STEP_WITHOUT_NAMED_ROLE).not.toMatch(/bank/i);
  });

  it("names the person who holds the largest share, never a minority, in the rows it counts", () => {
    let named = 0;
    for (const { id } of INDUSTRIES) {
      const base = defaultProfile(id);
      for (const profile of [
        base,
        { ...base, dualRelease: { ...base.dualRelease, enabled: true } },
      ]) {
        const model = modelOf(profile);
        const open = openFindings(model.sod.conflicts, model.partialCoverage);
        const move = concentrationMove(open);
        const sentence = model.summary.find((line) => line.startsWith("One person holds"));
        expect(Boolean(sentence), id).toBe(Boolean(move));
        if (!move) continue;
        named += 1;
        const byPerson = new Map<string, number>();
        for (const c of open) byPerson.set(c.personId, (byPerson.get(c.personId) ?? 0) + 1);
        expect(move.held * 2, id).toBeGreaterThanOrEqual(open.length);
        expect(move.held, id).toBe(Math.max(...byPerson.values()));
        expect(sentence, id).toContain(`holds ${move.held} of the ${open.length} open`);
      }
    }
    expect(named).toBeGreaterThan(8);
  });

  it("says continuity is not assessed rather than printing a figure", () => {
    const lines = executiveSummary(noOpenFindings);
    expect(lines).toEqual([
      "No one person other than the owner holds two conflicting duties.",
      "Precog has not assessed continuity yet: the register of duties and know-how marks nobody.",
    ]);
  });

  it("names the owner's own pairs instead of saying nobody holds conflicting duties", () => {
    expect(executiveSummary(closedBy({ ownerHeld: 3 }))[0]).toBe(
      "No open duty conflicts among staff. The owner holds 3 pairs of conflicting duties (listed under Segregation of duties as the owner's own duties).",
    );
    expect(executiveSummary(closedBy({ ownerHeld: 1 }))[0]).toContain(
      "The owner holds 1 pair of conflicting duties",
    );
  });

  it("names the pairs dual release closes, after the owner's own", () => {
    expect(executiveSummary(closedBy({ ownerHeld: 2, closedByDualRelease: 1 }))[0]).toBe(
      "No open duty conflicts among staff. The owner holds 2 pairs of conflicting duties (listed under Segregation of duties as the owner's own duties). Dual release covers 1 more.",
    );
    expect(executiveSummary(closedBy({ closedByDualRelease: 2 }))[0]).toBe(
      "No open duty conflicts among staff. Dual release covers 2 pairs of conflicting duties at every amount.",
    );
  });

  it("names the owner's pairs on the report of an owner who holds conflicting duties", () => {
    const profile = ownSetupProfile({
      industry: "general",
      practiceName: "",
      people: buildOwnTeam(
        [
          {
            name: "Ada",
            role: "Owner",
            duties: ["create_vendor", "release_payment", "bank_reconcile"],
          },
          { name: "Bea", role: "Bookkeeper", duties: ["approve_invoices"] },
        ],
        "general",
      ),
    });
    const tpl = resolveTemplate(profile);
    const model = buildControlReportModel({
      tpl,
      profile,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: false,
      businessName: "Ada's",
    });
    const owned = model.sod.conflicts.filter((c) => c.ownerHeld).length;
    expect(owned).toBeGreaterThan(0);
    expect(openFindings(model.sod.conflicts, model.partialCoverage)).toEqual([]);
    expect(model.summary[0]).toBe(
      `No open duty conflicts among staff. The owner holds ${owned} pairs of conflicting duties (listed under Segregation of duties as the owner's own duties).`,
    );
  });

  it("leaves out a figure that is not a number rather than print NaN%", () => {
    const lines = executiveSummary({
      conflicts: noConflicts,
      firstStep: null,
      registerReady: true,
      coverageIndex: Number.NaN,
      criticalSinglePoints: 2,
      importantSinglePoints: 0,
      mapHealth: { score: Number.NaN, bandLabel: "Partial" },
      topPriority: null,
    });
    expect(lines.join(" ")).not.toContain("NaN");
    expect(lines).toHaveLength(1);
  });

  it("reports critical and important single points separately", () => {
    const lines = executiveSummary({
      ...noOpenFindings,
      registerReady: true,
      coverageIndex: 80,
      criticalSinglePoints: 5,
      importantSinglePoints: 2,
    });

    expect(lines).toContain(
      "80% of the work on the register (weighted by how critical it is) has two or more people who can run it alone; 5 critical items rely on one person or nobody, and 2 important items do too.",
    );
  });

  it("omits the important count when none rely on one person or nobody", () => {
    const lines = executiveSummary({
      ...noOpenFindings,
      registerReady: true,
      coverageIndex: 80,
      criticalSinglePoints: 1,
      importantSinglePoints: 0,
    });

    expect(lines.join(" ")).toContain("; 1 critical item relies on one person or nobody.");
    expect(lines.join(" ")).not.toContain("important item");
  });

  it("names critical and important items that are not marked yet", () => {
    const lines = executiveSummary({
      ...noOpenFindings,
      registerReady: true,
      coverageIndex: 80,
      criticalSinglePoints: 1,
      importantSinglePoints: 0,
      notMarkedItems: 6,
    });

    expect(lines.join(" ")).toContain(
      "1 critical item relies on one person or nobody; 6 items not marked yet.",
    );
  });

  it("writes its own caveats instead of the threat screen's demo-priors line", () => {
    expect(REPORT_CAVEATS).not.toMatch(/demo priors/);
  });
});

describe("basis and limitations", () => {
  it("says what the report is not and where its figures come from", () => {
    expect(REPORT_BASIS_TITLE).toBe("Basis and limitations");
    expect(REPORT_BASIS).toBe(
      "This report is not an audit, review or attestation engagement under AICPA standards. Precog did not verify system access, bank records or the duties reported; duties are as the business entered them. Scores are indexes computed from those entries. Scenario figures are assumptions, and case figures describe other businesses.",
    );
    expect(REPORT_BASIS).toContain("not an audit");
    expect(REPORT_BASIS).not.toMatch(/demo priors/);
  });
});
