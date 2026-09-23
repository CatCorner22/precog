import { describe, expect, it } from "vitest";
import {
  atBusinessLimit,
  newBusinessProfile,
  ownBusinessName,
  ownSetupProfile,
  processesToEdit,
  sampleSetupProfile,
  unfinishedBusinessToKeep,
} from "./business-lifecycle";
import { getIndustryTemplate } from "./templates";
import type { StorageLike } from "./local-data";
import { ownBusinessProfile } from "./onboarding/own-team";
import {
  defaultProfile,
  loadPortfolio,
  parseStoredProfile,
  savePortfolioEntry,
  type PracticeProfile,
} from "./practice-profile";
import type { Person } from "./types";

const ownTeam: Person[] = [
  { id: "own-1", name: "Al Owner", role: "Owner", active: true, entitlements: ["approve_payroll"] },
  {
    id: "own-2",
    name: "Bea Books",
    role: "Bookkeeper",
    active: true,
    entitlements: ["bank_reconcile"],
  },
];

describe("the first edit to an owner's starter map", () => {
  it("carries no sample owner ids into the owner's saved map", () => {
    const own = ownBusinessProfile(defaultProfile("general"), {
      practiceName: "Own Co",
      people: ownTeam,
    });
    const ownIds = new Set(ownTeam.map((p) => p.id));
    const seeded = processesToEdit(own);
    expect(seeded.length).toBeGreaterThan(0);
    for (const process of seeded) {
      for (const id of process.ownerPersonIds ?? [])
        expect(ownIds.has(id), process.name).toBe(true);
    }
  });

  it("keeps the sample's owners while the sample team is in use", () => {
    const sample = defaultProfile("general");
    expect(processesToEdit(sample).some((p) => (p.ownerPersonIds ?? []).length > 0)).toBe(true);
  });

  it("starts from the owner's own map once there is one", () => {
    const own = ownBusinessProfile(defaultProfile("general"), {
      practiceName: "Own Co",
      people: ownTeam,
    });
    const custom = [{ ...processesToEdit(own)[0], name: "Warranty claims" }];
    expect(processesToEdit({ ...own, customProcesses: custom })).toBe(custom);
  });
});

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const sampleNames = (p: PracticeProfile) => {
  const sample = new Set(getIndustryTemplate(p.industry).people.map((x) => x.name));
  return (p.customPeople ?? []).filter((x) => sample.has(x.name)).map((x) => x.name);
};

describe("two tabs that both finish setup", () => {
  it("give each finished business its own id, so neither replaces the other", () => {
    const storage = memoryStorage();
    // Both tabs opened on a first visit and read the same unfinished business.
    const unfinished = { ...defaultProfile(), onboardingComplete: false };
    const tabC = parseStoredProfile(JSON.stringify(unfinished));
    const tabD = parseStoredProfile(JSON.stringify(unfinished));
    expect(tabC.businessId).toBe(tabD.businessId);

    const c = ownSetupProfile({
      industry: "general",
      practiceName: "Tab C Business",
      people: [{ id: "own-1", name: "Carla One", role: "Bookkeeper", active: true }],
    });
    const d = ownSetupProfile({
      industry: "retail",
      practiceName: "Tab D Business",
      people: [{ id: "own-1", name: "Dora One", role: "Bookkeeper", active: true }],
    });
    expect(c.businessId).not.toBe(d.businessId);
    expect(c.businessId).not.toBe(tabC.businessId);
    savePortfolioEntry(c, storage);
    savePortfolioEntry(d, storage);
    const names = Object.values(loadPortfolio(storage)).map((p) => p.practiceName);
    expect(names.sort()).toEqual(["Tab C Business", "Tab D Business"]);
  });

  it("loading the sample in one tab does not take the other tab's business id either", () => {
    const unfinished = { ...defaultProfile(), onboardingComplete: false };
    const sample = sampleSetupProfile("general", unfinished);
    expect(sample.businessId).not.toBe(unfinished.businessId);
    expect(sample.onboardingComplete).toBe(true);
  });
});

describe("Add a business from the business menu", () => {
  it("opens setup under the owner's name instead of the sample's people", () => {
    const added = newBusinessProfile("general", "  Own Plumbing LLC ");
    expect(added.onboardingComplete).toBe(false);
    expect(added.practiceName).toBe("Own Plumbing LLC");
    expect(added.industry).toBe("general");
    expect(ownBusinessName(added)).toBe("Own Plumbing LLC");
    // Not listed as a business until setup is finished.
    const storage = memoryStorage();
    savePortfolioEntry(added, storage);
    expect(loadPortfolio(storage)).toEqual({});
  });

  it("finishes as the owner's team, with no sample people and no sample supplier waiver", () => {
    const own = ownSetupProfile({
      industry: "general",
      practiceName: "Own Plumbing LLC",
      people: ownTeam,
    });
    expect(own.practiceName).toBe("Own Plumbing LLC");
    expect(sampleNames(own)).toEqual([]);
    expect(own.dualRelease.exceptions.filter((e) => e.sample)).toEqual([]);
    expect(own.customRelations).toEqual([]);
  });

  it("keeps the sample's name when the owner leaves the name blank", () => {
    const added = newBusinessProfile("retail", "   ");
    expect(added.practiceName).toBe(getIndustryTemplate("retail").businessName);
    expect(ownBusinessName(added)).toBe("");
  });

  it("stops at the account's business limit", () => {
    expect(atBusinessLimit(49)).toBe(false);
    expect(atBusinessLimit(50)).toBe(true);
  });
});

describe("the unfinished business a setup replaces", () => {
  it("goes away when it is only the sample behind the dialog", () => {
    const unfinished = { ...newBusinessProfile("general", "Own Plumbing LLC") };
    expect(unfinishedBusinessToKeep(unfinished)).toBeNull();
  });

  it("is kept as a business of its own when an older version saved work under it", () => {
    const legacy: PracticeProfile = {
      ...defaultProfile("general"),
      onboardingComplete: false,
      customPeople: ownTeam,
    };
    expect(unfinishedBusinessToKeep(legacy)?.onboardingComplete).toBe(true);
    expect(unfinishedBusinessToKeep({ ...legacy, onboardingComplete: true })).toBeNull();
  });
});
