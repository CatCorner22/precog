import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { UNANSWERED } from "../onboarding/setup-answers";
import { buildStartHereModel } from "../start-here/model";
import { buildControlReportModel } from "./build-control-report";
import { nonprofitLeaderPeople } from "@/test/nonprofit-leader-team";

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

  it("leaves a setup-confirmed owner statement review out of the report and Start here", () => {
    const { profile } = reportFor("general");
    const answers = { ...UNANSWERED, ownerReadsStatement: "yes" as const };
    const baseline = buildControlReportModel({
      tpl: resolveTemplate(profile),
      profile,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: true,
      businessName: "Sample",
    });
    const confirmed = { ...profile, setupAnswers: answers };
    const template = resolveTemplate(confirmed);
    const report = buildControlReportModel({
      tpl: template,
      profile: confirmed,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: true,
      businessName: "Sample",
    });
    const startHere = buildStartHereModel({
      profile: confirmed,
      template,
      today: new Date(2026, 8, 26),
    });

    expect(baseline.steps.some((step) => step.control.id === "owner-opens-bank-statement")).toBe(
      true,
    );
    expect(report.steps.some((step) => step.control.id === "owner-opens-bank-statement")).toBe(
      false,
    );
    expect(
      startHere.firstSteps.steps.some((step) => step.control.id === "owner-opens-bank-statement"),
    ).toBe(false);
  });
});

describe("the bank-statement step on a nonprofit report", () => {
  const BOARD = "A board member opens the bank statement first, before anyone else handles it";
  const OWNER = "Owner opens the bank statement first, before anyone else handles it";

  it("names a board member on the nonprofit sample and the owner on the retail sample", () => {
    const nonprofit = reportFor("nonprofit").model;
    const step = nonprofit.steps.find((s) => s.control.id === "owner-opens-bank-statement");
    expect(step?.control.label).toBe(BOARD);
    expect(nonprofit.steps.some((s) => s.control.label.startsWith("Owner opens"))).toBe(false);
    const retail = reportFor("retail").model;
    expect(
      retail.steps.find((s) => s.control.id === "owner-opens-bank-statement")?.control.label,
    ).toBe(OWNER);
  });

  it("leads the summary with the board member when that step comes first", () => {
    const profile = { ...defaultProfile("nonprofit"), customPeople: nonprofitLeaderPeople() };
    const tpl = resolveTemplate(profile);
    const model = buildControlReportModel({
      tpl,
      profile,
      mapCustomized: false,
      today: "2026-09-26",
      trackFreshness: false,
      mapReady: true,
      businessName: "Leader-led nonprofit",
    });
    expect(model.steps[0]?.control.id).toBe("owner-opens-bank-statement");
    expect(model.steps[0]?.control.label).toBe(BOARD);
    expect(model.summary.join(" ")).toContain(
      "First step: a board member opens the bank statement first, before anyone else handles it.",
    );
    expect(model.summary.join(" ")).not.toContain("owner opens the bank statement");
  });
});
