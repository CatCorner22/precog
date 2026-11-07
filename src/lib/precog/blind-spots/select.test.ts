import { describe, expect, it } from "vitest";
import { defaultProfile, normalizeProfile, type PracticeProfile } from "../practice-profile";
import { ONBOARDING_FACTS_VERSION } from "../onboarding/decision-model";
import {
  headcountBasis,
  headcountOf,
  nextThresholdLine,
  normalizeBlindSpotAnswers,
  selectBlindSpots,
  withBlindSpotAnswer,
} from "./select";

const withHeadcount = (p: PracticeProfile, workforceCount: number): PracticeProfile => ({
  ...p,
  onboardingFacts: { schemaVersion: ONBOARDING_FACTS_VERSION, workforceCount },
});

describe("selectBlindSpots", () => {
  it("reads the head count from setup first, then a setup range's low end, then the mapped team", () => {
    const dental = defaultProfile("dental");
    expect(headcountOf(dental)).toBe(dental.staff.teamSize);
    expect(headcountOf(withHeadcount(dental, 12))).toBe(12);
    expect(headcountBasis(withHeadcount(dental, 2))).toEqual({
      count: dental.staff.teamSize,
      source: "team",
    });
    const banded: PracticeProfile = {
      ...dental,
      onboardingFacts: { schemaVersion: ONBOARDING_FACTS_VERSION, workforceBand: "31-60" },
    };
    expect(headcountBasis(banded)).toEqual({ count: 31, source: "band", band: "31-60" });
    const smallBand: PracticeProfile = {
      ...dental,
      onboardingFacts: { schemaVersion: ONBOARDING_FACTS_VERSION, workforceBand: "2-6" },
    };
    expect(headcountBasis(smallBand).source).toBe("team");
    const sel = selectBlindSpots(banded);
    expect(nextThresholdLine(sel)).toBe(
      "At 31 or more on payroll (31-60 at setup), the rules at 50 (Family and Medical Leave Act and the ACA employer mandate) may already apply; the exact head count on setup tells which.",
    );
  });

  it("shows a line of business only its own traps", () => {
    const ids = (p: PracticeProfile) =>
      selectBlindSpots(p)
        .tiers.flatMap((t) => t.spots)
        .map((s) => s.spot.id);
    expect(ids(defaultProfile("dental"))).toContain("dea-renewal");
    expect(ids(defaultProfile("dental"))).not.toContain("cash-reporting");
    expect(ids(defaultProfile("nonprofit"))).toContain("nonprofit-filings");
    expect(ids(defaultProfile("construction"))).toContain("subcontractor-certificates");
    expect(ids(defaultProfile("retail"))).not.toContain("subcontractor-certificates");
    for (const industry of ["dental", "retail", "general", "restaurant"] as const) {
      expect(ids(defaultProfile(industry))).toContain("payroll-trust-fund");
      expect(ids(defaultProfile(industry))).toContain("digital-keys");
    }
  });

  it("shows every restaurant the tip return and tip credit notice", () => {
    const ids = (n: number) =>
      selectBlindSpots(withHeadcount(defaultProfile("restaurant"), n))
        .tiers.flatMap((t) => t.spots)
        .map((s) => s.spot.id);
    expect(ids(4)).toContain("tipped-reporting");
    expect(ids(9)).toContain("tipped-reporting");
  });

  it("splits the thresholds into crossed and ahead and names the next one", () => {
    const sel = selectBlindSpots(withHeadcount(defaultProfile("general"), 12));
    expect(sel.crossed.map((t) => t.at)).toEqual([11, 8, 5]);
    expect(
      selectBlindSpots(withHeadcount(defaultProfile("construction"), 12)).crossed.map((t) => t.at),
    ).toEqual([11, 8, 5, 1]);
    expect(sel.ahead.map((t) => t.at)).toEqual([15, 20, 50]);
    expect(nextThresholdLine(sel)).toBe(
      "At 12 on payroll, 3 more hires switches on: Title VII and the Americans with Disabilities Act.",
    );
    expect(
      nextThresholdLine(selectBlindSpots(withHeadcount(defaultProfile("general"), 14))),
    ).toContain("one more hire");
    expect(
      nextThresholdLine(selectBlindSpots(withHeadcount(defaultProfile("general"), 60))),
    ).toBeNull();
  });

  it("counts answers and treats only handled as closed", () => {
    const base = defaultProfile("general");
    const answered: PracticeProfile = {
      ...base,
      blindSpotAnswers: [
        { id: "digital-keys", answer: "handled", on: "2026-11-01" },
        { id: "owner-incapacity", answer: "unsure", on: "2026-11-01" },
        { id: "annual-report", answer: "not_yet", on: "2026-11-02" },
      ],
    };
    const { counts, tiers } = selectBlindSpots(answered);
    expect(counts.handled).toBe(1);
    expect(counts.unsure).toBe(1);
    expect(counts.notYet).toBe(1);
    expect(counts.open).toBe(counts.total - 1);
    const operate = tiers.find((t) => t.tier === "operate");
    expect(operate?.spots.find((s) => s.spot.id === "digital-keys")?.record?.answer).toBe(
      "handled",
    );
  });
});

describe("blind-spot answers on the profile", () => {
  const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  it("keeps known ids with known answers and dates, last answer per id", () => {
    const out = normalizeBlindSpotAnswers(
      [
        { id: "digital-keys", answer: "unsure", on: "2026-10-01" },
        { id: "digital-keys", answer: "handled", on: "2026-11-01" },
        { id: "not-a-spot", answer: "handled", on: "2026-11-01" },
        { id: "annual-report", answer: "maybe", on: "2026-11-01" },
        { id: "annual-report", answer: "not_yet", on: "yesterday" },
        null,
        "junk",
      ],
      isDay,
    );
    expect(out).toEqual([{ id: "digital-keys", answer: "handled", on: "2026-11-01" }]);
    expect(normalizeBlindSpotAnswers(undefined, isDay)).toEqual([]);
  });

  it("replaces an earlier answer and ignores unknown ids", () => {
    const one = withBlindSpotAnswer([], "digital-keys", "not_yet", "2026-11-01");
    const two = withBlindSpotAnswer(one, "digital-keys", "handled", "2026-11-03");
    expect(two).toEqual([{ id: "digital-keys", answer: "handled", on: "2026-11-03" }]);
    expect(withBlindSpotAnswer(two, "nope", "handled", "2026-11-03")).toEqual(two);
  });

  it("survives a round trip through normalizeProfile", () => {
    const p = normalizeProfile({
      ...defaultProfile("retail"),
      blindSpotAnswers: [{ id: "deposit-insurance", answer: "handled", on: "2026-11-01" }],
    });
    expect(p.blindSpotAnswers).toEqual([
      { id: "deposit-insurance", answer: "handled", on: "2026-11-01" },
    ]);
  });
});
