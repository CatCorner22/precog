import { describe, expect, it, vi } from "vitest";
import { memoryStorage } from "@/test/memory-storage";
import type { StorageLike } from "./local-data";
import { LocalProfileStore, OPENED_FROM_LIST_NOTICE, type UnreadableCopy } from "./save-conflict";
import { resolveTemplate } from "./active-template";
import { getIndustryTemplate } from "./templates";
import { soleOwnerCriticalCount } from "./continuity/coverage";
import { INDUSTRIES } from "./industry";
import { scoreMap } from "./builder/scored-map";
import { buildOwnTeam, ownBusinessProfile } from "./onboarding/own-team";
import { ONBOARDING_FACTS_VERSION } from "./onboarding/decision-model";
import {
  DECISION_KIND_LABEL,
  DECISION_KIND_LABEL_PRINTED_V1,
  DISPOSITION_REASON_LABEL,
  MAX_DISPOSITION_NOTE,
  ACTIVE_PROFILE_KEY,
  MAX_REMOVED_BUSINESSES,
  PORTFOLIO_KEY,
  QUARANTINE_PREFIX,
  defaultProfile,
  hasUserWork,
  loadPortfolio,
  normalizeCustomKnowledge,
  normalizeProfile,
  parseStoredProfile,
  quarantineKey,
  rememberRemovedBusiness,
  removePortfolioEntry,
  removedBusinessIds,
  savePortfolioEntry,
  writePortfolioEntry,
} from "./practice-profile";

vi.mock("@/lib/observability/report-browser", () => ({ reportClientError: () => undefined }));

const [first, second] = getIndustryTemplate("dental").knowledge;

describe("normalizeCustomKnowledge", () => {
  it("keeps confirmations on or before the supplied calendar day and drops later ones", () => {
    const result = normalizeCustomKnowledge(
      [
        { ...first, confirmedAt: "2026-09-21" },
        { ...second, confirmedAt: "2026-09-22" },
      ],
      "2026-09-21",
    );
    expect(result?.map((item) => item.confirmedAt)).toEqual(["2026-09-21", undefined]);
  });

  it("drops malformed dates and passes non-array input through as null", () => {
    expect(
      normalizeCustomKnowledge([{ ...first, confirmedAt: "2026-02-30" }], "2026-09-21"),
    ).toEqual([{ ...first, confirmedAt: undefined }].map(({ confirmedAt: _c, ...rest }) => rest));
    expect(normalizeCustomKnowledge(null, "2026-09-21")).toBeNull();
  });
});

describe("normalizeProfile keeps what the owner set by hand", () => {
  it("keeps the manual markers on the segregation score and the bank-reconciliation flag", () => {
    const base = defaultProfile("retail");
    const loaded = normalizeProfile({
      ...base,
      staff: {
        ...base.staff,
        segregationScore: 70,
        segregationSource: "manual",
        independentBankRec: true,
        bankRecSource: "manual",
      },
    });
    expect(loaded.staff.segregationSource).toBe("manual");
    expect(loaded.staff.bankRecSource).toBe("manual");
  });

  it("drops a marker that is not one of the two values", () => {
    const base = defaultProfile("retail");
    const loaded = normalizeProfile({
      ...base,
      staff: { ...base.staff, bankRecSource: "hacked" as unknown as "manual" },
    });
    expect(loaded.staff.bankRecSource).toBeUndefined();
  });
});

describe("a sample business shows one sole-owner figure", () => {
  it("reads the count from the sample's own register, for every line of business", () => {
    for (const industry of INDUSTRIES.map((i) => i.id)) {
      const profile = defaultProfile(industry);
      expect(profile.staff.soleOwnerKnowledgeCount, industry).toBe(
        soleOwnerCriticalCount(resolveTemplate(profile)),
      );
    }
    // The restaurant register has three critical items with one holder: the
    // tip pool, liquor inventory and the sales tax returns.
    expect(defaultProfile("restaurant").staff.soleOwnerKnowledgeCount).toBe(3);
  });
});

describe("onboarding facts stay separate from mapped-team scoring", () => {
  it("keeps old profiles compatible and normalizes new facts without changing sample pins", () => {
    const old = defaultProfile("restaurant");
    const normalizedOld = normalizeProfile(JSON.parse(JSON.stringify(old)));
    expect(normalizedOld).not.toHaveProperty("onboardingFacts");
    expect(normalizedOld.staff).toEqual(old.staff);
    expect(normalizedOld.staff.soleOwnerKnowledgeCount).toBe(3);

    const withFacts = normalizeProfile({
      ...old,
      onboardingFacts: {
        schemaVersion: ONBOARDING_FACTS_VERSION,
        actor: "advisor",
        workforceBand: "100-249",
        workforceCount: 120,
        locationBand: "2-5",
        mappingScope: "one_location",
        setupMethod: "roster_import",
        answers: { runs_payroll: "unknown" },
      },
    });
    expect(normalizeProfile(JSON.parse(JSON.stringify(withFacts))).onboardingFacts).toEqual(
      withFacts.onboardingFacts,
    );
    expect(withFacts.staff).toEqual(old.staff);
    expect(withFacts.staff.teamSize).toBe(old.staff.teamSize);
  });

  it("does not move a mapped team's score when organization workforce facts are added", () => {
    const people = buildOwnTeam([
      { name: "Ana Ruiz", role: "Owner", duties: ["bank_reconcile"] },
      { name: "Ben Ochoa", role: "Manager", duties: ["post_payments"] },
    ]);
    const base = ownBusinessProfile(defaultProfile("general"), {
      practiceName: "Ruiz Services",
      people,
    });
    const tpl = resolveTemplate(base);
    const processes = tpl.processes.map((process, index) =>
      index === 0 ? { ...process, ownerPersonIds: [people[0].id] } : process,
    );
    const score = (profile: typeof base) =>
      scoreMap(tpl, processes, profile.staff, {
        profile,
        people,
        customized: true,
      }).health.score;
    const withFacts = normalizeProfile({
      ...base,
      onboardingFacts: {
        schemaVersion: 1,
        workforceBand: "100-249",
        workforceCount: 120,
      },
    });
    expect(withFacts.staff.teamSize).toBe(2);
    expect(score(withFacts)).toBe(score(base));
  });
});

describe("normalizeProfile treats a stored copy as untrusted input", () => {
  const own = (extra: Record<string, unknown>) =>
    ({
      practiceName: "My Shop",
      industry: "general",
      ...extra,
    }) as Parameters<typeof normalizeProfile>[0];

  it("drops malformed list entries instead of throwing", () => {
    const person = { id: "a", name: "Ada", role: "Owner", active: true };
    const loaded = normalizeProfile(
      own({
        customPeople: [null, 5, { id: "x", name: "Nobody" }, person],
        customKnowledge: [null, { id: "k", name: "Payroll" }],
        customRelations: [null, { personId: "a", knowledgeId: "k", level: "expert" }],
        customProcesses: [null, { id: "pr", name: "Pay bills" }],
        mapVersions: [
          { id: "v1", name: "No people", createdAt: "2026-01-01" },
          {
            id: "v2",
            name: "Kept",
            createdAt: "2026-01-01",
            people: [null, person],
            processes: [],
          },
        ],
        mapHealthHistory: [
          { at: "2026-01-01", score: "high" },
          { at: "2026-01-02", score: 70 },
        ],
        mapLayout: { a: { x: 1, y: 2 }, b: { x: "far" }, c: null },
      }),
    );
    expect(loaded.practiceName).toBe("My Shop");
    expect(loaded.customPeople).toEqual([person]);
    expect(loaded.customKnowledge?.map((k) => k.id)).toEqual(["k"]);
    expect(loaded.customKnowledge?.[0].linkedProcessIds).toEqual([]);
    expect(loaded.customRelations).toHaveLength(1);
    expect(loaded.customProcesses?.[0]).toMatchObject({
      id: "pr",
      dependencies: [],
      controlIds: [],
    });
    expect(loaded.mapVersions?.map((v) => [v.id, v.people.length])).toEqual([["v2", 1]]);
    expect(loaded.mapHealthHistory?.map((h) => h.score)).toEqual([70]);
    expect(loaded.mapLayout).toEqual({ a: { x: 1, y: 2 } });
  });

  it("normalizes duplicate relations once and keeps that result on a storage round trip", () => {
    const stored = own({
      customRelations: [
        { personId: "a", knowledgeId: "k", level: "aware" },
        { personId: "b", knowledgeId: "k", level: "expert" },
        { personId: "a", knowledgeId: "k", level: "basic" },
        { personId: "a", knowledgeId: "k", level: "proficient" },
      ],
    });
    const loaded = normalizeProfile(stored);
    expect(loaded.customRelations).toEqual([
      { personId: "a", knowledgeId: "k", level: "proficient" },
      { personId: "b", knowledgeId: "k", level: "expert" },
    ]);

    const again = normalizeProfile(JSON.parse(JSON.stringify(loaded)));
    expect(again.customRelations).toEqual(loaded.customRelations);
  });

  it("clamps staff figures and filters unknown decision kinds", () => {
    const loaded = normalizeProfile(
      own({
        staff: { teamSize: 99_999, segregationScore: -4, avgTenureYears: "long" },
        decisions: [
          { id: "d1", kind: "monitor", subject: "x".repeat(300), note: "n".repeat(3_000) },
          { id: "d2", kind: "ignore", subject: "?", note: "" },
        ],
        onboardingComplete: "yes",
      }),
    );
    expect(loaded.staff.teamSize).toBe(500);
    expect(loaded.staff.segregationScore).toBe(0);
    expect(loaded.staff.avgTenureYears).toBe(defaultProfile("general").staff.avgTenureYears);
    expect(loaded.decisions.map((d) => d.id)).toEqual(["d1"]);
    expect(loaded.onboardingComplete).toBe(true);
  });

  it("keeps a valid Not valid judgement and caps its note", () => {
    const disposition = {
      verdict: "not_valid",
      reason: "controlled_elsewhere",
      note: "x".repeat(900),
      by: { userId: "u1", name: "Ada" },
      at: "2026-10-01T12:00:00.000Z",
    };
    const loaded = normalizeProfile(
      own({ decisions: [{ id: "d1", kind: "monitor", subject: "s", note: "", disposition }] }),
    );
    expect(loaded.decisions[0].disposition).toEqual({
      ...disposition,
      note: "x".repeat(MAX_DISPOSITION_NOTE),
    });
    // A round trip through storage reads the same.
    const again = normalizeProfile(
      own({ decisions: JSON.parse(JSON.stringify(loaded.decisions)) }),
    );
    expect(again.decisions).toEqual(loaded.decisions);
  });

  it("drops a malformed judgement but keeps the entry", () => {
    for (const disposition of [
      { verdict: "valid", reason: "other", at: "2026-10-01" },
      { verdict: "not_valid", reason: "made_up", at: "2026-10-01" },
      { verdict: "not_valid", reason: "other" },
      "not valid",
      null,
    ]) {
      const loaded = normalizeProfile(
        own({ decisions: [{ id: "d1", kind: "monitor", subject: "s", note: "", disposition }] }),
      );
      expect(loaded.decisions.map((d) => d.id)).toEqual(["d1"]);
      expect(loaded.decisions[0]).not.toHaveProperty("disposition");
    }
  });

  it("keeps a judged entry as an ordinary undated Watch it entry for a reader that ignores the field", () => {
    const stored = {
      id: "d1",
      kind: "monitor",
      subject: "Ana: Write checks and Reconcile bank",
      note: "",
      linkedTab: "sod",
      disposition: { verdict: "not_valid", reason: "other", note: "Owner signs", at: "2026-10-01" },
    };
    const { disposition: _ignored, ...olderCopy } = stored;
    const loaded = normalizeProfile(own({ decisions: [olderCopy] }));
    expect(loaded.decisions).toHaveLength(1);
    expect(loaded.decisions[0].reviewBy).toBeUndefined();
    expect(DECISION_KIND_LABEL[loaded.decisions[0].kind]).toBe("Watch it");
  });

  it("opens a non-object as the industry sample", () => {
    expect(
      normalizeProfile(null as unknown as Parameters<typeof normalizeProfile>[0]).industry,
    ).toBe("dental");
  });
});

describe("parseStoredProfile", () => {
  it("opens the setup dialog for nothing stored, unreadable text or a non-object", () => {
    for (const raw of [null, "", "{not json", "null", "[1,2]"]) {
      expect(parseStoredProfile(raw).onboardingComplete, String(raw)).toBe(false);
    }
  });

  it("keeps the owner's business when one list entry is malformed", () => {
    const raw = JSON.stringify({
      practiceName: "My Shop",
      industry: "general",
      customPeople: [null],
      onboardingComplete: true,
    });
    const loaded = parseStoredProfile(raw);
    expect(loaded.practiceName).toBe("My Shop");
    expect(loaded.industry).toBe("general");
    expect(loaded.onboardingComplete).toBe(true);
    expect(loaded.customPeople).toEqual([]);
  });

  it("treats a stored copy with no setup flag as unfinished", () => {
    const raw = JSON.stringify({ practiceName: "My Shop", industry: "general" });
    expect(parseStoredProfile(raw).onboardingComplete).toBe(false);
  });
});

describe("hasUserWork", () => {
  it("counts written procedures and places, so sign-in and switching keep them", () => {
    const sample = defaultProfile("dental");
    expect(hasUserWork(sample)).toBe(false);
    expect(hasUserWork({ ...sample, procedures: [{ id: "pr1" }] } as never)).toBe(true);
    expect(hasUserWork({ ...sample, places: [{ id: "pl1" }] } as never)).toBe(true);
  });
});

describe("decision labels", () => {
  it("names each kind in plain words and keeps the printed layout 1 and 2 labels", () => {
    expect(DECISION_KIND_LABEL).toEqual({
      accept_residual: "Accept the risk",
      remediate: "Fix it",
      monitor: "Watch it",
      insure: "Insure it",
    });
    expect(DECISION_KIND_LABEL_PRINTED_V1).toEqual({
      accept_residual: "Accept residual",
      remediate: "Remediate",
      monitor: "Monitor",
      insure: "Transfer / insure",
    });
    expect(Object.keys(DISPOSITION_REASON_LABEL)).toEqual([
      "duty_not_held",
      "controlled_elsewhere",
      "rule_does_not_fit",
      "other",
    ]);
  });
});

describe("the list of businesses on this device", () => {
  const listed = (id: string, name: string) => ({
    ...defaultProfile("general"),
    businessId: id,
    practiceName: name,
  });
  const quarantined = (storage: { data: Map<string, string> }) =>
    [...storage.data.keys()].filter((k) => k.startsWith(QUARANTINE_PREFIX));

  it("quarantines a list that is an array or not JSON, never writes over it, and refuses the save", () => {
    for (const raw of [
      JSON.stringify([listed("b1", "Alpha"), listed("b2", "Beta")]),
      `{"b1":{"practiceName":"Alpha"`,
    ]) {
      const storage = memoryStorage({ [PORTFOLIO_KEY]: raw });
      expect(writePortfolioEntry(listed("b3", "Gamma"), storage)).toBe("unreadable");
      expect(savePortfolioEntry(listed("b3", "Gamma"), storage)).toBe(false);
      expect(storage.data.get(PORTFOLIO_KEY)).toBe(raw);
      expect(storage.data.get(quarantineKey(raw))).toBe(raw);
      expect(loadPortfolio(storage)).toEqual({});
      // Read again and again, the text is kept once.
      expect(quarantined(storage)).toHaveLength(1);
    }
  });

  it("skips one malformed entry, quarantines it, and loads the rest", () => {
    const storage = memoryStorage({
      [PORTFOLIO_KEY]: JSON.stringify({
        b1: listed("b1", "Alpha"),
        b2: null,
        b3: { ...listed("b3", "Gamma"), practiceName: 42 },
        b4: "garbage",
      }),
    });
    const all = loadPortfolio(storage);
    expect(Object.keys(all).sort()).toEqual(["b1", "b3"]);
    expect(all.b1.practiceName).toBe("Alpha");
    // A name that is not text opens as the sample's name, never as a number.
    expect(typeof all.b3.practiceName).toBe("string");
    expect(storage.data.get(quarantineKey('{"b2":null}'))).toBe('{"b2":null}');
    expect(quarantined(storage)).toHaveLength(2);
    // Saving another business leaves every stored entry, malformed ones too, as it was.
    expect(savePortfolioEntry(listed("b5", "Epsilon"), storage)).toBe(true);
    const stored = JSON.parse(storage.data.get(PORTFOLIO_KEY) as string);
    expect(stored.b2).toBeNull();
    expect(stored.b4).toBe("garbage");
    expect(Object.keys(loadPortfolio(storage)).sort()).toEqual(["b1", "b3", "b5"]);
  });

  it("does not list again a business removed on this device", () => {
    const storage = memoryStorage();
    savePortfolioEntry(listed("b1", "Alpha"), storage);
    savePortfolioEntry(listed("b2", "Beta"), storage);
    rememberRemovedBusiness("b2", storage);
    removePortfolioEntry("b2", storage);
    // A tab still open on Beta saves it: nothing to list, and nothing to warn about.
    expect(writePortfolioEntry(listed("b2", "Beta"), storage)).toBe("removed");
    expect(savePortfolioEntry(listed("b2", "Beta"), storage)).toBe(true);
    expect(Object.keys(loadPortfolio(storage))).toEqual(["b1"]);
  });

  it("lists a business set up again under a new id", () => {
    const storage = memoryStorage();
    rememberRemovedBusiness("b2", storage);
    expect(savePortfolioEntry(listed("b9", "Beta"), storage)).toBe(true);
    expect(loadPortfolio(storage).b9?.practiceName).toBe("Beta");
  });

  it("remembers at most 200 removed businesses, forgetting the oldest first", () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_REMOVED_BUSINESSES + 5; i++) rememberRemovedBusiness(`b${i}`, storage);
    const ids = removedBusinessIds(storage);
    expect(MAX_REMOVED_BUSINESSES).toBe(200);
    expect(ids.size).toBe(200);
    expect(ids.has("b0")).toBe(false);
    expect(ids.has(`b${MAX_REMOVED_BUSINESSES + 4}`)).toBe(true);
  });
});

describe("a damaged copy of the open business", () => {
  const listedCopy = {
    ...defaultProfile("general"),
    businessId: "biz_kept",
    practiceName: "Kept Plumbing",
    onboardingComplete: true,
  };
  const store = (storage: StorageLike, told: UnreadableCopy[] = []) =>
    new LocalProfileStore(
      () => storage,
      () => "r2",
      (copy) => void told.push(copy),
    );

  it("opens the copy from the list of businesses when the open copy is cut short", () => {
    const storage = memoryStorage({ [PORTFOLIO_KEY]: JSON.stringify({ biz_kept: listedCopy }) });
    const newer = JSON.stringify({ ...listedCopy, practiceName: "Kept Plumbing (newer)" });
    const full = `{"localRev":"r1","localBase":null,${newer.slice(1)}`;
    const cut = full.slice(0, full.indexOf('"businessId"') + 40);
    storage.data.set(ACTIVE_PROFILE_KEY, cut);
    const told: UnreadableCopy[] = [];
    const tab = store(storage, told);
    const loaded = tab.load();
    expect(loaded.profile.practiceName).toBe("Kept Plumbing");
    expect(loaded.profile.businessId).toBe("biz_kept");
    expect(loaded.stored).toBe(false);
    expect(told).toEqual([{ key: quarantineKey(cut), raw: cut, openedFromList: true }]);
    expect(storage.data.get(quarantineKey(cut))).toBe(cut);
    expect(OPENED_FROM_LIST_NOTICE).toBe(
      "Precog could not read the open copy of this business and opened the copy from your list of businesses.",
    );
    // The cut text is kept under its quarantine key, so the open business is written over it.
    expect(tab.write(loaded.profile).kind).toBe("saved");
    expect(parseStoredProfile(storage.data.get(ACTIVE_PROFILE_KEY) ?? null).practiceName).toBe(
      "Kept Plumbing",
    );
  });

  it("keeps an array under the open key, as for a copy the normaliser throws on, when the list has no copy", () => {
    const storage = memoryStorage({ [ACTIVE_PROFILE_KEY]: "[1,2]" });
    const told: UnreadableCopy[] = [];
    const tab = store(storage, told);
    const loaded = tab.load();
    expect(loaded.profile.onboardingComplete).toBe(false);
    expect(told).toEqual([{ key: quarantineKey("[1,2]"), raw: "[1,2]" }]);
    expect(storage.data.get(quarantineKey("[1,2]"))).toBe("[1,2]");
    expect(tab.write(loaded.profile).kind).toBe("failed");
    expect(storage.data.get(ACTIVE_PROFILE_KEY)).toBe("[1,2]");
  });

  it("quarantines damaged text another program wrote before a tab saves over it", () => {
    const storage = memoryStorage();
    const tab = store(storage);
    tab.load();
    expect(tab.write(listedCopy).kind).toBe("saved");
    storage.data.set(ACTIVE_PROFILE_KEY, "{cut");
    expect(tab.write({ ...listedCopy, practiceName: "Next" }).kind).toBe("saved");
    expect(storage.data.get(quarantineKey("{cut"))).toBe("{cut");
  });

  it("opens the newest listed business, not one removed on this device", () => {
    const storage = memoryStorage({
      [PORTFOLIO_KEY]: JSON.stringify({ biz_kept: listedCopy }),
      [ACTIVE_PROFILE_KEY]: JSON.stringify({ ...listedCopy, businessId: "biz_gone" }),
    });
    rememberRemovedBusiness("biz_gone", storage);
    const loaded = store(storage).load();
    expect(loaded.profile.businessId).toBe("biz_kept");
    expect(loaded.stored).toBe(false);
  });
});
