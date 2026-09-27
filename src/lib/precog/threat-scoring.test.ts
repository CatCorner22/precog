import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./active-template";
import { getIndustryTemplate } from "./templates";
import { defaultProfile } from "./practice-profile";
import { rankDangerousScenarios } from "./engine";
import { buildThreatAssessment } from "./threat-scoring";
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

  it("leaves out the starter register and starter scenarios, and says so", () => {
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
    expect(report.missionBrief.some((l) => l.startsWith("Scenarios: Starter scenarios"))).toBe(
      true,
    );
  });

  it("counts a scenario the owner confirmed, with the day figure in plain words", () => {
    const report = buildThreatAssessment({
      tpl: own,
      practiceName: "Tavern",
      staff: p.staff,
      riskVariables: p.riskVariables,
      confirmedScenarioIds: new Set(["sc-vendor-fraud"]),
    });
    expect(
      report.targetDeck.some((t) => t.label === "One person sets up vendors and pays them"),
    ).toBe(true);
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
        const id = t.id.replace(/^scen-/, "");
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
