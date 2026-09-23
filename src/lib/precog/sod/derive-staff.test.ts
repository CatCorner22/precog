import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import type { Person, StaffComposition } from "../types";
import { controlOptions, detectSodConflicts } from "./detect";
import { deriveStaffFromTeam } from "./derive-staff";

const retail = getBaseTemplate("retail");

function staff(overrides: Partial<StaffComposition> = {}): StaffComposition {
  return { ...retail.staffComposition, ...overrides };
}

describe("deriveStaffFromTeam", () => {
  it("counts active people and averages known active tenure", () => {
    const people = retail.people.map((person, index) => ({
      ...person,
      active: index !== 1,
      tenureYears: index === 2 ? undefined : index + 1,
    }));

    const result = deriveStaffFromTeam({ ...retail, people }, staff());

    expect(result.teamSize).toBe(5);
    expect(result.avgTenureYears).toBe(4);
  });

  it("matches the SoD detector's segregation health without circular staff input", () => {
    const result = deriveStaffFromTeam(retail, staff({ segregationScore: 1 }));

    expect(result.segregationScore).toBe(
      detectSodConflicts(retail, undefined, controlOptions(retail)).summary.segregationHealth,
    );
    expect(result.segregationSource).toBe("derived");
  });

  it("preserves a manual segregation score while updating team metrics", () => {
    const people = retail.people.slice(0, 2).map((person, index) => ({
      ...person,
      active: index === 0,
      tenureYears: 12,
    }));
    const result = deriveStaffFromTeam(
      { ...retail, people },
      staff({ segregationScore: 37, segregationSource: "manual" }),
    );

    expect(result.teamSize).toBe(1);
    expect(result.avgTenureYears).toBe(12);
    expect(result.segregationScore).toBe(37);
    expect(result.segregationSource).toBe("manual");
  });

  it("scores a one-person end-to-end cash and payment role below segregated duties", () => {
    const solo: Person = {
      id: "solo",
      name: "Solo",
      role: "Custom",
      active: true,
      entitlements: ["collect_cash", "bank_reconcile", "release_payment"],
    };
    const segregatedPeople: Person[] = [
      { id: "cash", name: "Cash", role: "Custom", active: true, entitlements: ["collect_cash"] },
      {
        id: "bank",
        name: "Bank",
        role: "Custom",
        active: true,
        entitlements: ["bank_reconcile"],
      },
      {
        id: "pay",
        name: "Pay",
        role: "Custom",
        active: true,
        entitlements: ["release_payment"],
      },
    ];
    const soloTemplate = { ...retail, people: [solo], roleTemplates: {} };
    const segregatedTemplate = { ...retail, people: segregatedPeople, roleTemplates: {} };

    const soloScore = deriveStaffFromTeam(soloTemplate, staff()).segregationScore;
    const segregatedScore = deriveStaffFromTeam(segregatedTemplate, staff()).segregationScore;

    expect(soloScore).toBeLessThan(segregatedScore);
  });
});
