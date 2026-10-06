import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { openConflictsByPerson } from "../coach/local-brief";
import { INDUSTRIES } from "../industry";
import { executeTool } from "../llm/tools";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { buildControlReportModel } from "../report/build-control-report";
import { buildStartHereModel } from "../start-here/model";
import { detectSodConflicts, sodDetectionOptions, type DetectedConflict } from "./detect";
import {
  belowThresholdNote,
  conflictStatus,
  conflictStatusPrintedV4,
  dualReleaseSplit,
  openFindings,
  openSodHint,
  partialDualReleaseCoverage,
  ruleIdsOf,
  type OpenSodCounts,
} from "./open-findings";

const finding = (over: Partial<DetectedConflict>) =>
  ({
    ruleId: "rule-vendor-create-pay",
    ownerHeld: false,
    residualRiskAccepted: false,
    dualReleaseMitigated: false,
    ...over,
  }) as DetectedConflict;

describe("openFindings", () => {
  it("keeps an accepted finding open: acceptance never closes one", () => {
    const accepted = finding({ residualRiskAccepted: true });
    expect(openFindings([accepted], new Map())).toEqual([accepted]);
  });

  it("closes a pair dual release covers at every amount, not one it covers above a threshold", () => {
    const narrowed = finding({ dualReleaseMitigated: true });
    expect(openFindings([narrowed], new Map())).toEqual([]);
    expect(openFindings([narrowed], new Map([["rule-vendor-create-pay", 500]]))).toEqual([
      narrowed,
    ]);
  });

  it("leaves out the owner's own pairs", () => {
    expect(openFindings([finding({ ownerHeld: true })], new Map())).toEqual([]);
  });
});

describe("conflictStatus", () => {
  const partial = new Map([["rule-vendor-create-pay", 500]]);

  it("reads a pair dual release covers only above a threshold as reduced, not closed", () => {
    expect(conflictStatus(finding({ dualReleaseMitigated: true }), partial)).toBe(
      "Reduced, not closed",
    );
    expect(conflictStatus(finding({ dualReleaseMitigated: true }), new Map())).toBe(
      "Covered by dual release",
    );
  });

  it("names the day of a logged acceptance decision, and keeps the finding open", () => {
    expect(conflictStatus(finding({}), new Map(), "2026-09-01")).toBe(
      "Open, risk accepted on Sep 1, 2026",
    );
    // The control's setting adds nothing once a dated decision says when.
    expect(conflictStatus(finding({ residualRiskAccepted: true }), new Map(), "2026-09-01")).toBe(
      "Open, risk accepted on Sep 1, 2026",
    );
    expect(conflictStatus(finding({ dualReleaseMitigated: true }), partial, "2026-09-01")).toBe(
      "Reduced, not closed; risk accepted on Sep 1, 2026",
    );
  });

  it("says plainly when the control's setting accepts the risk but no decision is logged", () => {
    const accepted = finding({ residualRiskAccepted: true });
    expect(conflictStatus(accepted, new Map())).toBe("Open, risk accepted (no decision logged)");
    const reduced = finding({ residualRiskAccepted: true, dualReleaseMitigated: true });
    expect(conflictStatus(reduced, partial)).toBe(
      "Reduced, not closed; risk accepted (no decision logged)",
    );
  });

  it("keeps the words report layouts 1 to 4 printed: no date and no note", () => {
    const accepted = finding({ residualRiskAccepted: true });
    expect(conflictStatusPrintedV4(accepted, new Map())).toBe("Open, risk accepted");
    expect(conflictStatusPrintedV4({ ...accepted, dualReleaseMitigated: true }, partial)).toBe(
      "Reduced, not closed; risk accepted",
    );
    expect(conflictStatusPrintedV4(finding({}), new Map())).toBe("Open");
    expect(conflictStatusPrintedV4(finding({ dualReleaseMitigated: true }), partial)).toBe(
      "Reduced, not closed",
    );
    expect(conflictStatusPrintedV4(finding({ dualReleaseMitigated: true }), new Map())).toBe(
      "Covered by dual release",
    );
    expect(conflictStatusPrintedV4(finding({ ownerHeld: true }), new Map())).toBe(
      "Owner's own duties",
    );
  });

  it("reads plain open with neither a decision nor the setting", () => {
    expect(conflictStatus(finding({}), new Map(), undefined)).toBe("Open");
    expect(conflictStatus(finding({ dualReleaseMitigated: true }), partial)).toBe(
      "Reduced, not closed",
    );
  });

  it("never prints an acceptance on a pair that is not open", () => {
    expect(conflictStatus(finding({ ownerHeld: true }), new Map(), "2026-09-01")).toBe(
      "Owner's own duties",
    );
    expect(conflictStatus(finding({ dualReleaseMitigated: true }), new Map(), "2026-09-01")).toBe(
      "Covered by dual release",
    );
  });

  it("reads open and the owner's own pairs", () => {
    expect(conflictStatus(finding({}), new Map())).toBe("Open");
    expect(conflictStatus(finding({ ownerHeld: true }), new Map())).toBe("Owner's own duties");
  });
});

describe("dualReleaseSplit", () => {
  it("counts a reduced pair once, apart from those covered at every amount", () => {
    const covered = finding({ ruleId: "rule-a", dualReleaseMitigated: true });
    const reduced = finding({ ruleId: "rule-b", dualReleaseMitigated: true });
    const partial = new Map([["rule-b", 150]]);
    expect(dualReleaseSplit([covered, reduced, finding({})], partial)).toEqual({
      closed: 1,
      reduced: 1,
    });
    expect(openFindings([covered, reduced], partial)).toEqual([reduced]);
  });

  it("leaves out the owner's own pairs, which read as the owner's whatever dual release covers", () => {
    const owners = finding({ ruleId: "rule-a", ownerHeld: true, dualReleaseMitigated: true });
    const ownersReduced = finding({
      ruleId: "rule-b",
      ownerHeld: true,
      dualReleaseMitigated: true,
    });
    const partial = new Map([["rule-b", 150]]);
    expect(conflictStatus(owners, partial)).toBe("Owner's own duties");
    expect(dualReleaseSplit([owners, ownersReduced], partial)).toEqual({ closed: 0, reduced: 0 });
  });
});

describe("one open count on every screen", () => {
  const variants = INDUSTRIES.flatMap(({ id }) => {
    const base = defaultProfile(id);
    const on: PracticeProfile = { ...base, dualRelease: { ...base.dualRelease, enabled: true } };
    return [
      { name: `${id}`, profile: base },
      { name: `${id} with dual release`, profile: on },
    ];
  });

  for (const { name, profile } of variants) {
    it(`gives the same open critical and high counts for the ${name} sample`, () => {
      const tpl = resolveTemplate(profile);
      const report = buildControlReportModel({
        tpl,
        profile,
        mapCustomized: false,
        today: "2026-09-26",
        trackFreshness: false,
        mapReady: true,
        businessName: "Sample",
      });
      // The duty-conflict tiles read the detector's summary.
      const panel = detectSodConflicts(
        tpl,
        profile.staff,
        sodDetectionOptions(tpl, profile.dualRelease),
      ).summary;
      const start = buildStartHereModel({ profile, template: tpl, today: new Date(2026, 8, 26) });
      const startOpen = openFindings(start.exposure.openConflicts, start.exposure.partialCoverage);
      const bySeverity = (open: readonly DetectedConflict[]) => [
        open.filter((c) => c.severity === "critical").length,
        open.filter((c) => c.severity === "high").length,
      ];
      const counts = [panel.critical, panel.high];
      expect(bySeverity(startOpen)).toEqual(counts);
      expect([report.sodOpen.openCritical, report.sodOpen.openHigh]).toEqual(counts);
      expect([report.sod.summary.critical, report.sod.summary.high]).toEqual(counts);
      // The executive summary's total and critical count read the same findings.
      const total = panel.critical + panel.high + panel.medium + panel.family;
      expect(report.summary[0]).toMatch(
        total === 0
          ? /^No open duty conflicts/
          : new RegExp(
              `^${total} open duty conflicts?${panel.critical ? `, ${panel.critical} of them critical,` : ""}`,
            ),
      );

      // The coach and the AI's case evidence name the same rules.
      const partial = partialDualReleaseCoverage(profile.dualRelease, report.sod.conflicts);
      const rules = ruleIdsOf(openFindings(report.sod.conflicts, partial)).sort();
      const coach = openConflictsByPerson(profile, tpl).flatMap((p) => p.conflicts);
      expect(ruleIdsOf(coach).sort()).toEqual(rules);
      const evidence = executeTool("get_case_evidence", { profile });
      expect([...(evidence.data as { openRuleIds: string[] }).openRuleIds].sort()).toEqual(rules);
    });
  }

  it("shows no sample conflict as accepted: accepting a risk takes a logged decision", () => {
    for (const { id } of INDUSTRIES) {
      const profile = defaultProfile(id);
      const tpl = resolveTemplate(profile);
      const { conflicts } = detectSodConflicts(
        tpl,
        profile.staff,
        sodDetectionOptions(tpl, profile.dualRelease),
      );
      expect(
        conflicts.filter((c) => c.residualRiskAccepted).map((c) => c.id),
        id,
      ).toEqual([]);
    }
    const dental = defaultProfile("dental");
    const dentalTpl = resolveTemplate(dental);
    const cash = detectSodConflicts(
      dentalTpl,
      dental.staff,
      sodDetectionOptions(dentalTpl, dental.dualRelease),
    ).conflicts.filter((c) => c.linkedControlId === "c-sod-cash" && !c.ownerHeld);
    expect(cash.length).toBeGreaterThan(0);
    for (const c of cash) expect(conflictStatus(c, new Map())).toBe("Open");
  });

  it("counts an accepted finding as open on the duty-conflict tiles and the report", () => {
    const profile = defaultProfile("dental");
    const sample = resolveTemplate(profile);
    // The samples accept no risk, so accept the cash pair here as a business would.
    const tpl = {
      ...sample,
      controls: sample.controls.map((c) =>
        c.id === "c-sod-cash" ? { ...c, residualRiskAccepted: true } : c,
      ),
    };
    const report = buildControlReportModel({
      tpl,
      profile,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: true,
      businessName: "Sample",
    });
    const accepted = report.sod.conflicts.filter(
      (c) => c.residualRiskAccepted && !c.ownerHeld && !c.dualReleaseMitigated,
    );
    expect(accepted.filter((c) => c.severity === "critical").length).toBeGreaterThan(0);
    // Every accepted finding is in the open set, and the counts are that set's.
    const open = openFindings(report.sod.conflicts, report.partialCoverage);
    for (const c of accepted) expect(open).toContain(c);
    const bySeverity = (s: DetectedConflict["severity"]) =>
      open.filter((c) => c.severity === s).length;
    expect(report.sod.summary.critical).toBe(bySeverity("critical"));
    expect(report.sod.summary.high).toBe(bySeverity("high"));
    expect(report.sodOpen.openCritical).toBe(report.sod.summary.critical);
    expect(conflictStatus(accepted[0], report.partialCoverage)).toBe(
      "Open, risk accepted (no decision logged)",
    );
  });
});

const counts = (over: Partial<OpenSodCounts>): OpenSodCounts => ({
  openCritical: 0,
  openHigh: 0,
  criticalBelowThreshold: 0,
  highBelowThreshold: 0,
  ...over,
});

describe("openSodHint", () => {
  it("names the open critical findings while any is open", () => {
    expect(openSodHint(counts({ openCritical: 1, openHigh: 2 }))).toBe(
      "1 open critical duty conflict",
    );
  });

  it("names the open high findings that cap the word while no critical one is open", () => {
    expect(openSodHint(counts({ openHigh: 2 }))).toBe("2 open high duty conflicts");
  });

  it("reads zero critical when nothing caps the word", () => {
    expect(openSodHint(counts({}))).toBe("0 open critical duty conflicts");
  });
});

describe("belowThresholdNote", () => {
  it("explains a critical conflict dual release covers only above a threshold", () => {
    expect(belowThresholdNote(counts({ openCritical: 1, criticalBelowThreshold: 1 }))).toBe(
      "Dual release covers 1 critical duty conflict only above a threshold. Below the threshold one person still acts alone, so it counts as open.",
    );
  });

  it("explains high ones only while no critical one sets the word", () => {
    expect(belowThresholdNote(counts({ openHigh: 2, highBelowThreshold: 2 }))).toBe(
      "Dual release covers 2 high duty conflicts only above a threshold. Below the threshold one person still acts alone, so they count as open.",
    );
    expect(
      belowThresholdNote(counts({ openCritical: 1, openHigh: 1, highBelowThreshold: 1 })),
    ).toBeNull();
  });

  it("is null when no conflict that sets the word sits below a threshold", () => {
    expect(belowThresholdNote(counts({ openCritical: 2 }))).toBeNull();
    expect(belowThresholdNote(counts({}))).toBeNull();
  });
});
