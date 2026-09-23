import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import type { Person } from "../types";
import {
  confirmedScenarioIds,
  isOwnBusiness,
  scenariosInScope,
  starterScenarioLabel,
  starterScenarioNote,
  templateMapAssessed,
  withOwnScenarioWording,
} from "./scope";

const people: Person[] = [
  { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, entitlements: [] },
  { id: "own-2", name: "Ben Ochoa", role: "Bookkeeper", active: true, entitlements: [] },
];

describe("isOwnBusiness", () => {
  it("tells the sample team from the owner's own people", () => {
    expect(isOwnBusiness(getBaseTemplate("dental"))).toBe(false);
    expect(isOwnBusiness(resolveTemplate({ industry: "dental" }))).toBe(false);
    expect(isOwnBusiness(resolveTemplate({ industry: "dental", customPeople: people }))).toBe(true);
  });
});

describe("starter scenarios", () => {
  const own = resolveTemplate({ industry: "restaurant", customPeople: people });

  it("keeps every sample scenario and none of an owner's until confirmed", () => {
    const sample = getBaseTemplate("restaurant");
    expect(scenariosInScope(sample)).toBe(sample.scenarios);
    expect(scenariosInScope(own)).toEqual([]);
    expect(scenariosInScope(own, new Set(["sc-vendor-fraud"])).map((s) => s.id)).toEqual([
      "sc-vendor-fraud",
    ]);
  });

  it("counts a decision logged on a scenario as confirming it, under its own industry only", () => {
    const ids = confirmedScenarioIds(
      [
        { linkedTab: "precog", linkedId: "sc-vendor-fraud", linkedIndustry: "restaurant" },
        { linkedTab: "precog", linkedId: "sc-cash-sod-failure", linkedIndustry: "dental" },
        { linkedTab: "knowledge", linkedId: "k1", linkedIndustry: "restaurant" },
      ],
      "restaurant",
    );
    expect([...ids]).toEqual(["sc-vendor-fraud"]);
  });

  it("says how many are left out and how to make one your own", () => {
    expect(starterScenarioLabel("restaurant")).toBe(
      "Starter scenarios from the restaurant / hospitality example",
    );
    expect(starterScenarioNote(own)).toBe(
      'Starter scenarios from the restaurant / hospitality example (4) are left out: their losses and timelines are the example\'s assumptions, not facts about your business. To make one your own, open it on What could happen and choose "This could happen here"; it then counts in the threat index and your totals.',
    );
    expect(starterScenarioNote(getBaseTemplate("restaurant"))).toBeNull();
  });

  it("replaces the sample team's names with the role the scenario implies", () => {
    const dental = withOwnScenarioWording(
      resolveTemplate({ industry: "dental", customPeople: people }),
    );
    const leaves = dental.scenarios.find((s) => s.id === "sc-front-desk-leaves")!;
    expect(leaves.description).toBe(
      "The front desk lead (sole expert on insurance denial appeals) resigns with 2 weeks notice. No cross-training documented.",
    );
    expect(leaves.mitigations.map((m) => m.label)).toContain(
      "Record the front desk lead's denial playbook before exit",
    );
    const restaurant = withOwnScenarioWording(own);
    expect(restaurant.scenarios[0].description).toMatch(/^The head server \(sole expert/);
    const general = withOwnScenarioWording(
      resolveTemplate({ industry: "general", customPeople: people }),
    );
    // The general template names the role itself ("The AR admin"), for the sample too.
    expect(general.scenarios[0].description).toMatch(/^The AR admin \(sole expert/);
    for (const tpl of [dental, restaurant, general]) {
      const text = JSON.stringify(tpl.scenarios);
      expect(text).not.toMatch(/\b(Jordan|Sam)\b/);
    }
  });

  it("leaves the sample business's wording and every figure untouched", () => {
    const sample = resolveTemplate({ industry: "dental" });
    expect(withOwnScenarioWording(sample)).toBe(sample);
    const own = resolveTemplate({ industry: "dental", customPeople: people });
    const worded = withOwnScenarioWording(own);
    worded.scenarios.forEach((s, i) => {
      expect(s.id).toBe(own.scenarios[i].id);
      expect(s.baseFinancialImpact).toEqual(own.scenarios[i].baseFinancialImpact);
      expect(s.baseTimelineDays).toEqual(own.scenarios[i].baseTimelineDays);
    });
    expect(withOwnScenarioWording(own)).toBe(worded);
  });
});

describe("templateMapAssessed", () => {
  it("treats an owner's map with no process owner as not assessed", () => {
    expect(templateMapAssessed(getBaseTemplate("dental"))).toBe(true);
    const own = resolveTemplate({ industry: "dental", customPeople: people });
    expect(templateMapAssessed(own)).toBe(false);
    const owned = resolveTemplate({
      industry: "dental",
      customPeople: people,
      customProcesses: own.processes.map((p, i) =>
        i === 0 ? { ...p, ownerPersonIds: ["own-1"] } : p,
      ),
    });
    expect(templateMapAssessed(owned)).toBe(true);
    expect(
      templateMapAssessed(
        resolveTemplate({ industry: "dental", customPeople: people, customProcesses: [] }),
      ),
    ).toBe(false);
  });
});
