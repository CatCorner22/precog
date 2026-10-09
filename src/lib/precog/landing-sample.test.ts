import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./active-template";
import { doNextSteps } from "./actions/do-next";
import { LANDING_SAMPLE } from "./landing-sample";
import { defaultProfile } from "./practice-profile";
import { buildStartHereModel } from "./start-here/model";

describe("the landing page's sample block", () => {
  it("prints the dental sample's figures and first three steps as Start here does", () => {
    const profile = defaultProfile("dental");
    const template = resolveTemplate(profile);
    const model = buildStartHereModel({ profile, template, today: new Date(2026, 9, 9) });
    const steps = doNextSteps(model.firstSteps.items)
      .slice(0, 3)
      .map((step, i) => (i === 0 && model.firstSteps.firstLine) || step.control.label);
    expect(LANDING_SAMPLE.businessName).toBe(template.businessName);
    expect(LANDING_SAMPLE.openConflicts).toBe(model.figures.open);
    expect(LANDING_SAMPLE.critical).toBe(model.figures.openCritical);
    expect([...LANDING_SAMPLE.steps]).toEqual(steps);
  });
});
