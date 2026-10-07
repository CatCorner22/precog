import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { casesBehindScenario } from "@/lib/precog/evidence/scenario-cases";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { withDecision, withStaff } from "@/lib/precog/profile-actions";
import { resolveTemplate } from "@/lib/precog/active-template";
import { confirmedScenarioIds, isOwnBusiness } from "@/lib/precog/scoring/scope";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import type { Person } from "@/lib/precog/types";
import { isOwnSector } from "@/lib/precog/evidence";
import {
  applyWhatIf,
  deltaTone,
  formatDaysChange,
  formatEstimateChange,
  formatMoneyChange,
  mitigationCostPhrase,
  NARROW_SCENARIO_QUERY,
  pickScenario,
  revealScenarioFigures,
  scenarioCases,
  scenarioConfirmation,
  scenarioRuleIds,
  scenarioWatch,
  whatIfApplies,
  whatIfDiffers,
} from "./scenario-page";
import { estimateUsdChange } from "@/lib/utils";

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

describe("scenarioWatch", () => {
  const tpl: Pick<IndustryTemplate, "controls" | "knowledge" | "relations" | "people"> = {
    controls: [{ ...dental.controls[0], id: "watch-control", name: "Split vendor duties" }],
    knowledge: [{ ...dental.knowledge[0], id: "watch-knowledge", name: "Close the books" }],
    people: [
      { ...dental.people[0], id: "expert", name: "Alex Example", active: true },
      { ...dental.people[1], id: "proficient", name: "Blair Example", active: true },
      { ...dental.people[2], id: "aware", name: "Casey Example", active: true },
      { ...dental.people[3], id: "inactive", name: "Drew Example", active: false },
    ],
    relations: [
      { personId: "expert", knowledgeId: "watch-knowledge", level: "expert" },
      { personId: "proficient", knowledgeId: "watch-knowledge", level: "proficient" },
      { personId: "aware", knowledgeId: "watch-knowledge", level: "aware" },
      { personId: "inactive", knowledgeId: "watch-knowledge", level: "expert" },
    ],
  };
  const scenario = {
    id: "sc-vendor-fraud",
    sodRuleIds: ["rule-vendor-create-pay", "rule-payments-adjust"],
    controlId: "watch-control",
    knowledgeId: "watch-knowledge",
  };

  it("filters to scenario rules and deduplicates each person and rule in input order", () => {
    const conflicts = [
      { ruleId: "unrelated", personName: "Alex Example", title: "Unrelated" },
      { ruleId: "rule-vendor-create-pay", personName: "Alex Example", title: "First" },
      { ruleId: "rule-vendor-create-pay", personName: "Alex Example", title: "Duplicate" },
      { ruleId: "rule-payments-adjust", personName: "Alex Example", title: "Other rule" },
      { ruleId: "rule-vendor-create-pay", personName: "Blair Example", title: "Another person" },
    ];
    expect(scenarioWatch(tpl, scenario, conflicts, new Set()).conflicts).toEqual([
      { personName: "Alex Example", title: "First" },
      { personName: "Alex Example", title: "Other rule" },
      { personName: "Blair Example", title: "Another person" },
    ]);
  });

  it("follows the control's segregation state and lists active strong knowledge holders", () => {
    const inPlace = scenarioWatch(tpl, scenario, [], new Set(["expert", "aware", "inactive"]));
    expect(inPlace.control).toEqual({
      id: "watch-control",
      name: "Split vendor duties",
      inPlace: tpl.controls[0].segregated,
    });
    expect(inPlace.knowledge).toEqual({
      name: "Close the books",
      holders: ["Alex Example", "Blair Example"],
      outToday: ["Alex Example"],
    });
    const notInPlace = scenarioWatch(
      { ...tpl, controls: [{ ...tpl.controls[0], segregated: false }] },
      scenario,
      [],
      new Set(),
    );
    expect(notInPlace.control?.inPlace).toBe(false);
  });

  it("returns null when a scenario omits an id or the template lacks its item", () => {
    expect(scenarioWatch(tpl, { id: "unlinked" }, [], new Set())).toMatchObject({
      control: null,
      knowledge: null,
    });
    expect(
      scenarioWatch(
        tpl,
        { ...scenario, controlId: "missing", knowledgeId: "missing" },
        [],
        new Set(),
      ),
    ).toMatchObject({ control: null, knowledge: null });
  });
});

describe("baseline changes", () => {
  it("reads a zero change as neutral, never as worse", () => {
    expect(deltaTone(0)).toBe("muted");
    expect(deltaTone(0.4)).toBe("muted");
    expect(deltaTone(-1200)).toBe("ok");
    expect(deltaTone(300)).toBe("danger");
    expect(formatMoneyChange(0)).toBe("no change");
    expect(formatMoneyChange(-1200)).toBe("about -$1,200");
    expect(formatMoneyChange(300)).toBe("about +$300");
    expect(formatMoneyChange(-1_234)).toBe("about -$1,200");
    expect(formatDaysChange(-56)).toBe("-56 days");
    expect(formatDaysChange(1)).toBe("+1 day");
    expect(formatDaysChange(0)).toBe("no change");
  });

  it("prints a change as the difference of the two printed estimates", () => {
    // 28,753 and 36,533 print "about $29,000" and "about $37,000": the line
    // beside them reads +$8,000, not the exact difference (+$7,800).
    expect(formatEstimateChange(estimateUsdChange(28_753, 36_533))).toBe("about +$8,000");
    expect(formatMoneyChange(36_533 - 28_753)).toBe("about +$7,800");
    // A difference of two rounded figures is not rounded again.
    expect(formatEstimateChange(estimateUsdChange(28_753, 140_400))).toBe("about +$111,000");
    expect(formatEstimateChange(estimateUsdChange(36_533, 28_753))).toBe("about -$8,000");
    expect(formatEstimateChange(estimateUsdChange(36_533, 36_933))).toBe("no change");
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

describe("revealScenarioFigures", () => {
  /** A window whose media queries match `matching`, and an element that records its scrolls. */
  const setup = (matching: string[]) => {
    const calls: ScrollIntoViewOptions[] = [];
    const win = { matchMedia: (query: string) => ({ matches: matching.includes(query) }) };
    const el = { scrollIntoView: (options: ScrollIntoViewOptions) => calls.push(options) };
    return { calls, win, el };
  };

  it("scrolls the figures into view on a narrow screen, smoothly", () => {
    const { calls, win, el } = setup([NARROW_SCENARIO_QUERY]);
    expect(revealScenarioFigures(el, win)).toBe(true);
    expect(calls).toEqual([{ block: "start", behavior: "smooth" }]);
  });

  it("jumps without animation when the reader asks for reduced motion", () => {
    const { calls, win, el } = setup([NARROW_SCENARIO_QUERY, "(prefers-reduced-motion: reduce)"]);
    expect(revealScenarioFigures(el, win)).toBe(true);
    expect(calls).toEqual([{ block: "start", behavior: "auto" }]);
  });

  it("leaves a wider screen, where the cards sit side by side, where it is", () => {
    const { calls, win, el } = setup([]);
    expect(revealScenarioFigures(el, win)).toBe(false);
    expect(calls).toEqual([]);
    expect(revealScenarioFigures(null, setup([NARROW_SCENARIO_QUERY]).win)).toBe(false);
  });
});
