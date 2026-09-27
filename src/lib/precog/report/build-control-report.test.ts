import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { IndustryTemplate } from "../templates";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { coverageReport } from "../continuity/coverage";
import { isOwnSector } from "../evidence";
import { buildControlReportModel, type ControlReportInput } from "./build-control-report";

function input(
  industry: PracticeProfile["industry"],
  overrides: Partial<ControlReportInput> = {},
): ControlReportInput {
  const profile = defaultProfile(industry);
  return {
    tpl: resolveTemplate(profile),
    profile,
    mapCustomized: false,
    today: "2026-09-26",
    trackFreshness: false,
    mapReady: true,
    businessName: "Sample",
    ...overrides,
  };
}

describe("buildControlReportModel", () => {
  it.each(INDUSTRIES.map((i) => i.id))("%s sample: prints the dashboard's figures", (industry) => {
    const args = input(industry);
    const model = buildControlReportModel(args);
    const sod = detectSodConflicts(
      args.tpl,
      args.profile.staff,
      sodDetectionOptions(args.tpl, args.profile.dualRelease),
    );
    expect(model.sod.summary).toEqual(sod.summary);
    expect(model.continuity.coverageIndex).toBe(coverageReport(args.tpl).coverageIndex);
    expect(model.sod.recommendations.length).toBeGreaterThan(0);
  });

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: lists its own sector's cases first and counts only citing cases",
    (industry) => {
      const model = buildControlReportModel(input(industry));
      const own = model.evidence.map((c) => isOwnSector(c, industry));
      expect(own).toEqual([...own].sort((a, b) => Number(b) - Number(a)));
      expect(model.citing.count).toBeLessThanOrEqual(model.evidence.length);
      expect(model.statsScope.count).toBe(model.citing.count);
      expect(model.lossRange?.n ?? 0).toBeLessThanOrEqual(model.citing.count);
    },
  );

  it("a later day leaves the duty-conflict counts and cases unchanged", () => {
    const early = buildControlReportModel(input("dental", { today: "2026-09-26" }));
    const late = buildControlReportModel(input("dental", { today: "2027-09-26" }));
    expect(late.sod.summary).toEqual(early.sod.summary);
    expect(late.citing.count).toBe(early.citing.count);
  });

  it("gives no loss figure when no case shows the open gaps", () => {
    const base = input("dental");
    const tpl: IndustryTemplate = {
      ...base.tpl,
      people: [
        {
          id: "x1",
          name: "Solo Clerk",
          role: "Clerk",
          active: true,
          entitlements: ["approve_writeoffs", "edit_patient_master"],
        },
      ],
      relations: [],
      roleTemplates: {},
    };
    const model = buildControlReportModel({ ...base, tpl, mapReady: false });
    expect(model.sod.conflicts.some((c) => c.ruleId.startsWith("family-"))).toBe(true);
    expect(model.citing.count).toBe(0);
    expect(model.evidence.length).toBeGreaterThan(0);
    expect(model.lossRange).toBeNull();
    expect(model.found.n).toBe(0);
  });
});
