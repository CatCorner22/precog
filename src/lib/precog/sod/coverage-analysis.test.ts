import { describe, expect, it } from "vitest";
import type { RoleAssignment } from "./assignments";
import type { EntitlementId } from "./conflict-rules";
import { analyzeAbsenceImpact, analyzeDutyCoverage, KEEP_FEW_DUTIES } from "./coverage-analysis";

const person = (id: string, entitlements: EntitlementId[]): RoleAssignment => ({
  personId: id,
  personName: id === "p1" ? "Ana Ruiz" : "Ben Ochoa",
  role: "Bookkeeper",
  entitlements,
});

describe("stand-in cover", () => {
  const base = [
    person("p1", ["collect_cash", "export_bulk_data"]),
    person("p2", ["collect_cash", "post_payments"]),
  ];

  it("does not rise when a second person can export data in bulk, and lists both holders", () => {
    const one = analyzeDutyCoverage(base);
    const two = analyzeDutyCoverage([
      base[0],
      { ...base[1], entitlements: [...base[1].entitlements, "export_bulk_data"] },
    ]);
    expect(two.resilienceScore).toBe(one.resilienceScore);
    const held = two.keepFew.find((d) => d.entitlementId === "export_bulk_data")!;
    expect(held.assignees.map((a) => a.personName)).toEqual(["Ana Ruiz", "Ben Ochoa"]);
    expect(two.singlePoints.some((d) => KEEP_FEW_DUTIES.has(d.entitlementId))).toBe(false);
  });

  it("does not fall when nobody holds bulk export, access, admin, backups or log review", () => {
    const withExport = analyzeDutyCoverage(base);
    const without = analyzeDutyCoverage([
      person("p1", ["collect_cash"]),
      person("p2", ["collect_cash", "post_payments"]),
    ]);
    expect(without.resilienceScore).toBe(withExport.resilienceScore);
    expect(without.unassigned.some((d) => KEEP_FEW_DUTIES.has(d.entitlementId))).toBe(false);
    expect(without.keepFew).toEqual([]);
  });

  it("still rises when a duty that needs a stand-in gets a second holder", () => {
    const before = analyzeDutyCoverage(base);
    const after = analyzeDutyCoverage([
      base[0],
      { ...base[1], entitlements: [...base[1].entitlements, "prepare_deposit"] },
      person("p3", ["prepare_deposit"]),
    ]);
    expect(after.resilienceScore).toBeGreaterThan(before.resilienceScore);
  });

  it("does not report losing a second bulk exporter as a lost stand-in", () => {
    const team = [
      person("p1", ["export_bulk_data"]),
      person("p2", ["export_bulk_data"]),
      person("p3", ["collect_cash"]),
    ];
    const impact = analyzeAbsenceImpact(team, "p2")!;
    expect(impact.newlySinglePoint.some((d) => d.entitlementId === "export_bulk_data")).toBe(false);
  });
});
