import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "./active-template";
import { defaultProfile } from "./practice-profile";
import {
  describeEnteredWork,
  enteredWork,
  hasEnteredWork,
  listEnteredWork,
} from "./industry-switch";

const tpl = getBaseTemplate("dental");

describe("enteredWork", () => {
  it("reports nothing to lose on a fresh template profile", () => {
    const work = enteredWork(defaultProfile("dental"));
    expect(hasEnteredWork(work)).toBe(false);
    expect(describeEnteredWork(work)).toEqual([]);
    expect(listEnteredWork([])).toBe("");
  });

  it("counts the team, register, leave and map work an industry switch would discard", () => {
    const p = defaultProfile("dental");
    p.customPeople = tpl.people.slice(0, 4);
    p.customKnowledge = tpl.knowledge.slice(0, 3);
    p.customRelations = tpl.relations.slice(0, 12);
    p.plannedAbsences = [
      {
        id: "abs1",
        personId: tpl.people[0].id,
        industry: "dental",
        from: "2026-09-21",
        to: "2026-09-21",
        unplanned: true,
      },
    ];
    const work = enteredWork(p);
    expect(hasEnteredWork(work)).toBe(true);
    expect(describeEnteredWork(work)).toEqual(["4 people", "12 register entries", "1 absence"]);
    expect(listEnteredWork(describeEnteredWork(work))).toBe(
      "4 people, 12 register entries and 1 absence",
    );
  });

  it("treats a cleared override, pinned map positions and moved settings as work to lose", () => {
    const cleared = defaultProfile("dental");
    cleared.customKnowledge = [];
    cleared.customRelations = [];
    cleared.customProcesses = [];
    expect(describeEnteredWork(enteredWork(cleared))).toEqual([
      "a cleared register",
      "a cleared process map",
    ]);

    const pinned = defaultProfile("dental");
    pinned.mapLayout = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } };
    expect(describeEnteredWork(enteredWork(pinned))).toEqual(["2 pinned map positions"]);

    const tuned = defaultProfile("dental");
    tuned.staff = { ...tuned.staff, teamSize: tuned.staff.teamSize + 3 };
    const work = enteredWork(tuned);
    expect(work.settings).toBe(true);
    expect(hasEnteredWork(work)).toBe(true);
    expect(describeEnteredWork(work)).toEqual(["edited team and control settings"]);

    const risk = defaultProfile("dental");
    risk.riskVariables = {
      ...risk.riskVariables,
      hasDualControl: !risk.riskVariables.hasDualControl,
    };
    expect(enteredWork(risk).settings).toBe(true);
  });

  it("falls back to register items when only the item list was edited, and uses singular forms", () => {
    const p = defaultProfile("dental");
    p.customPeople = tpl.people.slice(0, 1);
    p.customKnowledge = tpl.knowledge.slice(0, 1);
    p.customProcesses = tpl.processes.slice(0, 1);
    expect(describeEnteredWork(enteredWork(p))).toEqual([
      "1 person",
      "1 register item",
      "1 process",
    ]);
    expect(listEnteredWork(["1 person", "1 process"])).toBe("1 person and 1 process");
  });
});
