import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "./active-template";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "./process-graph";
import {
  normalizeSystems,
  parseCadence,
  processDocumentationState,
  processRecordReport,
} from "./process-record";
import type { ProcessNode } from "./types";

function proc(id: string, extra: Partial<ProcessNode> = {}): ProcessNode {
  return {
    id,
    name: id,
    layer: "process",
    description: "",
    dependencies: [],
    controlIds: [],
    ...extra,
  };
}

describe("parseCadence", () => {
  it("accepts spreadsheet spellings", () => {
    expect(parseCadence("Daily")).toBe("daily");
    expect(parseCadence(" every day ")).toBe("daily");
    expect(parseCadence("Bi-weekly")).toBe("weekly");
    expect(parseCadence("yearly")).toBe("annual");
    expect(parseCadence("as needed")).toBe("ad-hoc");
    expect(parseCadence("ADHOC")).toBe("ad-hoc");
  });
  it("returns undefined for blanks and nonsense", () => {
    expect(parseCadence("")).toBeUndefined();
    expect(parseCadence(undefined)).toBeUndefined();
    expect(parseCadence("sometimes")).toBeUndefined();
  });
});

describe("normalizeSystems", () => {
  it("trims, dedupes case-insensitively, and caps", () => {
    expect(normalizeSystems([" Dentrix", "dentrix", "", "Bank portal "])).toEqual([
      "Dentrix",
      "Bank portal",
    ]);
    expect(normalizeSystems(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
});

describe("processDocumentationState", () => {
  it("mirrors the knowledge-item vocabulary", () => {
    expect(processDocumentationState(proc("a"))).toBe("none");
    expect(
      processDocumentationState(proc("a", { documented: false, procedureLocation: "x" })),
    ).toBe("none");
    expect(processDocumentationState(proc("a", { documented: true }))).toBe("unlocated");
    expect(processDocumentationState(proc("a", { documented: true, procedureLocation: " " }))).toBe(
      "unlocated",
    );
    expect(
      processDocumentationState(proc("a", { documented: true, procedureLocation: "Drive" })),
    ).toBe("located");
  });
});

describe("processRecordReport", () => {
  it("is 100% documented with no processes", () => {
    const r = processRecordReport([]);
    expect(r.documentedIndex).toBe(100);
    expect(r.gaps).toEqual([]);
  });

  it("ranks nothing-written before unlocated, then by how soon the process stops", () => {
    const r = processRecordReport([
      proc("annual-none", { cadence: "annual" }),
      proc("weekly-unlocated", { cadence: "weekly", documented: true }),
      proc("daily-none", { cadence: "daily", ownerPersonIds: ["p1"] }),
      proc("located", { documented: true, procedureLocation: "Binder", cadence: "daily" }),
      proc("no-cadence-none"),
    ]);
    expect(r.counts).toEqual({ none: 3, unlocated: 1, located: 1 });
    expect(r.documentedIndex).toBe(20);
    expect(r.cadenceUnknown).toBe(1);
    expect(r.gaps.map((g) => g.process.id)).toEqual([
      "daily-none",
      "no-cadence-none",
      "annual-none",
      "weekly-unlocated",
    ]);
    expect(r.gaps[0].unowned).toBe(false);
    expect(r.gaps[1].unowned).toBe(true);
    expect(r.gaps[1].nextStep).toMatch(/assign an owner/);
    expect(r.gaps[3].nextStep).toMatch(/Record where the written procedure/);
  });

  it("names the systems in the next step so the writer knows where to look", () => {
    const r = processRecordReport([proc("x", { systems: ["Dentrix", "Bank portal"] })]);
    expect(r.gaps[0].nextStep).toContain("in Dentrix, Bank portal");
  });
});

describe("validateProcessMap record checks", () => {
  const people = [{ id: "p1", name: "A", role: "Owner", active: true }];

  it("emits one info issue per process listing what the record is missing", () => {
    const issues = validateProcessMap([proc("a", { ownerPersonIds: ["p1"] })], people, new Set());
    const record = issues.filter((i) => i.id.startsWith("record-"));
    expect(record).toHaveLength(1);
    expect(record[0].severity).toBe("info");
    expect(record[0].message).toMatch(/no written procedure/);
    expect(record[0].message).toMatch(/no cadence/);
  });

  it("says nothing when cadence and a findable procedure are recorded", () => {
    const issues = validateProcessMap(
      [
        proc("a", {
          ownerPersonIds: ["p1"],
          cadence: "daily",
          documented: true,
          procedureLocation: "Drive",
        }),
      ],
      people,
      new Set(),
    );
    expect(issues.some((i) => i.id.startsWith("record-"))).toBe(false);
  });

  it("asks for the location when the procedure exists but is unlocated", () => {
    const issues = validateProcessMap(
      [proc("a", { ownerPersonIds: ["p1"], cadence: "daily", documented: true })],
      people,
      new Set(),
    );
    const record = issues.find((i) => i.id === "record-a")!;
    expect(record.message).toMatch(/nobody recorded where it lives/);
    expect(record.message).not.toMatch(/cadence/);
  });

  it("does not let record gaps count against integrity", () => {
    const issues = validateProcessMap([proc("a", { ownerPersonIds: ["p1"] })], people, new Set());
    expect(issues.filter((i) => i.severity === "warn" || i.severity === "error")).toEqual([]);
  });
});

describe("computeMapHealth documentation dimension", () => {
  const tpl = getBaseTemplate("dental");

  it("weights sum to one and the dimension is present", () => {
    const graph = buildProcessMapGraph(tpl, undefined);
    const health = computeMapHealth(graph.snapshots, []);
    const sum = health.dimensions.reduce((s, d) => s + d.weight, 0);
    expect(Math.round(sum * 100)).toBe(100);
    const doc = health.dimensions.find((d) => d.id === "documentation")!;
    expect(doc).toBeDefined();
    // The stock template records no procedures, and the score says so.
    expect(doc.score).toBe(0);
    expect(doc.hint).toMatch(/nothing written down/);
  });

  it("gives half credit for written-but-unlocated and full credit for located", () => {
    const withDocs = {
      ...tpl,
      processes: tpl.processes.map((p, i) => ({
        ...p,
        documented: true,
        procedureLocation: i % 2 === 0 ? "Drive" : undefined,
      })),
    };
    const graph = buildProcessMapGraph(withDocs, undefined);
    const doc = computeMapHealth(graph.snapshots, []).dimensions.find(
      (d) => d.id === "documentation",
    )!;
    const n = tpl.processes.length;
    const located = Math.ceil(n / 2);
    expect(doc.score).toBe(Math.round(((located + (n - located) * 0.5) / n) * 100));
    const all = buildProcessMapGraph(
      {
        ...tpl,
        processes: tpl.processes.map((p) => ({ ...p, documented: true, procedureLocation: "x" })),
      },
      undefined,
    );
    const full = computeMapHealth(all.snapshots, []).dimensions.find(
      (d) => d.id === "documentation",
    )!;
    expect(full.score).toBe(100);
    expect(full.hint).toBe("Every process has a findable procedure");
  });
});
