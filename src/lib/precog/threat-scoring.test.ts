import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "./active-template";
import { defaultProfile } from "./practice-profile";
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
      "Knowledge: Register not assessed yet: mark who can do each item on Who knows what.",
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
    expect(report.targetDeck.some((t) => t.label === "Vendor setup + payment not segregated")).toBe(
      true,
    );
    const reasons = report.targetDeck.flatMap((t) => t.reasons);
    expect(reasons.join(" ")).not.toMatch(/p50/);
    for (const t of report.targetDeck.filter((x) => x.domain === "scenario")) {
      expect(t.reasons[0]).toMatch(/^about \d+ assumed days until found$/);
    }
  });
});

describe("buildThreatAssessment for the sample", () => {
  it("counts sole and unowned knowledge separately", () => {
    const tpl = getBaseTemplate("dental");
    const p = defaultProfile("dental");
    const report = buildThreatAssessment({ tpl, practiceName: "x", staff: p.staff });
    expect(report.missionBrief).toContain("Knowledge: 4 item(s) one person holds, 0 nobody holds.");
  });
});
