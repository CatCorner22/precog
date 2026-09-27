import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { rankFirstSteps } from "../coach/first-steps";
import { recommendedStepsForRules } from "../evidence";
import { buildControlReportModel } from "./build-control-report";

function reportFor(industry: (typeof INDUSTRIES)[number]["id"]) {
  const profile = defaultProfile(industry);
  const tpl = resolveTemplate(profile);
  const model = buildControlReportModel({
    tpl,
    profile,
    mapCustomized: false,
    today: "2026-09-26",
    trackFreshness: false,
    mapReady: true,
    businessName: "Sample",
  });
  return { profile, tpl, model };
}

describe("control report 'Do these first'", () => {
  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: the report lists the steps in Start here's order",
    (industry) => {
      const { profile, tpl, model } = reportFor(industry);
      // Start here's ranking (use-start-here.ts): open = not accepted and
      // not the owner's own pair; ranked by the findings each control answers.
      const sod = detectSodConflicts(
        tpl,
        profile.staff,
        sodDetectionOptions(tpl, profile.dualRelease),
      );
      const open = sod.conflicts.filter((c) => !c.residualRiskAccepted && !c.ownerHeld);
      const ruleIds = [...new Set(open.map((c) => c.ruleId))];
      const stillOpen = open.filter((c) => !c.dualReleaseMitigated);
      const startHere = rankFirstSteps(recommendedStepsForRules(ruleIds), stillOpen).slice(0, 6);

      expect(model.steps.map((s) => s.control.id)).toEqual(startHere.map((s) => s.control.id));
    },
  );

  it("dental sample leads with splitting one duty out, not the owner bank-statement review", () => {
    const { model } = reportFor("dental");
    expect(model.steps[0]?.control.id).toBe("split-one-duty-out");
  });
});
