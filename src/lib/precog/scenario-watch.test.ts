import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "./templates";
import { dutyFacts, knowledgeFact, scenarioWatch, type ScenarioWatch } from "./scenario-watch";

const template = getIndustryTemplate("dental");
const knowledgeScenario = template.scenarios.find((candidate) => candidate.knowledgeId);
if (!knowledgeScenario?.knowledgeId) throw new Error("Missing dental knowledge scenario");
const knowledge = template.knowledge.find((item) => item.id === knowledgeScenario.knowledgeId);
if (!knowledge) throw new Error("Missing dental scenario knowledge item");
const activePerson = template.people.find((person) => person.active);
if (!activePerson) throw new Error("Missing active dental sample person");

function factsFor(overrides: Partial<ScenarioWatch> = {}): ScenarioWatch {
  return {
    conflicts: [],
    unassignedDuties: [],
    offTeamDuties: [],
    control: null,
    knowledge: null,
    ...overrides,
  };
}

describe("scenario knowledge facts", () => {
  it("does not treat an unmarked starter-list item as recorded", () => {
    const watch = scenarioWatch({ ...template, relations: [] }, knowledgeScenario, [], new Set());

    expect(watch.knowledge?.recorded).toBe(false);
  });

  it("keeps an unmarked item unrecorded when another item has a relation", () => {
    const otherItem = template.knowledge.find((item) => item.id !== knowledge.id);
    if (!otherItem) throw new Error("Missing another dental knowledge item");
    const watch = scenarioWatch(
      {
        ...template,
        relations: [{ personId: activePerson.id, knowledgeId: otherItem.id, level: "expert" }],
      },
      knowledgeScenario,
      [],
      new Set(),
    );

    expect(watch.knowledge?.recorded).toBe(false);
  });

  it("counts an active person's aware relation as recorded", () => {
    const watch = scenarioWatch(
      {
        ...template,
        relations: [{ personId: activePerson.id, knowledgeId: knowledge.id, level: "aware" }],
      },
      knowledgeScenario,
      [],
      new Set(),
    );

    expect(watch.knowledge?.recorded).toBe(true);
  });

  it("does not count a relation held only by an inactive person", () => {
    const inactivePerson = { ...activePerson, id: "inactive-person", active: false };
    const watch = scenarioWatch(
      {
        ...template,
        people: [...template.people, inactivePerson],
        relations: [{ personId: inactivePerson.id, knowledgeId: knowledge.id, level: "expert" }],
      },
      knowledgeScenario,
      [],
      new Set(),
    );

    expect(watch.knowledge?.recorded).toBe(false);
  });

  it("treats an owner-written non-starter list with no relations as recorded", () => {
    const ownerList = template.knowledge.map((item) =>
      item.id === knowledge.id ? { ...item, name: `Owner's ${item.name}` } : item,
    );
    const watch = scenarioWatch(
      { ...template, knowledge: ownerList, relations: [] },
      knowledgeScenario,
      [],
      new Set(),
    );

    expect(watch.knowledge?.recorded).toBe(true);
  });

  it("renders the three recorded and unrecorded knowledge facts", () => {
    expect(
      knowledgeFact({ name: "Payroll", holders: ["Ada"], outToday: [], recorded: false }),
    ).toBe("Payroll: who can run it alone isn't recorded yet; mark it on Who knows what.");
    expect(
      knowledgeFact({ name: "Payroll", holders: ["Ada", "Bea"], outToday: [], recorded: true }),
    ).toBe("Payroll: Ada and Bea can run it alone.");
    expect(knowledgeFact({ name: "Payroll", holders: [], outToday: [], recorded: true })).toBe(
      "Payroll: nobody can run it alone.",
    );
  });
});

describe("scenario duty facts", () => {
  it("explains unassigned duties and optionally names off-team duties", () => {
    expect(
      dutyFacts(
        factsFor({
          unassignedDuties: ["enter payroll", "release payments"],
          offTeamDuties: ["bank reconciliation"],
        }),
      ),
    ).toEqual([
      "Nobody on the team is ticked for enter payroll and release payments, so Precog cannot tell whether one person holds both duties this needs. Tick whoever does them on the Team tab.",
      "Your setup answers place bank reconciliation outside the team.",
    ]);
  });

  it("explains duties placed outside the team when no duty is unassigned", () => {
    expect(dutyFacts(factsFor({ offTeamDuties: ["enter payroll"] }))).toEqual([
      "Your setup answers place enter payroll outside the team, so nobody on the team holds both duties this needs.",
    ]);
  });

  it("lists at most three conflict lines and counts the rest", () => {
    expect(
      dutyFacts(
        factsFor({
          conflicts: [
            { personName: "Ada", title: "Conflict one" },
            { personName: "Bea", title: "Conflict two" },
            { personName: "Cy", title: "Conflict three" },
            { personName: "Dee", title: "Conflict four" },
          ],
        }),
      ),
    ).toEqual([
      "Ada holds both duties: Conflict one",
      "Bea holds both duties: Conflict two",
      "Cy holds both duties: Conflict three",
      "and 1 more",
    ]);
  });

  it("says nobody holds both duties only when there are no findings or gaps", () => {
    expect(dutyFacts(factsFor())).toEqual(["Nobody on the team holds both duties this needs."]);
  });
});
