import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { withDecision } from "@/lib/precog/profile-actions";
import { confirmedScenarioIds } from "@/lib/precog/scoring/scope";
import { casesForSodRules, isOwnSector } from "@/lib/precog/evidence";
import { CONFLICT_RULES } from "@/lib/precog/sod/conflict-rules";
import {
  applyWhatIf,
  deltaTone,
  formatDaysChange,
  formatMoneyChange,
  mitigationCostPhrase,
  pickScenario,
  scenarioCases,
  scenarioConfirmation,
  whatIfDiffers,
} from "./scenario-page";

const dental = getBaseTemplate("dental");

describe("pickScenario", () => {
  it("keeps a pick the template has and falls back to the first otherwise", () => {
    const second = dental.scenarios[1];
    expect(pickScenario(dental.scenarios, second.id)).toBe(second);
    expect(pickScenario(dental.scenarios, "not-a-scenario")).toBe(dental.scenarios[0]);
    expect(pickScenario(dental.scenarios, null)).toBe(dental.scenarios[0]);
  });
});

describe("scenarioConfirmation", () => {
  it("logs a decision that confirmedScenarioIds reads back as this scenario", () => {
    const scenario = dental.scenarios[0];
    const now = new Date(2026, 8, 26, 12);
    const input = scenarioConfirmation(scenario, now);
    expect(input.linkedTab).toBe("precog");
    expect(input.reviewBy).toBe("2026-12-25");
    const profile = withDecision(defaultProfile("dental"), input, "d-1", now);
    expect(confirmedScenarioIds(profile.decisions, "dental").has(scenario.id)).toBe(true);
  });
});

describe("scenarioCases", () => {
  const ruleIds = (scenarioId: string) =>
    CONFLICT_RULES.filter((r) => r.linkedScenarioId === scenarioId).map((r) => r.id);

  it("returns nothing for a scenario no duty-conflict rule links to", () => {
    expect(scenarioCases("not-linked", "dental")).toBeNull();
  });

  it("counts only the cases that cite a linked rule", () => {
    const cases = scenarioCases("sc-writeoff-abuse", "dental")!;
    const wanted = new Set(ruleIds("sc-writeoff-abuse"));
    expect(cases.total).toBe(casesForSodRules([...wanted]).length);
    expect(cases.citing.count).toBeLessThanOrEqual(cases.total);
    for (const c of cases.citing.cases) {
      expect(c.sodRuleIds.some((id) => wanted.has(id))).toBe(true);
    }
  });

  it("shows a case from the owner's line of business ahead of other citing cases", () => {
    for (const scenarioId of ["sc-vendor-fraud", "sc-cash-sod-failure", "sc-writeoff-abuse"]) {
      const cases = scenarioCases(scenarioId, "dental")!;
      const ownCiting = cases.citing.cases.find((c) => isOwnSector(c, "dental"));
      if (ownCiting) expect(cases.shown[0].id).toBe(ownCiting.id);
      for (const c of cases.shown) {
        expect(cases.ownSectorIds.has(c.id)).toBe(isOwnSector(c, "dental"));
      }
    }
  });
});

describe("baseline changes", () => {
  it("reads a zero change as neutral, never as worse", () => {
    expect(deltaTone(0)).toBe("muted");
    expect(deltaTone(0.4)).toBe("muted");
    expect(deltaTone(-1200)).toBe("ok");
    expect(deltaTone(300)).toBe("danger");
    expect(formatMoneyChange(0)).toBe("no change");
    expect(formatMoneyChange(-1200)).toBe("-$1,200");
    expect(formatMoneyChange(300)).toBe("+$300");
    expect(formatDaysChange(-56)).toBe("-56 days");
    expect(formatDaysChange(1)).toBe("+1 day");
    expect(formatDaysChange(0)).toBe("no change");
  });

  it("labels a mitigation cost as the scenario's assumption", () => {
    expect(mitigationCostPhrase(2400)).toBe("Assumed yearly cost $2,400");
    expect(mitigationCostPhrase(0)).toBe("No cash cost assumed (staff time)");
  });
});

describe("staffing what-if", () => {
  it("applies only the fields the page edits and leaves the rest of the saved staffing", () => {
    const saved = { ...dental.staffComposition, avgTenureYears: 4 };
    const whatIf = { ...saved, segregationScore: 75, avgTenureYears: 9 };
    expect(whatIfDiffers(saved, saved)).toBe(false);
    expect(whatIfDiffers(saved, whatIf)).toBe(true);
    const applied = applyWhatIf(saved, whatIf);
    expect(applied.segregationScore).toBe(75);
    expect(applied.avgTenureYears).toBe(4);
  });
});
