import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./active-template";
import { isSampleBusiness, replacesSampleTeam } from "./business-lifecycle";
import { mapSource, untouchedStarterProcessIds } from "./builder/map-state";
import { registerSource } from "./continuity/register-state";
import { isOwnTeam } from "./firm/engagement";
import { OWN_BUSINESS_FALLBACK_NAME } from "./onboarding/own-business";
import { defaultProfile, type PracticeProfile } from "./practice-profile";
import { buildControlReportModel } from "./report/build-control-report";
import { isOwnBusiness } from "./scoring/scope";
import { buildStartHereModel } from "./start-here/model";
import { getIndustryTemplate } from "./templates";
import type { Person } from "./types";

/**
 * Every place that asks "is this the sample team or the owner's?" answers
 * from `customPeople`, each in its own words. This table pins what each one
 * says today for every shape `customPeople` can take, so that moving them
 * onto one primitive changes nothing.
 */

const REAL_TEAM: Person[] = [
  { id: "own-1", name: "Ana Ruiz", role: "Owner", active: true, owner: true, entitlements: [] },
  { id: "own-2", name: "Ben Ochoa", role: "Bookkeeper", active: true, entitlements: [] },
];

const OTHER_PEOPLE: Person[] = [
  { id: "other-1", name: "Cara Lind", role: "Manager", active: true, entitlements: [] },
];

type PeopleKind = "undefined" | "null" | "empty" | "sample array" | "copy" | "real team";
type NameKind = "demo" | "own" | "fallback";
type Industry = "dental" | "nonprofit";

const PEOPLE_KINDS: PeopleKind[] = [
  "undefined",
  "null",
  "empty",
  "sample array",
  "copy",
  "real team",
];
const NAME_KINDS: NameKind[] = ["demo", "own", "fallback"];
const INDUSTRIES: Industry[] = ["dental", "nonprofit"];

function peopleOf(kind: PeopleKind, industry: Industry): Person[] | null | undefined {
  const sample = getIndustryTemplate(industry).people;
  switch (kind) {
    case "undefined":
      return undefined;
    case "null":
      return null;
    case "empty":
      return [];
    case "sample array":
      return sample;
    case "copy":
      return [...sample];
    case "real team":
      return REAL_TEAM;
  }
}

function nameOf(kind: NameKind, industry: Industry): string {
  switch (kind) {
    case "demo":
      return getIndustryTemplate(industry).businessName;
    case "own":
      return "Ortiz Dental Studio";
    case "fallback":
      return OWN_BUSINESS_FALLBACK_NAME;
  }
}

interface Row {
  people: PeopleKind;
  name: NameKind;
  onboardingComplete: boolean;
  industry: Industry;
}

const ROWS: Row[] = INDUSTRIES.flatMap((industry) =>
  PEOPLE_KINDS.flatMap((people) =>
    NAME_KINDS.flatMap((name) =>
      [true, false].map((onboardingComplete) => ({ people, name, onboardingComplete, industry })),
    ),
  ),
);

function profileOf(row: Row): PracticeProfile {
  const base = defaultProfile(row.industry);
  const profile: PracticeProfile = {
    ...base,
    practiceName: nameOf(row.name, row.industry),
    onboardingComplete: row.onboardingComplete,
    // A score set by hand is disclosed only for a sample team, so the report's
    // "own team" answer can be read off its hand-set notes.
    staff: { ...base.staff, segregationSource: "manual" },
  };
  const people = peopleOf(row.people, row.industry);
  if (people === undefined) {
    delete profile.customPeople;
  } else {
    profile.customPeople = people;
  }
  return profile;
}

/** What each check says today, in plain terms, for one row. */
function expected(row: Row) {
  const entered = row.people !== "undefined" && row.people !== "null";
  const samplePeople = row.people === "sample array" || row.people === "copy";
  const processCount = getIndustryTemplate(row.industry).processes.length;
  return {
    isOwnBusiness: entered && row.people !== "sample array",
    isOwnTeam: entered && row.people !== "empty" && row.name !== "demo",
    isSampleBusiness: !entered || !row.onboardingComplete,
    mapSource: !entered ? "sample" : samplePeople ? "own" : "starter",
    untouchedStarterProcesses: entered && !samplePeople ? processCount : 0,
    registerSource: entered ? "starter" : "sample",
    replacesSampleTeam: !entered,
    isSampleTeam: !entered,
    ownControls: entered,
    reportOwnTeam: entered,
  };
}

function observed(row: Row) {
  const profile = profileOf(row);
  const tpl = resolveTemplate(profile);
  const base = getIndustryTemplate(row.industry);
  const report = buildControlReportModel({
    tpl,
    profile,
    mapCustomized: false,
    today: "2026-09-26",
    trackFreshness: false,
    mapReady: true,
    businessName: profile.practiceName,
  });
  const startHere = buildStartHereModel({
    profile,
    template: tpl,
    today: new Date(2026, 8, 26),
  });
  return {
    isOwnBusiness: isOwnBusiness(tpl),
    isOwnTeam: isOwnTeam(profile),
    isSampleBusiness: isSampleBusiness(profile),
    mapSource: mapSource(profile),
    untouchedStarterProcesses: untouchedStarterProcessIds(profile).size,
    registerSource: registerSource(profile),
    replacesSampleTeam: replacesSampleTeam(profile, OTHER_PEOPLE),
    isSampleTeam: startHere.continuity.isSampleTeam,
    ownControls: tpl.controls !== base.controls,
    reportOwnTeam: report.handSet.length === 0,
  };
}

describe("where the team came from, as every check reads it", () => {
  it.each(ROWS)(
    "$industry, customPeople $people, $name name, onboardingComplete $onboardingComplete",
    (row) => {
      expect(observed(row)).toEqual(expected(row));
    },
  );

  it("covers every shape of customPeople, name, setup state and industry", () => {
    expect(ROWS).toHaveLength(6 * 3 * 2 * 2);
  });
});
