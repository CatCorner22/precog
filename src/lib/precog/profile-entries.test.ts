import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "./industry";
import { defaultProfile } from "./practice-profile";
import {
  asRecord,
  knowledgeEntries,
  malformedList,
  peopleEntries,
  processEntries,
  readText,
} from "./profile-entries";
import { getIndustryTemplate } from "./templates";

/** A sample filled in the way an owner's own copy is: every list held as custom. */
function sample(id: (typeof INDUSTRIES)[number]["id"]): Record<string, any> {
  const tpl = getIndustryTemplate(id);
  return JSON.parse(
    JSON.stringify({
      ...defaultProfile(id),
      customPeople: tpl.people,
      customProcesses: tpl.processes,
      customKnowledge: tpl.knowledge,
      customRelations: tpl.relations,
    }),
  );
}

describe("asRecord", () => {
  it("returns the object itself", () => {
    const value = { a: 1 };
    expect(asRecord(value)).toBe(value);
  });

  it("returns an empty record for anything that is not an object", () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
    expect(asRecord("text")).toEqual({});
    expect(asRecord(7)).toEqual({});
    expect(asRecord(true)).toEqual({});
  });

  it("returns an empty record for an array", () => {
    expect(asRecord([{ a: 1 }])).toEqual({});
  });
});

describe("readText", () => {
  it("trims a string and cuts it at the maximum", () => {
    expect(readText("  Oakridge Dental  ", 80)).toBe("Oakridge Dental");
    expect(readText("x".repeat(100), 80)).toBe("x".repeat(80));
  });

  it("trims before it cuts", () => {
    expect(readText("   abc", 3)).toBe("abc");
  });

  it("reads anything that is not a string as empty", () => {
    expect(readText(42, 80)).toBe("");
    expect(readText(null, 80)).toBe("");
    expect(readText(undefined, 80)).toBe("");
    expect(readText(["a"], 80)).toBe("");
    expect(readText({ toString: () => "a" }, 80)).toBe("");
  });
});

/**
 * Stored copies the stress fuzzing found that the server accepted and every
 * reader then failed on: the owner's device quarantined the business, and the
 * CPA's report and the weekly digest could not build it.
 */
describe("entries rebuilt for the readers", () => {
  const person = (entitlements: unknown) => ({
    id: "p1",
    name: "Ann",
    role: "Bookkeeper",
    active: true,
    entitlements,
  });

  it("keeps only string duty ids, and drops a duty list that is not a list", () => {
    expect(peopleEntries([person([null, "record_deposits", 5])])?.[0].entitlements).toEqual([
      "record_deposits",
    ]);
    for (const junk of [{ length: 2 }, 7, "text", null]) {
      const [rebuilt] = peopleEntries([person(junk)]) ?? [];
      expect(rebuilt).not.toHaveProperty("entitlements");
      expect(rebuilt).toMatchObject({ id: "p1", name: "Ann", role: "Bookkeeper" });
    }
  });

  it("keeps only objects in risks, ideas, wastes and evidence, and only strings in inputs, outputs and systems", () => {
    const risk = { id: "r1", title: "T", kind: "fraud", severity: 3, likelihood: 2, note: "" };
    const [rebuilt] =
      processEntries([
        {
          id: "x",
          name: "Deposits",
          dependencies: [],
          controlIds: [],
          risks: [null, risk, "text", [risk]],
          ideas: [7, { id: "i1" }],
          wastes: [null],
          evidence: ["e", { id: "e1" }],
          inputs: [null, "Cash", 0],
          outputs: ["Deposit slip", {}],
          systems: [true, "Bank portal"],
        },
      ]) ?? [];
    expect(rebuilt.risks).toEqual([risk]);
    expect(rebuilt.ideas).toEqual([{ id: "i1" }]);
    expect(rebuilt.wastes).toEqual([]);
    expect(rebuilt.evidence).toEqual([{ id: "e1" }]);
    expect(rebuilt.inputs).toEqual(["Cash"]);
    expect(rebuilt.outputs).toEqual(["Deposit slip"]);
    expect(rebuilt.systems).toEqual(["Bank portal"]);

    for (const junk of ["text", 0, {}, true, null]) {
      const [process] =
        processEntries([
          {
            id: "x",
            name: "Deposits",
            risks: junk,
            ideas: junk,
            wastes: junk,
            evidence: junk,
            inputs: junk,
            outputs: junk,
            systems: junk,
          },
        ]) ?? [];
      for (const field of [
        "risks",
        "ideas",
        "wastes",
        "evidence",
        "inputs",
        "outputs",
        "systems",
      ]) {
        expect(process).not.toHaveProperty(field);
      }
    }
  });

  it("clamps a risk's likelihood and severity into 1 to 5, and drops a risk without them", () => {
    const risk = (likelihood: unknown, severity: unknown) => ({
      id: "r",
      title: "T",
      kind: "fraud",
      note: "",
      likelihood,
      severity,
    });
    const [rebuilt] =
      processEntries([
        {
          id: "x",
          name: "Deposits",
          risks: [
            risk(9, 0),
            risk(Number.NaN, 3),
            risk(2, "high"),
            risk(Infinity, 3),
            risk(undefined, 3),
            risk(4, 5),
          ],
        },
      ]) ?? [];
    expect(rebuilt.risks?.map((r) => [r.likelihood, r.severity])).toEqual([
      [5, 1],
      [4, 5],
    ]);
  });

  it("reads criticality and kind through the register importer's words", () => {
    const item = (fields: Record<string, unknown>) =>
      knowledgeEntries([
        { id: "k", name: "Close the month", linkedProcessIds: [], ...fields },
      ])?.[0];
    expect(item({ criticality: "high" })?.criticality).toBe("critical");
    expect(item({ criticality: "Nice to have" })?.criticality).toBe("nice-to-have");
    for (const junk of ["urgent", null, "", 0, {}, undefined]) {
      expect(item({ criticality: junk })?.criticality).toBe("important");
    }
    expect(item({ criticality: "critical", kind: "tasks" })?.kind).toBe("task");
    expect(item({ criticality: "critical", kind: "weird" })?.kind).toBe("duty");
    expect(item({ criticality: "critical", kind: null })?.kind).toBe("duty");
    expect(item({ criticality: "critical" })).not.toHaveProperty("kind");
  });

  it("leaves every sample's lists exactly as they are", () => {
    for (const { id } of INDUSTRIES) {
      const { customPeople, customProcesses, customKnowledge } = sample(id);
      expect(JSON.stringify(peopleEntries(customPeople))).toBe(JSON.stringify(customPeople));
      expect(JSON.stringify(processEntries(customProcesses))).toBe(JSON.stringify(customProcesses));
      expect(JSON.stringify(knowledgeEntries(customKnowledge))).toBe(
        JSON.stringify(customKnowledge),
      );
    }
  });
});

describe("malformedList", () => {
  it("names the list a rebuild would change", () => {
    const people = sample("general");
    people.customPeople[0].entitlements = [null, "record_deposits"];
    expect(malformedList(people)).toBe("customPeople");
    const duties = sample("general");
    duties.customPeople[0].entitlements = { length: 2 };
    expect(malformedList(duties)).toBe("customPeople");
    const processes = sample("general");
    processes.customProcesses[0].inputs = 7;
    expect(malformedList(processes)).toBe("customProcesses");
    const risks = sample("general");
    risks.customProcesses[0].risks = "text";
    expect(malformedList(risks)).toBe("customProcesses");
    const knowledge = sample("general");
    knowledge.customKnowledge[0].criticality = "urgent";
    expect(malformedList(knowledge)).toBe("customKnowledge");
  });

  it("does not count a field the rebuild only fills in as a change", () => {
    const profile = sample("general");
    delete profile.customKnowledge[0].linkedProcessIds;
    delete profile.customProcesses[0].dependencies;
    delete profile.customPeople[0].entitlements;
    expect(malformedList(profile)).toBeNull();
  });

  it("does not count a null list, which every reader reads as none", () => {
    const profile = sample("general");
    profile.customPeople[0].entitlements = null;
    profile.customProcesses[0].risks = null;
    profile.customProcesses[0].inputs = null;
    expect(malformedList(profile)).toBeNull();
    profile.customKnowledge[0].criticality = null;
    expect(malformedList(profile)).toBe("customKnowledge");
  });

  it("passes every sample", () => {
    for (const { id } of INDUSTRIES) expect(malformedList(sample(id))).toBeNull();
  });
});
