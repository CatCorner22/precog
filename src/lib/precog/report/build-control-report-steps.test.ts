import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { buildStartHereModel } from "../start-here/model";
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
      const startHere = buildStartHereModel({
        profile,
        template: tpl,
        today: new Date(2026, 8, 26),
      }).firstSteps.steps.slice(0, 6);

      expect(model.steps.map((s) => s.control.id)).toEqual(startHere.map((s) => s.control.id));
    },
  );

  it("dental sample leads with splitting one duty out, not the owner bank-statement review", () => {
    const { model } = reportFor("dental");
    expect(model.steps[0]?.control.id).toBe("split-one-duty-out");
  });
});
