import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "./active-template";
import { assessCoso } from "./coso";
import type { Person, StaffComposition } from "./types";

const people: Person[] = [
  { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] },
  { id: "own-2", name: "Ben Ochoa", role: "Bookkeeper", active: true, entitlements: [] },
];
const own = resolveTemplate({ industry: "general", customPeople: people, customRelations: [] });
const clean: StaffComposition = {
  teamSize: 10,
  soleOwnerKnowledgeCount: 0,
  avgTenureYears: 5,
  segregationScore: 100,
  dualControlPayments: false,
  independentBankRec: true,
};

describe("assessCoso", () => {
  it("scores the profile's staff, not the template's", () => {
    const fromTemplate = assessCoso(own);
    const fromProfile = assessCoso(own, clean);
    const note = (a: typeof fromProfile) =>
      a.components
        .find((c) => c.id === "control_activities")!
        .principles.find((p) => p.number === 10)!.note;
    expect(note(fromProfile)).toMatch(/^Segregation score 100\/100/);
    expect(note(fromTemplate)).toMatch(/^Segregation score 42\/100/);
    expect(fromProfile.overall).toBeGreaterThan(fromTemplate.overall);
  });

  it("never lists a key-person finding with a zero count", () => {
    for (const a of [assessCoso(own, clean), assessCoso(getBaseTemplate("general"))]) {
      const spof = a.priorityFindings.find((f) => f.id === "ce-spof");
      if (spof) expect(spof.detail).not.toMatch(/^0 /);
    }
    expect(assessCoso(own, clean).priorityFindings.some((f) => f.id === "ce-spof")).toBe(false);
  });

  it("says the register is not assessed instead of scoring the starter list", () => {
    const a = assessCoso(own, clean);
    const competence = a.components
      .find((c) => c.id === "control_environment")!
      .principles.find((p) => p.number === 4)!;
    expect(competence.notAssessed).toBe(true);
    expect(competence.note).toBe(
      "Register not assessed yet: mark who can do each item on Who knows what.",
    );
    expect(a.priorityFindings.some((f) => f.id === "ic-register")).toBe(true);
    expect(a.priorityFindings.some((f) => f.id.startsWith("ic-k"))).toBe(false);
  });

  it("leaves starter scenarios out until the owner confirms one", () => {
    const none = assessCoso(own, clean);
    expect(none.priorityFindings.some((f) => f.id === "ra-top")).toBe(false);
    const p7 = none.components
      .find((c) => c.id === "risk_assessment")!
      .principles.find((p) => p.number === 7)!;
    expect(p7.notAssessed).toBe(true);
    expect(p7.note).toMatch(/^Starter scenarios from the general small business example/);
    const one = assessCoso(own, clean, { confirmedScenarioIds: new Set(["sc-vendor-fraud"]) });
    const top = one.priorityFindings.find((f) => f.id === "ra-top")!;
    expect(top.label).toBe("Top residual future: Vendor setup + payment not segregated");
    expect(top.detail).toContain("assumed days until found");
  });
});
