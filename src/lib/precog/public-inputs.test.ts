import { describe, expect, it } from "vitest";
import { INVALID_REQUEST_MESSAGE, RequestError } from "@/lib/request-errors";
import { getBaseTemplate } from "./active-template";
import { pioneerProfileFrom } from "./coach/pioneer-profile";
import { defaultProfile } from "./practice-profile";
import {
  parseLoadShareInput,
  parsePioneerInput,
  parseReviewInput,
  parseSuggestionInput,
} from "./public-inputs";

/** The call throws a 400 RequestError with the generic message, not a TypeError. */
function expectInvalid(call: () => unknown) {
  let thrown: unknown;
  try {
    call();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(RequestError);
  expect((thrown as RequestError).status).toBe(400);
  expect((thrown as RequestError).message).toBe(INVALID_REQUEST_MESSAGE);
}

describe("parseLoadShareInput", () => {
  it("reads a token and trims the passcode", () => {
    expect(parseLoadShareInput({ token: "ab12", passcode: "  secret12 " })).toEqual({
      token: "ab12",
      passcode: "secret12",
    });
    expect(parseLoadShareInput({ token: "ab12" })).toEqual({ token: "ab12" });
    expect(parseLoadShareInput({ token: "ab12", passcode: "   " }).passcode).toBeUndefined();
  });

  it("refuses missing, null and mistyped input with a 400", () => {
    // Each of these crashed with a TypeError before.
    expectInvalid(() => parseLoadShareInput(undefined));
    expectInvalid(() => parseLoadShareInput(null));
    expectInvalid(() => parseLoadShareInput({ token: { toString: null } }));
    expectInvalid(() => parseLoadShareInput({ token: 5 }));
    expectInvalid(() => parseLoadShareInput({ token: "ab12", passcode: 1234 }));
    expectInvalid(() => parseLoadShareInput({ token: "a".repeat(257) }));
  });
});

describe("parseSuggestionInput", () => {
  const realistic = {
    processName: "Payroll",
    description: "Runs every other Friday",
    industryLabel: "Dental practice",
    existingRiskTitles: ["Ghost employee"],
    existingIdeaTitles: [],
    availableControls: [{ id: "c1", name: "Dual approval" }],
    ownerRoles: ["Office manager"],
  };

  it("reads what the suggest panel sends unchanged", () => {
    expect(parseSuggestionInput(realistic)).toEqual(realistic);
  });

  it("fills defaults and keeps the earlier truncation", () => {
    const parsed = parseSuggestionInput({
      processName: "x".repeat(200),
      existingRiskTitles: Array.from({ length: 30 }, (_, i) => `r${i}`),
    });
    expect(parsed.processName).toHaveLength(80);
    expect(parsed.industryLabel).toBe("small business");
    expect(parsed.existingRiskTitles).toHaveLength(20);
    expect(parsed.availableControls).toEqual([]);
  });

  it("refuses the malformed input that used to crash", () => {
    expectInvalid(() => parseSuggestionInput(undefined));
    expectInvalid(() => parseSuggestionInput(null));
    expectInvalid(() => parseSuggestionInput({ existingRiskTitles: "not-an-array" }));
    expectInvalid(() => parseSuggestionInput({ availableControls: [null] }));
    expectInvalid(() => parseSuggestionInput({ processName: { toString: null } }));
  });
});

describe("parseReviewInput", () => {
  const realistic = {
    businessName: "Harbor Dental",
    industryLabel: "Dental practice",
    teamSize: 6,
    health: {
      score: 64,
      band: "Adequate",
      dimensions: [{ label: "Ownership", score: 70, hint: "Most processes have an owner" }],
    },
    processes: [
      {
        id: "p1",
        name: "Payroll",
        stage: 2,
        owners: ["Dana"],
        controls: ["c1"],
        riskTitles: ["Ghost employee"],
        fraudRisks: 1,
        heat: 55,
        dependencyCount: 1,
        openSodGaps: 0,
      },
    ],
    issues: ["Payroll has one owner"],
    overburdened: [{ name: "Dana", role: "Office manager", flags: ["Sole approver"] }],
    unownedProcesses: ["Inventory"],
  };

  it("reads what the process builder sends unchanged", () => {
    expect(parseReviewInput(realistic)).toEqual(realistic);
  });

  it("keeps the earlier clamping", () => {
    const parsed = parseReviewInput({
      ...realistic,
      teamSize: 900,
      health: { score: Number.NaN, band: "x", dimensions: [] },
      processes: [{ ...realistic.processes[0], heat: 400, stage: undefined }],
    });
    expect(parsed.teamSize).toBe(200);
    expect(parsed.health.score).toBe(0);
    expect(parsed.processes[0].heat).toBe(100);
    expect(parsed.processes[0].stage).toBe(0);
  });

  it("refuses the malformed input that used to crash", () => {
    expectInvalid(() => parseReviewInput(undefined));
    expectInvalid(() => parseReviewInput({ businessName: "X", processes: [null] }));
    expectInvalid(() => parseReviewInput({ businessName: "X", health: { dimensions: "abc" } }));
    expectInvalid(() =>
      parseReviewInput({ businessName: "X", processes: [{ id: "p", name: "n", owners: 5 }] }),
    );
    expectInvalid(() => parseReviewInput({ businessName: { toString: null } }));
  });
});

describe("parsePioneerInput", () => {
  it("reads the profile the Pioneer panel sends", () => {
    const tpl = getBaseTemplate("dental");
    const profile = defaultProfile("dental");
    const wire = {
      question: "  What should I fix first? ",
      today: "2026-09-23",
      profile: {
        industry: profile.industry,
        practiceName: profile.practiceName,
        staff: profile.staff,
        riskVariables: profile.riskVariables,
        dualRelease: profile.dualRelease,
        customProcesses: tpl.processes,
        customPeople: tpl.people,
        customKnowledge: tpl.knowledge,
        customRelations: tpl.relations,
        decisions: [],
        plannedAbsences: [],
      },
    };
    const parsed = parsePioneerInput(wire);
    expect(parsed.question).toBe("What should I fix first?");
    expect(parsed.preferLocal).toBe(false);
    expect(parsed.today).toBe("2026-09-23");
    expect(parsed.profile).toEqual(wire.profile);
    // And the canonical profile builds from it without complaint.
    expect(pioneerProfileFrom(parsed.profile).customProcesses).toHaveLength(tpl.processes.length);
  });

  it("accepts no profile at all", () => {
    expect(parsePioneerInput({}).profile).toEqual({});
    expect(parsePioneerInput({ profile: null }).profile).toEqual({});
  });

  it("refuses the malformed input that used to crash", () => {
    expectInvalid(() => parsePioneerInput(undefined));
    expectInvalid(() => parsePioneerInput(null));
    expectInvalid(() => parsePioneerInput({ question: 5 }));
    expectInvalid(() => parsePioneerInput({ profile: { practiceName: 5 } }));
    expectInvalid(() => parsePioneerInput({ profile: { customPeople: [null] } }));
    expectInvalid(() => parsePioneerInput({ profile: { customProcesses: [{ name: "no id" }] } }));
    expectInvalid(() =>
      parsePioneerInput({ profile: { customProcesses: [{ id: "a", ownerPersonIds: "p1" }] } }),
    );
    expectInvalid(() => parsePioneerInput({ profile: { staff: { teamSize: "lots" } } }));
    expectInvalid(() => parsePioneerInput({ profile: { riskVariables: { annualRevenue: "x" } } }));
    expectInvalid(() => parsePioneerInput({ profile: { customRelations: [{ personId: 1 }] } }));
  });

  it("checks only the entries Pioneer keeps", () => {
    const people = Array.from({ length: 260 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    // Entries past the cap are dropped downstream anyway, so they are not checked.
    const parsed = parsePioneerInput({ profile: { customPeople: [...people, null] } });
    expect(parsed.profile.customPeople).toHaveLength(250);
  });
});
