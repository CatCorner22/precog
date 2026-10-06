import { describe, expect, it } from "vitest";
import {
  mapBackupJson,
  mapBackupSizeRefusal,
  MAX_MAP_BACKUP_BYTES,
  parseMapBackup,
} from "./map-backup";
import { resolveTemplate } from "../active-template";
import { mitigatedSodRuleIds } from "../controls/dual-release-summary";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { getIndustryTemplate } from "../templates";
import { defaultProfile } from "../practice-profile";
import { enrichProcess } from "../process-graph";
import { computeMapHealth } from "../process-health";
import { validateProcessMap } from "../process-validation";

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

  it("brings back the business name, cleaned, and reads none when the file has none", () => {
    const json = mapBackupJson({
      industry: profile.industry,
      businessName: "  Bright‮ Smiles  ",
      processes: tpl.processes,
      people: tpl.people,
      layout: {},
    });
    expect(parseMapBackup(JSON.parse(json)).businessName).toBe("Bright Smiles");
    expect(parseMapBackup(backupOf(tpl.processes)).businessName).toBe("");
    expect(parseMapBackup(backupOf(tpl.processes, { businessName: 7 })).businessName).toBe("");
  });

  it("keeps the household mark, so related signers do not count as dual control after a restore", () => {
    // The stress test's case: the whole general team marked as one household,
    // dual release on, unrelated signers not attested.
    const general = getIndustryTemplate("general");
    const sample = defaultProfile("general");
    const policy = {
      ...sample.dualRelease,
      enabled: true,
      rules: sample.dualRelease.rules.map((rule) => ({ ...rule, enabled: true })),
      unrelatedSignersAttested: false,
    };
    const people = general.people.map((person) => ({ ...person, householdKey: "Smith home" }));
    const before = { ...general, people };
    const restored = parseMapBackup(
      JSON.parse(
        mapBackupJson({
          industry: "general",
          businessName: "x",
          processes: general.processes,
          people,
          layout: {},
        }),
      ),
    ).people;
    const after = { ...general, people: restored };
    expect(restored.map((person) => person.householdKey)).toEqual(people.map(() => "Smith home"));
    expect(mitigatedSodRuleIds(policy, after, "2026-10-06").size).toBe(0);
    const health = (t: typeof general) =>
      detectSodConflicts(t, sample.staff, sodDetectionOptions(t, policy)).summary.segregationHealth;
    expect(health(before)).toBe(12);
    expect(health(after)).toBe(12);
  });

  it("refuses a file past the import size with its size and the limit", () => {
    expect(mapBackupSizeRefusal(1024)).toBeNull();
    expect(mapBackupSizeRefusal(MAX_MAP_BACKUP_BYTES)).toBeNull();
    expect(mapBackupSizeRefusal(MAX_MAP_BACKUP_BYTES + 1)).toBe(
      "This file is too large to import (3 MB; the limit is 2 MB). Export a smaller map, or split it first.",
    );
  });
});
