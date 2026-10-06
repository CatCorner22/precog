import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./active-template";
import { getIndustryTemplate } from "./templates";
import { defaultProfile } from "./practice-profile";
import { rankDangerousScenarios } from "./engine";
import { buildThreatAssessment, fixFirstCount, fixFirstOf, rankTargets } from "./threat-scoring";
import { PRIORITY_BAND_LABEL, priorityBand } from "./map-vision";
import { CONFLICT_SEVERITY_KEY } from "./scoring/bands";
import { INDUSTRIES, type IndustryId } from "./industry";
import { detectSodConflicts, sodDetectionOptions } from "./sod/detect";
import { openFindings, partialDualReleaseCoverage } from "./sod/open-findings";
import type { Person } from "./types";

const people: Person[] = [
  { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] },
  {
    id: "own-2",
    name: "Ben Ochoa",
    role: "Bookkeeper",
    active: true,
    entitlements: ["create_vendor", "release_payment", "view_reports_only"],
  },
];

describe("buildThreatAssessment for an own business", () => {
  const own = resolveTemplate({
    industry: "restaurant",
    customPeople: people,
    customRelations: [],
  });
  const p = defaultProfile("restaurant");

  it("leaves out the sample register and sample scenarios, and says so", () => {
    const report = buildThreatAssessment({
      tpl: own,
      practiceName: "Tavern",
      staff: p.staff,
      riskVariables: p.riskVariables,
    });
    expect(report.targetDeck.some((t) => t.domain === "knowledge")).toBe(false);
    expect(report.targetDeck.some((t) => t.domain === "scenario")).toBe(false);
    for (const k of own.knowledge) {
      expect(report.targetDeck.some((t) => t.label === k.name)).toBe(false);
    }
    for (const s of own.scenarios) {
      expect(report.targetDeck.some((t) => t.label === s.title)).toBe(false);
    }
    expect(report.missionBrief).toContain(
      "Know-how: Register not assessed yet: mark who can do each item on Who knows what.",
    );
    expect(report.missionBrief.some((l) => l.startsWith("Scenarios: Sample scenarios"))).toBe(true);
  });

  it("counts a scenario the owner confirmed, with the day figure in plain words", () => {
    const report = buildThreatAssessment({
      tpl: own,
      practiceName: "Tavern",
      staff: p.staff,
      riskVariables: p.riskVariables,
      confirmedScenarioIds: new Set(["sc-vendor-fraud"]),
    });
    // Grouped into the row of the vendor pair it plays out, which keeps its loss.
    const row = report.targetDeck.find((t) => t.members?.includes("scen-sc-vendor-fraud"));
    expect(row?.kinds).toContain("scenario");
    expect(row?.expectedLoss).toBeGreaterThan(0);
    const reasons = report.targetDeck.flatMap((t) => t.reasons);
    expect(reasons.join(" ")).not.toMatch(/p50/);
    for (const t of report.targetDeck.filter((x) => x.domain === "scenario")) {
      expect(t.reasons[0]).toMatch(/^about \d+ assumed days until found$/);
    }
  });
});

describe("buildThreatAssessment for the sample", () => {
  it("counts sole and unowned knowledge separately", () => {
    const tpl = getIndustryTemplate("dental");
    const p = defaultProfile("dental");
    const report = buildThreatAssessment({ tpl, practiceName: "x", staff: p.staff });
    expect(report.missionBrief).toContain(
      "Know-how: 5 items only one person can do; 0 nobody can.",
    );
  });

  it("writes the executive summary and footer without military or internal shorthand", () => {
    const tpl = getIndustryTemplate("dental");
    const p = defaultProfile("dental");
    const report = buildThreatAssessment({ tpl, practiceName: "Bright Smiles", staff: p.staff });
    const text = [...report.missionBrief, ...report.roeSummary, ...report.caveats].join(" ");
    expect(report.missionBrief[0]).toMatch(/^Bright Smiles: where money can move/);
    expect(text).not.toMatch(
      /\bAO\b|WHITE HOT|act-now|critical path|static segregation|demo priors|SPOF|\(s\)|\bSoD\b/,
    );
    expect(report.caveats.join(" ")).toContain("Priority is this app's ranking index");
  });

  it("prints each duty conflict's full explanation", () => {
    const tpl = getIndustryTemplate("dental");
    const p = defaultProfile("dental");
    const report = buildThreatAssessment({ tpl, practiceName: "x", staff: p.staff });
    const sod = report.targetDeck.filter((t) => t.domain === "sod");
    expect(sod.length).toBeGreaterThan(0);
    for (const t of sod) expect(t.reasons[0]).toMatch(/[.!?]$/);
  });

  it("leaves out a duty conflict dual release closes at every amount", () => {
    const tpl = getIndustryTemplate("dental");
    const p = defaultProfile("dental");
    const dualRelease = { ...p.dualRelease, enabled: true };
    const sod = detectSodConflicts(tpl, p.staff, sodDetectionOptions(tpl, dualRelease));
    const open = new Set(
      openFindings(sod.conflicts, partialDualReleaseCoverage(dualRelease, sod.conflicts)).map(
        (c) => `sod-${c.ruleId}`,
      ),
    );
    // New suppliers need the owner's signature at any amount: that pair is closed.
    expect(
      sod.conflicts.some((c) => c.ruleId === "rule-vendor-create-pay" && c.dualReleaseMitigated),
    ).toBe(true);
    const report = buildThreatAssessment({ tpl, practiceName: "x", staff: p.staff, dualRelease });
    const cards = report.targetDeck.filter((t) => t.domain === "sod").map((t) => t.id);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards).not.toContain("sod-rule-vendor-create-pay");
    for (const id of cards) expect(open.has(id), id).toBe(true);
  });

  it("carries the loss after insurance on every row that has a loss", () => {
    for (const industry of ["dental", "general"] as const) {
      const tpl = getIndustryTemplate(industry);
      const p = defaultProfile(industry);
      const report = buildThreatAssessment({
        tpl,
        practiceName: "x",
        staff: p.staff,
        riskVariables: p.riskVariables,
      });
      const ranked = rankDangerousScenarios(tpl, {
        staff: p.staff,
        riskVariables: p.riskVariables,
      });
      const withLoss = report.targetDeck.filter((t) => t.expectedLoss !== undefined);
      expect(withLoss.length).toBeGreaterThan(0);
      for (const t of withLoss) {
        // A grouped row carries the loss of the scenario grouped into it.
        const id = (t.members ?? [t.id]).find((m) => m.startsWith("scen-"))!.replace(/^scen-/, "");
        const row = ranked.find((r) => r.scenario.id === id)!;
        expect(t.expectedLoss).toBe(row.result.retainedImpact.expected);
      }
    }
  });
});

describe("next steps for a residual row", () => {
  const steps = (industry: "dental" | "construction" | "retail", name: string) => {
    const tpl = getIndustryTemplate(industry);
    const p = defaultProfile(industry);
    const report = buildThreatAssessment({ tpl, practiceName: "x", staff: p.staff });
    return report.targetDeck.find((t) => t.label === name)?.roe;
  };

  it("does not read 'ap' or 'ar' inside ordinary words", () => {
    const cases = [
      ["dental", "Insurance denial appeals"],
      ["construction", "Pay applications & retainage"],
      ["retail", "Markdown / discount authority"],
    ] as const;
    let seen = 0;
    for (const [industry, name] of cases) {
      const roe = steps(industry, name);
      if (!roe) continue;
      seen++;
      expect(roe.join(" ")).not.toMatch(/vendor|write-offs/i);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("the priority list's headline", () => {
  /** A small seeded generator, so a failure replays. */
  const random = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };

  it("counts the top band and never falls when an item is added", () => {
    const next = random(7);
    const target = () => {
      const priority = Math.round(next() * 100);
      // Labels repeat now and then, so the one-per-label rule is exercised too.
      return { label: `item ${Math.floor(next() * 30)}`, priority, band: priorityBand(priority) };
    };
    for (let run = 0; run < 200; run++) {
      const targets = Array.from({ length: Math.floor(next() * 20) }, target);
      const before = fixFirstCount(rankTargets(targets));
      expect(before).toBe(
        rankTargets(targets).filter(
          (t) => t.priority >= 88 && PRIORITY_BAND_LABEL[t.band] === "Fix first",
        ).length,
      );
      expect(fixFirstCount(rankTargets([...targets, target()]))).toBeGreaterThanOrEqual(before);
    }
  });

  it("counts every top-band item, not only the ten the list shows", () => {
    const targets = Array.from({ length: 12 }, (_, i) => ({
      label: `item ${i}`,
      priority: 90 + (i % 5),
      band: priorityBand(90),
    }));
    expect(rankTargets(targets)).toHaveLength(10);
    expect(fixFirstCount(targets)).toBe(12);
    // A version locked before the count was stored has only its list to count.
    expect(fixFirstOf({ targetDeck: rankTargets(targets) })).toBe(10);
    expect(fixFirstOf({ targetDeck: rankTargets(targets), fixFirst: 12 })).toBe(12);
  });

  it("stores the headline over every target the report built", () => {
    const tpl = getIndustryTemplate("dental");
    const report = buildThreatAssessment({ tpl, practiceName: "x", staff: tpl.staffComposition });
    expect(report.fixFirst).toBeGreaterThanOrEqual(fixFirstCount(report.targetDeck));
    expect(fixFirstOf(report)).toBe(report.fixFirst);
  });

  it("does not fall when the owner confirms a scenario", () => {
    const own = resolveTemplate({
      industry: "restaurant",
      customPeople: people,
      customRelations: [],
    });
    const p = defaultProfile("restaurant");
    const headline = (confirmed: string[]) =>
      buildThreatAssessment({
        tpl: own,
        practiceName: "Tavern",
        staff: p.staff,
        riskVariables: p.riskVariables,
        confirmedScenarioIds: new Set(confirmed),
      }).fixFirst;
    expect(headline(["sc-vendor-fraud"])).toBeGreaterThanOrEqual(headline([]));
  });

  it("carries no averaged index and no early-warning pressure", () => {
    const tpl = getIndustryTemplate("dental");
    const report = buildThreatAssessment({ tpl, practiceName: "x", staff: tpl.staffComposition });
    expect(Object.keys(report)).not.toContain("overallThreatIndex");
    expect(Object.keys(report)).not.toContain("leadingPressure");
    expect(report.missionBrief.join(" ")).not.toMatch(/Early-warning/);
  });
});

describe("the priority list groups rows by weakness", () => {
  const sample = (industry: IndustryId) => {
    const p = defaultProfile(industry);
    const tpl = resolveTemplate(p);
    return {
      tpl,
      p,
      report: buildThreatAssessment({
        tpl,
        practiceName: p.practiceName,
        staff: p.staff,
        riskVariables: p.riskVariables,
        dualRelease: p.dualRelease,
      }),
    };
  };

  it("lists a duty conflict, its control and its scenario once, tagged with each kind", () => {
    const { report } = sample("restaurant");
    const cash = report.targetDeck.find((t) => t.id === "sod-rule-cash-rec")!;
    expect(cash.kinds).toEqual(["sod", "control", "scenario"]);
    expect(cash.members).toEqual([
      "sod-rule-cash-rec",
      "ctrl-c-sod-cash",
      "scen-sc-cash-sod-failure",
    ]);
    const vendor = report.targetDeck.find((t) => t.id === "sod-rule-vendor-create-pay")!;
    expect(vendor.kinds).toEqual(["sod", "control", "scenario"]);
    // The control and the scenario no longer take rows of their own.
    const labels = report.targetDeck.map((t) => t.label);
    expect(labels).not.toContain("Split duties: posting payments and reconciling the bank");
    expect(labels).not.toContain("One person posts payments and reconciles the bank");
    expect(labels).not.toContain("One person sets up vendors and pays them");
    // The row keeps the scenario's loss after insurance.
    expect(cash.expectedLoss).toBeGreaterThan(0);
  });

  it("never shows one weakness on two rows, in any sample", () => {
    for (const { id } of INDUSTRIES) {
      const { report } = sample(id as IndustryId);
      const members = report.targetDeck.flatMap((t) => t.members ?? []);
      expect(new Set(members).size, id).toBe(members.length);
      for (const t of report.targetDeck) {
        expect(t.members?.[0], id).toBe(t.id);
        expect(t.kinds?.[0], id).toBe(t.kind);
      }
    }
  });

  it("keeps two duty pairs apart even when one control answers both", () => {
    const { report } = sample("retail");
    const ids = report.targetDeck.map((t) => t.id);
    // Both pairs link the payments-and-reconciliation control.
    expect(ids).toContain("sod-rule-release-rec");
    expect(ids).toContain("sod-rule-cash-rec");
    const release = report.targetDeck.find((t) => t.id === "sod-rule-release-rec")!;
    expect(release.members).toEqual(["sod-rule-release-rec"]);
    // The control joins the pair it shares the most with: posting and the scenario.
    const cash = report.targetDeck.find((t) => t.id === "sod-rule-cash-rec")!;
    expect(cash.members).toContain("ctrl-c-sod-cash");
  });

  it("counts groups, not rows, in the top-priority headline", () => {
    const row = (id: string, kind: string, keys: string[], pair?: string) => ({
      target: { id, kind, label: id, priority: 91, band: priorityBand(91) },
      keys,
      pair,
    });
    const grouped = rankTargets([
      row("sod-a", "sod", ["pair:a", "control:c"], "a"),
      row("ctrl-c", "control", ["control:c", "scenario:s"]),
      row("scen-s", "scenario", ["scenario:s", "control:c"]),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].kinds).toEqual(["sod", "control", "scenario"]);
    expect(fixFirstCount(grouped)).toBe(1);
    // Two pairs are two weaknesses, so two rows and a count of two.
    const pairs = rankTargets([
      row("sod-a", "sod", ["pair:a", "control:c"], "a"),
      row("sod-b", "sod", ["pair:b", "control:c"], "b"),
    ]);
    expect(fixFirstCount(pairs)).toBe(2);
  });

  it("prints conflict severity on the same scale as the priority list", () => {
    expect(CONFLICT_SEVERITY_KEY).toBe(
      "Critical and high duty conflicts are Fix first and Fix soon.",
    );
    let critical = 0;
    let high = 0;
    for (const { id } of INDUSTRIES) {
      const { tpl, p, report } = sample(id as IndustryId);
      const sod = detectSodConflicts(tpl, p.staff, sodDetectionOptions(tpl, p.dualRelease));
      for (const t of report.targetDeck.filter((x) => x.kind === "sod")) {
        const severity = sod.conflicts.find((c) => `sod-${c.ruleId}` === t.id)!.severity;
        if (severity === "critical") {
          critical++;
          expect(PRIORITY_BAND_LABEL[t.band], t.id).toBe("Fix first");
        }
        if (severity === "high") {
          high++;
          expect(PRIORITY_BAND_LABEL[t.band], t.id).toBe("Fix soon");
        }
      }
    }
    expect(critical).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
  });
});
