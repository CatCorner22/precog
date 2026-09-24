import { describe, expect, it } from "vitest";
import {
  mapAssessed,
  mapNotAssessedNote,
  mapSource,
  starterMapFacts,
  starterProcesses,
  untouchedStarterProcessIds,
} from "./map-state";
import { diffMaps } from "./diff";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "../process-graph";

const people = buildOwnTeam([
  { name: "Ana Ruiz", role: "Owner", duties: ["bank_reconcile"] },
  { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments", "prepare_deposit"] },
]);

function ruiz() {
  return ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
}

describe("mapSource", () => {
  it("is the sample map until the owner enters their own people, even with map edits", () => {
    expect(mapSource({ industry: "dental" })).toBe("sample");
    expect(mapSource({ industry: "dental", customPeople: null, customProcesses: null })).toBe(
      "sample",
    );
    expect(mapSource({ industry: "dental", customProcesses: [] })).toBe("sample");
  });

  it("is a starter map for a fresh own business (own people, nobody assigned)", () => {
    const profile = ruiz();
    expect(profile.customProcesses ?? null).toBeNull();
    expect(resolveTemplate(profile).processes.every((p) => !p.ownerPersonIds?.length)).toBe(true);
    expect(mapSource(profile)).toBe("starter");
  });

  it("becomes the owner's own map once the map is edited or a process points at their person", () => {
    const profile = ruiz();
    const first = resolveTemplate(profile).processes[0];
    expect(mapSource({ ...profile, customProcesses: [{ ...first, ownerPersonIds: [] }] })).toBe(
      "own",
    );
    expect(mapSource({ ...profile, customProcesses: [] })).toBe("own");
    // The sample team edited in the builder keeps its ids, so the starter
    // map's owner references still resolve and the map counts as owned.
    const dental = getBaseTemplate("dental");
    expect(mapSource({ industry: "dental", customPeople: dental.people.slice(0, 3) })).toBe("own");
  });
});

describe("mapAssessed", () => {
  it("is false for a starter map and for an own map with no processes", () => {
    const profile = ruiz();
    expect(mapAssessed(profile)).toBe(false);
    expect(mapAssessed({ ...profile, customProcesses: [] })).toBe(false);
  });

  it("is true for the sample business and once the owner edits the map or assigns an owner", () => {
    expect(mapAssessed({ industry: "dental" })).toBe(true);
    expect(mapAssessed({ industry: "restaurant", customProcesses: [] })).toBe(true);
    const profile = ruiz();
    const first = resolveTemplate(profile).processes[0];
    const assigned = resolveTemplate({
      ...profile,
      customProcesses: [{ ...first, ownerPersonIds: ["own-2"] }],
    });
    expect(assigned.processes[0].ownerPersonIds).toEqual(["own-2"]);
    expect(mapAssessed({ ...profile, customProcesses: assigned.processes })).toBe(true);
  });
});

describe("mapNotAssessedNote", () => {
  it("names the starter process count and the industry example, in one sentence", () => {
    const profile = ruiz();
    expect(starterMapFacts(profile)).toEqual({
      count: 8,
      example: "dental / medical / veterinary office example",
    });
    expect(mapNotAssessedNote(profile)).toBe(
      "Your map holds 8 starter processes from the dental / medical / veterinary office example and none has an owner yet. Assign an owner to each, or build your own map, and these figures fill in.",
    );
  });

  it("asks for processes on an empty own map and is null once the map is assessed", () => {
    const profile = ruiz();
    expect(mapNotAssessedNote({ ...profile, customProcesses: [] })).toBe(
      "Your map has no processes yet. Add the processes your business runs in the map builder, and these figures fill in.",
    );
    expect(mapNotAssessedNote({ industry: "dental" })).toBeNull();
  });
});

describe("the sample business's map figures do not change", () => {
  // The controlled-drugs process added to the dental and medical sample is
  // one more process with a hot fraud risk and no written record: the score
  // moves from 73 to 72 and calm from 43 to 39.
  it("scores the dental demo exactly as before", () => {
    const profile = defaultProfile();
    const tpl = resolveTemplate(profile);
    const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
    const issues = validateProcessMap(
      tpl.processes,
      tpl.people,
      new Set(tpl.controls.map((c) => c.id)),
    );
    const health = computeMapHealth(snapshots, issues);
    expect(mapSource(profile)).toBe("sample");
    expect(mapAssessed(profile)).toBe(true);
    expect(health.score).toBe(72);
    expect(health.band).toBe("fair");
    expect(health.dimensions.map((d) => [d.id, d.score])).toEqual([
      ["integrity", 100],
      ["ownership", 100],
      ["controls", 100],
      ["documentation", 0],
      ["calm", 39],
    ]);
    expect(health.issueCount).toEqual({ errors: 0, warns: 0, infos: 8 });
    expect(health.hotProcesses).toBe(4);
    expect(health.unownedProcesses).toBe(0);
    expect(issues.map((i) => i.id)).toEqual([
      "record-proc-schedule",
      "record-proc-clinical",
      "record-proc-controlled",
      "record-proc-claims",
      "record-proc-cash",
      "record-proc-ar",
      "record-proc-ap",
      "record-proc-payroll",
    ]);
  });
});

describe("untouchedStarterProcessIds", () => {
  it("keeps every other starter process a starter when the owner assigns one owner", () => {
    const profile = ruiz();
    const processes = resolveTemplate(profile).processes;
    expect(untouchedStarterProcessIds(profile).size).toBe(processes.length);
    const owned = {
      ...profile,
      customProcesses: processes.map((p, i) =>
        i === 0 ? { ...p, ownerPersonIds: [people[0].id] } : p,
      ),
    };
    const left = untouchedStarterProcessIds(owned);
    expect(left.has(processes[0].id)).toBe(false);
    expect(left.size).toBe(processes.length - 1);
  });

  it("treats a renamed or re-described starter process as the owner's own", () => {
    const profile = ruiz();
    const processes = resolveTemplate(profile).processes;
    const edited = {
      ...profile,
      customProcesses: processes.map((p, i) => (i === 1 ? { ...p, name: `${p.name} (ours)` } : p)),
    };
    expect(untouchedStarterProcessIds(edited).has(processes[1].id)).toBe(false);
    expect(untouchedStarterProcessIds(edited).has(processes[0].id)).toBe(true);
  });

  it("is empty for the sample business", () => {
    expect(untouchedStarterProcessIds({ industry: "dental" }).size).toBe(0);
  });
});

describe("starterProcesses", () => {
  it("lists only the owner's one edit when they assign one owner, not the sample team or every process", () => {
    const profile = ruiz();
    const processes = resolveTemplate(profile).processes.map((p, i) =>
      i === 0 ? { ...p, ownerPersonIds: [people[0].id] } : p,
    );
    const diff = diffMaps({ processes: starterProcesses(profile), people }, { processes, people });
    expect(diff.total).toBe(1);
    expect(diff.modified.map((m) => m.changes)).toEqual([["owners"]]);
    expect(diff.peopleRemoved).toEqual([]);
  });

  it("keeps the starter's processes and leaves every owner off", () => {
    const starter = starterProcesses({ industry: "retail" });
    expect(starter.map((p) => p.id)).toEqual(getBaseTemplate("retail").processes.map((p) => p.id));
    expect(starter.every((p) => p.ownerPersonIds?.length === 0)).toBe(true);
  });
});

describe("a starter map the owner only renamed", () => {
  const people = [{ id: "own-1", name: "Ana", role: "Owner", active: true }];
  const starter = getBaseTemplate("retail").processes.map((p) => ({ ...p, ownerPersonIds: [] }));

  it("stays a starter map, not assessed, when a process is renamed with nobody assigned", () => {
    const renamed = starter.map((p, i) => (i === 0 ? { ...p, name: "Our sales desk" } : p));
    const profile = { industry: "retail" as const, customPeople: people, customProcesses: renamed };
    expect(mapSource(profile)).toBe("starter");
    expect(mapAssessed(profile)).toBe(false);
  });

  it("stays a starter map when the processes are only reordered", () => {
    const profile = {
      industry: "retail" as const,
      customPeople: people,
      customProcesses: [...starter].reverse(),
    };
    expect(mapSource(profile)).toBe("starter");
  });

  it("becomes the owner's map once a process is added or removed", () => {
    const profile = {
      industry: "retail" as const,
      customPeople: people,
      customProcesses: starter.slice(1),
    };
    expect(mapSource(profile)).toBe("own");
    expect(mapAssessed(profile)).toBe(true);
  });

  it("becomes the owner's map once one of their people owns a process", () => {
    const owned = starter.map((p, i) => (i === 0 ? { ...p, ownerPersonIds: ["own-1"] } : p));
    expect(mapSource({ industry: "retail", customPeople: people, customProcesses: owned })).toBe(
      "own",
    );
  });
});
