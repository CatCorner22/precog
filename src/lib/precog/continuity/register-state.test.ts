import { describe, expect, it } from "vitest";
import { registerAssessed, registerSource, trackRegisterFreshness } from "./register-state";
import { resolveTemplate } from "../active-template";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";

const people = buildOwnTeam([
  { name: "Ana Ruiz", role: "Owner", duties: ["bank_reconcile"] },
  { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments", "prepare_deposit"] },
]);

describe("registerSource", () => {
  it("is the sample register until the owner enters their own people", () => {
    expect(registerSource({})).toBe("sample");
    expect(registerSource({ customPeople: null, customRelations: null })).toBe("sample");
  });

  it("is a starter list for a fresh own business (own people, nobody marked)", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    expect(registerSource(profile)).toBe("starter");
  });

  it("becomes the owner's own register once someone is marked or the list is edited", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    expect(
      registerSource({
        ...profile,
        customRelations: [{ personId: "own-2", knowledgeId: "any", level: "expert" }],
      }),
    ).toBe("own");
    expect(registerSource({ ...profile, customKnowledge: [] })).toBe("own");
  });
});

describe("registerAssessed", () => {
  it("is false for a starter list with nobody marked and for an empty list", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const starter = resolveTemplate(profile);
    expect(starter.knowledge.length).toBeGreaterThan(0);
    expect(starter.relations).toEqual([]);
    expect(registerAssessed(starter)).toBe(false);
    expect(registerAssessed(resolveTemplate({ ...profile, customKnowledge: [] }))).toBe(false);
  });

  it("is true for a list the owner wrote, even with nobody marked yet", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const item = { ...resolveTemplate(profile).knowledge[0] };
    expect(registerAssessed(resolveTemplate({ ...profile, customKnowledge: [item] }))).toBe(true);
  });

  it("is true for the demo register and once one person is marked on one item", () => {
    expect(registerAssessed(resolveTemplate({ industry: "dental" }))).toBe(true);
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const first = resolveTemplate(profile).knowledge[0];
    const marked = resolveTemplate({
      ...profile,
      customRelations: [{ personId: "own-2", knowledgeId: first.id, level: "expert" }],
    });
    expect(marked.relations).toHaveLength(1);
    expect(registerAssessed(marked)).toBe(true);
  });
});

describe("trackRegisterFreshness", () => {
  it("is off for the sample and for an unassessed starter list, on for a marked own register", () => {
    expect(trackRegisterFreshness({}, resolveTemplate({ industry: "dental" }))).toBe(false);
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    expect(trackRegisterFreshness(profile, resolveTemplate(profile))).toBe(false);
    const first = resolveTemplate(profile).knowledge[0];
    const marked = {
      ...profile,
      customRelations: [{ personId: "own-2", knowledgeId: first.id, level: "expert" as const }],
    };
    expect(trackRegisterFreshness(marked, resolveTemplate(marked))).toBe(true);
  });
});
