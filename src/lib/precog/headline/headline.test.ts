import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { pilotMetrics } from "../firm/engagement";
import { INDUSTRIES, type IndustryId } from "../industry";
import { defaultProfile, type DecisionEntry, type PracticeProfile } from "../practice-profile";
import { buildControlReportModel } from "../report/build-control-report";
import { buildStartHereModel } from "../start-here/model";
import type { DetectedConflict } from "../sod/detect";
import { partialDualReleaseCoverage } from "../sod/open-findings";
import { rankedActionPlan, type ActionStepTier } from "./action-plan";
import { splitStepLabel } from "../actions/do-next";
import { openFindings } from "../sod/open-findings";
import { acceptanceDates, openConflictHeadline } from "./open-conflicts";

const TODAY = "2026-09-26";

function screens(profile: PracticeProfile) {
  const tpl = resolveTemplate(profile);
  const report = buildControlReportModel({
    tpl,
    profile,
    mapCustomized: false,
    today: TODAY,
    trackFreshness: false,
    mapReady: true,
    businessName: "Sample",
  });
  const start = buildStartHereModel({ profile, template: tpl, today: new Date(2026, 8, 26) });
  const firm = pilotMetrics({
    conflicts: report.sod.conflicts,
    partialCoverage: partialDualReleaseCoverage(profile.dualRelease, report.sod.conflicts),
    decisions: profile.decisions,
    industry: profile.industry,
  });
  return { tpl, report, start, firm };
}

const withDualRelease = (id: IndustryId): PracticeProfile => {
  const base = defaultProfile(id);
  return { ...base, dualRelease: { ...base.dualRelease, enabled: true } };
};

const variants = INDUSTRIES.flatMap(({ id }) => [
  { name: id, profile: defaultProfile(id) },
  { name: `${id} with dual release`, profile: withDualRelease(id) },
]);

describe("one open count on Start here, the report and the firm's client list", () => {
  for (const { name, profile } of variants) {
    it(`shows the same open count for the ${name} sample`, () => {
      const { report, start, firm } = screens(profile);
      const headline = openConflictHeadline(report.sod, report.partialCoverage);
      // Start here's model, read through the same definition.
      const startHeadline = openConflictHeadline(
        { conflicts: start.exposure.openConflicts },
        start.exposure.partialCoverage,
      );
      expect(startHeadline.open).toBe(headline.open);
      expect([start.figures.openCritical, start.figures.openHigh]).toEqual([
        headline.critical,
        headline.high,
      ]);
      expect(firm.openFindings).toBe(headline.open);
      expect(headline.critical + headline.high + headline.other).toBe(headline.open);
      expect(headline.medium + headline.family).toBe(headline.other);
      // The report's summary prints the same count, and its concentration
      // sentence counts against it rather than against distinct rules.
      if (headline.open > 0) {
        expect(report.summary[0]).toMatch(new RegExp(`^${headline.open} open duty conflicts?`));
      }
      for (const line of report.summary) {
        const of = /holds \d+ of the (\d+) open duty conflicts/.exec(line);
        if (of) expect(Number(of[1])).toBe(headline.open);
        expect(line).not.toContain("open gaps");
      }
    });
  }

  it("pins each sample's open count and breakdown", () => {
    const pins = Object.fromEntries(
      variants.map(({ name, profile }) => {
        const { report } = screens(profile);
        const h = openConflictHeadline(report.sod, report.partialCoverage);
        return [
          name,
          [h.open, h.critical, h.high, h.other, h.reducedNotClosed, h.closedByDualRelease],
        ];
      }),
    );
    // [open, critical, high, other, reduced not closed, closed by dual release]
    expect(pins).toEqual({
      dental: [20, 4, 15, 1, 0, 0],
      "dental with dual release": [17, 3, 13, 1, 4, 3],
      retail: [16, 6, 10, 0, 0, 0],
      "retail with dual release": [12, 4, 8, 0, 2, 4],
      professional_services: [14, 6, 8, 0, 0, 0],
      "professional_services with dual release": [9, 4, 5, 0, 2, 5],
      restaurant: [14, 3, 11, 0, 0, 0],
      "restaurant with dual release": [11, 2, 9, 0, 1, 3],
      construction: [10, 5, 5, 0, 0, 0],
      "construction with dual release": [7, 4, 3, 0, 0, 3],
      automotive: [22, 7, 14, 1, 0, 0],
      "automotive with dual release": [19, 6, 12, 1, 0, 3],
      nonprofit: [19, 8, 11, 0, 0, 0],
      "nonprofit with dual release": [16, 7, 9, 0, 2, 3],
      general: [13, 4, 9, 0, 0, 0],
      "general with dual release": [8, 2, 6, 0, 2, 5],
    });
  });
});

describe("openConflictHeadline", () => {
  const finding = (over: Partial<DetectedConflict>) =>
    ({
      id: "p1:rule-a",
      ruleId: "rule-a",
      severity: "high",
      ownerHeld: false,
      residualRiskAccepted: false,
      dualReleaseMitigated: false,
      ...over,
    }) as DetectedConflict;

  it("counts accepted findings as open, and the owner's and dual-release-closed pairs apart", () => {
    const partial = new Map([["rule-b", 500]]);
    const h = openConflictHeadline(
      {
        conflicts: [
          finding({ id: "a", severity: "critical", residualRiskAccepted: true }),
          finding({ id: "b", ruleId: "rule-b", dualReleaseMitigated: true }),
          finding({ id: "c", ruleId: "rule-c", dualReleaseMitigated: true }),
          finding({ id: "d", ownerHeld: true }),
          finding({ id: "e", severity: "medium" }),
          finding({ id: "f", severity: "family" }),
        ],
      },
      partial,
      new Map([["e", "2026-09-01"]]),
    );
    expect({ ...h, findings: h.findings.map((c) => c.id) }).toEqual({
      findings: ["a", "b", "e", "f"],
      open: 4,
      critical: 1,
      high: 1,
      medium: 1,
      family: 1,
      other: 2,
      reducedNotClosed: 1,
      acceptedOpen: 2,
      ownerHeld: 1,
      closedByDualRelease: 1,
    });
  });
});

describe("acceptanceDates", () => {
  const entry = (over: Partial<DecisionEntry>): DecisionEntry => ({
    id: "d1",
    createdAt: "2026-09-01T15:00:00.000Z",
    subject: "Accept the cash pair",
    kind: "accept_residual",
    note: "",
    linkedTab: "sod",
    linkedId: "rule-cash-rec",
    linkedIndustry: "dental",
    ...over,
  });
  const conflicts = [
    { id: "p1:rule-cash-rec", ruleId: "rule-cash-rec", linkedControlId: "c-sod-cash" },
    { id: "p2:rule-other", ruleId: "rule-other", linkedControlId: "c-other" },
  ];

  it("gives the newest acceptance's day for the findings it is logged against", () => {
    const dates = acceptanceDates(
      conflicts,
      [entry({}), entry({ id: "d2", createdAt: "2026-09-20T09:00:00.000Z" })],
      "dental",
    );
    expect([...dates]).toEqual([["p1:rule-cash-rec", "2026-09-20"]]);
  });

  it("ignores other decisions, other industries, and findings judged not valid", () => {
    expect(acceptanceDates(conflicts, [entry({ kind: "remediate" })], "dental").size).toBe(0);
    expect(acceptanceDates(conflicts, [entry({ linkedIndustry: "retail" })], "dental").size).toBe(
      0,
    );
    expect(
      acceptanceDates(
        conflicts,
        [
          entry({
            disposition: {
              verdict: "not_valid",
              reason: "duty_not_held",
              at: "2026-09-01T15:00:00.000Z",
            },
          } as Partial<DecisionEntry>),
        ],
        "dental",
      ).size,
    ).toBe(0);
  });
});

describe("rankedActionPlan", () => {
  const TIER: Record<ActionStepTier, number> = { critical: 0, high: 1, other: 2 };

  for (const { name, profile } of variants) {
    it(`lists each duty pair and control once, critical first, for the ${name} sample`, () => {
      const { report } = screens(profile);
      const plan = rankedActionPlan(profile, report.sod, {
        partial: report.partialCoverage,
        weekly: report.actions,
      });
      expect(plan.length).toBeGreaterThan(0);
      const keys = plan.flatMap((s) => s.keys);
      expect(new Set(keys).size).toBe(keys.length);
      const tiers = plan.map((s) => TIER[s.tier]);
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
      for (const step of plan) {
        expect(step.what).not.toMatch(/camera|premium credit/i);
        expect(step.minutes).toBeGreaterThan(0);
        expect(step.closes).toBeGreaterThanOrEqual(0);
      }
      if (profile.dualRelease.enabled) {
        expect(plan.some((s) => s.keys.includes("control:dual-release-above-threshold"))).toBe(
          false,
        );
      }
    });
  }

  it("leads with the concentration move, counted against the open conflicts", () => {
    const profile = defaultProfile("restaurant");
    const { report } = screens(profile);
    const [first] = rankedActionPlan(profile, report.sod, {
      partial: report.partialCoverage,
      weekly: report.actions,
    });
    expect(first).toMatchObject({
      who: "Keisha Moore",
      what: "Move enter write-offs from Keisha to someone who holds none of Keisha's other duties",
      minutes: 60,
      closes: 3,
      source: "concentration",
      tier: "critical",
    });
    // The move is the "split one duty out" control, so that control is not listed again.
    expect(first.keys).toContain("control:split-one-duty-out");
  });

  it("drops a weekly step that repeats a control or a duty pair already on the plan", () => {
    const profile = defaultProfile("dental");
    const { report } = screens(profile);
    const weekly = [
      { id: "bank-rec", title: "Start owner weekly bank reconciliation", effort: "low" as const },
      { id: "bank-rec-again", title: "Something else", effort: "low" as const },
      { id: "sod-rule-writeoff", title: "Split write-offs", effort: "medium" as const },
      { id: "tornado-cameras", title: "Install security cameras", effort: "low" as const },
      {
        id: "premium-stack",
        title: "Stack controls for the premium credit",
        effort: "low" as const,
      },
    ];
    const plan = rankedActionPlan(profile, report.sod, { partial: report.partialCoverage, weekly });
    const whats = plan.map((s) => s.what);
    // The owner's bank reading is a ranked control already; the write-off
    // pair is the concentration move's.
    expect(whats).not.toContain("Start owner weekly bank reconciliation");
    expect(whats).not.toContain("Split write-offs");
    expect(whats).toContain("Something else");
    expect(whats.some((w) => /camera|premium credit/i.test(w))).toBe(false);
  });

  it("keys a week's hand-off by its duty pair and ranks it by that pair", () => {
    for (const { name, profile } of variants) {
      const { report } = screens(profile);
      const plan = rankedActionPlan(profile, report.sod, {
        partial: report.partialCoverage,
        weekly: report.actions,
      });
      expect(
        plan.some((s) => s.keys.some((k) => k.startsWith("weekly:map-heat-"))),
        name,
      ).toBe(false);
      const open = openConflictHeadline(report.sod, report.partialCoverage).findings;
      for (const action of report.actions.filter((a) => a.id.startsWith("map-heat-"))) {
        const pair = open.find((c) => c.ruleId === action.ruleId && c.personId === action.personId);
        expect(pair, `${name}: ${action.title}`).toBeDefined();
        const step = plan.find((s) => s.what === action.title);
        if (!step) {
          // Merged into the step that already stands for the pair.
          expect(plan.some((s) => s.keys.includes(`pair:${action.ruleId}`))).toBe(true);
          continue;
        }
        expect(step.keys, `${name}: ${action.title}`).toEqual([`pair:${action.ruleId}`]);
        // The step is about the person whose duty moves, as the concentration move is.
        expect(step.who, `${name}: ${action.title}`).toBe(pair!.personName);
        const severity = pair!.severity;
        expect(step.tier, `${name}: ${action.title}`).toBe(
          severity === "critical" || severity === "high" ? severity : "other",
        );
        expect(step.closes, `${name}: ${action.title}`).toBe(1);
      }
    }
  });

  it("merges the week's hand-off into the concentration move on the same pair", () => {
    const profile = defaultProfile("dental");
    const { report } = screens(profile);
    const plan = rankedActionPlan(profile, report.sod, {
      partial: report.partialCoverage,
      weekly: report.actions,
    });
    const handOff = report.actions.find((a) => a.id === "map-heat-proc-claims");
    expect(handOff?.title).toBe("Have someone other than Maya enter write-offs");
    expect(plan[0].what).toBe(
      "Move enter write-offs from Maya to someone who holds none of Maya's other duties",
    );
    expect(plan[0].keys).toContain("pair:rule-writeoff");
    expect(plan.map((s) => s.what)).not.toContain(handOff?.title);
  });

  it("names the board treasurer for a business with no owner", () => {
    const profile = defaultProfile("nonprofit");
    const { report } = screens(profile);
    const plan = rankedActionPlan(profile, report.sod, { partial: report.partialCoverage });
    expect(
      plan.filter((s) => s.source !== "concentration").every((s) => s.who === "Board treasurer"),
    ).toBe(true);
  });

  it("words the split step as Start here and the report do, never the catalog's label", () => {
    let listed = 0;
    for (const { name, profile } of [
      ...variants,
      // Nobody holds half the open conflicts, so no concentration move leads.
      { name: "general", profile: defaultProfile("general") },
    ]) {
      const { report } = screens(profile);
      const plan = rankedActionPlan(profile, report.sod, { partial: report.partialCoverage });
      const open = openFindings(report.sod.conflicts, report.partialCoverage);
      for (const step of plan) {
        expect(step.what, name).not.toMatch(/concentrated role/);
        if (step.source === "first-step" && step.keys.includes("control:split-one-duty-out")) {
          listed++;
          expect(step.what, name).toBe(splitStepLabel(open));
        }
      }
    }
    expect(listed).toBeGreaterThan(0);
  });

  it("is empty for a business with no open conflict and no week's actions", () => {
    const profile = defaultProfile("dental");
    expect(rankedActionPlan(profile, { conflicts: [] }, { partial: new Map() })).toEqual([]);
  });
});
