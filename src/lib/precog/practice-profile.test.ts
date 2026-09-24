import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "./active-template";
import { soleOwnerCriticalCount } from "./continuity/coverage";
import { INDUSTRIES } from "./industry";
import { defaultProfile, normalizeCustomKnowledge, normalizeProfile } from "./practice-profile";

const [first, second] = getBaseTemplate("dental").knowledge;

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
    // The restaurant register has two critical items with one holder: liquor
    // inventory and the sales tax returns.
    expect(defaultProfile("restaurant").staff.soleOwnerKnowledgeCount).toBe(2);
  });
});
