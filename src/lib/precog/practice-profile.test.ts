import { describe, expect, it } from "vitest";
import { resolveTemplate } from "./active-template";
import { getIndustryTemplate } from "./templates";
import { soleOwnerCriticalCount } from "./continuity/coverage";
import { INDUSTRIES } from "./industry";
import {
  defaultProfile,
  normalizeCustomKnowledge,
  normalizeProfile,
  parseStoredProfile,
} from "./practice-profile";

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
