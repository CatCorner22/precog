import { describe, expect, it } from "vitest";
import { mapBackupJson, parseMapBackup } from "./map-backup";
import { resolveTemplate } from "../active-template";
import { defaultProfile } from "../practice-profile";
import { computeMapHealth, enrichProcess, validateProcessMap } from "../process-graph";

const profile = defaultProfile();
const tpl = resolveTemplate(profile);

function backupOf(processes: unknown[], extra: Record<string, unknown> = {}) {
  return { version: 3, processes, people: tpl.people, layout: {}, ...extra };
}

describe("parseMapBackup", () => {
  it("round-trips the builder's own export", () => {
    const json = mapBackupJson({
      industry: profile.industry,
      businessName: "Bright Smiles",
      processes: tpl.processes,
      people: tpl.people,
      layout: { [tpl.processes[0].id]: { x: 10, y: 20 } },
    });
    const backup = parseMapBackup(JSON.parse(json));
    expect(backup.dropped).toBe(0);
    expect(backup.processes.map((p) => p.id)).toEqual(tpl.processes.map((p) => p.id));
    expect(backup.processes[0].risks).toEqual(tpl.processes[0].risks ?? []);
    expect(backup.layout[tpl.processes[0].id]).toEqual({ x: 10, y: 20 });
  });

  it("drops a malformed risk so the health score stays a number", () => {
    const [first, ...rest] = tpl.processes;
    const broken = { ...first, risks: [{ id: "r1", title: "No numbers", kind: "fraud" }] };
    const backup = parseMapBackup(backupOf([broken, ...rest]));
    expect(backup.processes[0].risks).toEqual([]);
    expect(backup.dropped).toBe(1);
    const snapshots = backup.processes.map((p) => enrichProcess(tpl, p, profile.staff));
    const issues = validateProcessMap(backup.processes, tpl.people, new Set(), {});
    expect(Number.isFinite(computeMapHealth(snapshots, issues).score)).toBe(true);
  });

  it("rejects positions that are not finite numbers", () => {
    const backup = parseMapBackup(
      backupOf(tpl.processes, { layout: { a: { x: 1, y: 2 }, b: { x: "1", y: 2 }, c: { x: 1 } } }),
    );
    expect(backup.layout).toEqual({ a: { x: 1, y: 2 } });
    expect(backup.dropped).toBe(2);
  });

  it("skips a process with no name and prunes links to it", () => {
    const [first, second] = tpl.processes;
    const backup = parseMapBackup(
      backupOf([
        { ...first, dependencies: [second.id, "proc-gone"] },
        { ...second, name: "" },
      ]),
    );
    expect(backup.processes.map((p) => p.id)).toEqual([first.id]);
    expect(backup.processes[0].dependencies).toEqual([]);
  });

  it("says so when the file has nothing to restore", () => {
    expect(() => parseMapBackup({ processes: [] })).toThrow(/no processes/);
    expect(() => parseMapBackup("text")).toThrow(/no processes/);
    expect(() => parseMapBackup({ processes: [{ name: "No id" }] })).toThrow(/id and a name/);
  });
});
