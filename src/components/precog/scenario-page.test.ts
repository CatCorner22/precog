import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { casesBehindScenario } from "@/lib/precog/evidence/scenario-cases";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { withDecision, withStaff } from "@/lib/precog/profile-actions";
import { resolveTemplate } from "@/lib/precog/active-template";
import { confirmedScenarioIds, isOwnBusiness } from "@/lib/precog/scoring/scope";
import type { Person } from "@/lib/precog/types";
import { isOwnSector } from "@/lib/precog/evidence";
import {
  applyWhatIf,
  deltaTone,
  formatDaysChange,
  formatMoneyChange,
  mitigationCostPhrase,
  pickScenario,
  scenarioCases,
  scenarioConfirmation,
  scenarioRuleIds,
  whatIfApplies,
  whatIfDiffers,
} from "./scenario-page";

const dental = getIndustryTemplate("dental");

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
  const scenario = (id: string) => dental.scenarios.find((s) => s.id === id)!;

  it("returns nothing for a scenario with no rule and no named case", () => {
    expect(scenarioCases({ id: "not-linked" }, "dental")).toBeNull();
  });

  it("counts only the cases that cite one of the scenario's rules", () => {
    const writeoff = scenario("sc-writeoff-abuse");
    const cases = scenarioCases(writeoff, "dental")!;
    const wanted = new Set(scenarioRuleIds(writeoff));
    expect(cases.total).toBe(casesBehindScenario(writeoff).length);
    expect(cases.citing.count).toBeLessThanOrEqual(cases.total);
    for (const c of cases.citing.cases) {
      expect(c.sodRuleIds.some((id) => wanted.has(id))).toBe(true);
    }
  });

  it("shows a case from the owner's line of business ahead of other citing cases", () => {
    for (const scenarioId of ["sc-vendor-fraud", "sc-cash-sod-failure", "sc-writeoff-abuse"]) {
      const cases = scenarioCases(scenario(scenarioId), "dental")!;
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
    const applied = applyWhatIf(saved, whatIf, { ownBusiness: false });
    expect(applied.segregationScore).toBe(75);
    expect(applied.avgTenureYears).toBe(4);
  });

  it("keeps an own team's segregation score and bank reconciliation answer on Apply and applies the other fields", () => {
    const people: Person[] = [
      { id: "a", name: "Ada", role: "Owner", active: true, entitlements: ["approve_payroll"] },
      { id: "b", name: "Ben", role: "Bookkeeper", active: true, entitlements: ["enter_invoices"] },
    ];
    const profile = { ...defaultProfile("dental"), customPeople: people };
    const ownBusiness = isOwnBusiness(resolveTemplate(profile));
    expect(ownBusiness).toBe(true);
    const saved = profile.staff;
    const whatIf = {
      ...saved,
      teamSize: saved.teamSize + 3,
      segregationScore: saved.segregationScore === 95 ? 40 : 95,
      dualControlPayments: !saved.dualControlPayments,
      independentBankRec: !saved.independentBankRec,
    };
    const applied = applyWhatIf(saved, whatIf, { ownBusiness });
    expect(applied.segregationScore).toBe(saved.segregationScore);
    expect(applied.teamSize).toBe(whatIf.teamSize);
    expect(applied.dualControlPayments).toBe(whatIf.dualControlPayments);
    expect(applied.independentBankRec).toBe(saved.independentBankRec);
    // Saving it does not mark either figure as set by hand.
    const next = withStaff(profile, applied);
    expect(next.staff.segregationScore).toBe(saved.segregationScore);
    expect(next.staff.segregationSource).not.toBe("manual");
    expect(next.staff.bankRecSource).not.toBe("manual");
    // A sample business applies both.
    const sample = applyWhatIf(saved, whatIf, { ownBusiness: false });
    expect(sample.segregationScore).toBe(whatIf.segregationScore);
    expect(sample.independentBankRec).toBe(whatIf.independentBankRec);
  });

  it("offers nothing to apply on an own team when only the bank reconciliation answer was tried", () => {
    const saved = defaultProfile("dental").staff;
    const bankOnly = { ...saved, independentBankRec: !saved.independentBankRec };
    expect(whatIfApplies(saved, bankOnly, { ownBusiness: true })).toBe(false);
    expect(whatIfApplies(saved, bankOnly, { ownBusiness: false })).toBe(true);
  });

  it("offers nothing to apply on an own team when only the segregation score was tried", () => {
    const saved = defaultProfile("dental").staff;
    const scoreOnly = { ...saved, segregationScore: saved.segregationScore === 95 ? 40 : 95 };
    expect(whatIfDiffers(saved, scoreOnly)).toBe(true);
    expect(whatIfApplies(saved, scoreOnly, { ownBusiness: true })).toBe(false);
    expect(whatIfApplies(saved, scoreOnly, { ownBusiness: false })).toBe(true);
    const withTeam = { ...scoreOnly, teamSize: saved.teamSize + 1 };
    expect(whatIfApplies(saved, withTeam, { ownBusiness: true })).toBe(true);
  });
});
