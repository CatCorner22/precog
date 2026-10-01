import { describe, expect, it } from "vitest";
import { applyVerifiedAnnualHours, DEFAULT_VALUE_CASE } from "./value-case";
import { summarizeValueEvidence, type ValueEvidence } from "./value-evidence";
import {
  evidenceChecklist,
  hoursCheck,
  observedValueParts,
  recoveryCheck,
} from "./value-proof-checks";

const AS_OF = new Date(2026, 8, 26);

function evidence(kind: ValueEvidence["kind"], verified = true): ValueEvidence {
  return {
    id: `${kind}-1`,
    kind,
    description: kind,
    source: "memo",
    amount: 50,
    observedAt: "2026-08-01",
    verified,
  };
}

describe("hoursCheck", () => {
  it.each([
    [50, 6],
    [10, 3],
    [37, 7],
  ])("'Use verified hours' clears the mismatch for %i hours over %i reviews", (hours, reviews) => {
    const inputs = { ...DEFAULT_VALUE_CASE, annualReviews: reviews };
    expect(hoursCheck(hours, inputs).kind).toBe("apply");
    expect(hoursCheck(hours, applyVerifiedAnnualHours(inputs, hours))).toEqual({ kind: "match" });
  });

  it("says when the verified hours exceed what the review figures allow", () => {
    const inputs = { ...DEFAULT_VALUE_CASE, annualReviews: 4 };
    expect(hoursCheck(1000, inputs)).toEqual({ kind: "unreachable", most: 144 });
  });

  it("asks for reviews per year before hours per review can be set", () => {
    expect(hoursCheck(50, { ...DEFAULT_VALUE_CASE, annualReviews: 0 })).toEqual({
      kind: "no-reviews",
    });
  });

  it("stays quiet without verified hours", () => {
    expect(hoursCheck(0, DEFAULT_VALUE_CASE)).toEqual({ kind: "match" });
  });
});

describe("recoveryCheck", () => {
  it("does not offer to zero a typed recovery nothing verified backs", () => {
    expect(recoveryCheck(0, 5000)).toEqual({ kind: "unbacked" });
  });

  it("offers the verified total when verified recoveries differ", () => {
    expect(recoveryCheck(2400, 5000)).toEqual({ kind: "differs" });
    expect(recoveryCheck(5000, 5000)).toEqual({ kind: "match" });
  });

  it("matches verified items that add up to the typed total to the cent", () => {
    const items = [
      { ...evidence("recovery"), id: "r1", amount: 100.1 },
      { ...evidence("recovery"), id: "r2", amount: 200.2 },
    ];
    const { recoveries } = summarizeValueEvidence(items, AS_OF);
    expect(recoveryCheck(recoveries, 300.3)).toEqual({ kind: "match" });
  });
});

describe("observedValueParts", () => {
  it("names only what the observed value contains", () => {
    expect(observedValueParts(DEFAULT_VALUE_CASE, ["reviewHoursBefore", "hourlyCost"])).toBe(
      "Labor",
    );
    expect(observedValueParts({ ...DEFAULT_VALUE_CASE, directRecoveries: 900 }, [])).toBe(
      "Documented recoveries",
    );
    expect(
      observedValueParts({ ...DEFAULT_VALUE_CASE, directRecoveries: 900 }, [
        "reviewHoursBefore",
        "hourlyCost",
      ]),
    ).toBe("Labor + documented recoveries");
  });
});

describe("evidenceChecklist", () => {
  it("shows nothing done for a business with no records", () => {
    const items = evidenceChecklist({
      hoursObserved: false,
      evidence: [],
      profile: {},
      asOf: AS_OF,
    });
    expect(items.filter((i) => i.done)).toEqual([]);
  });

  it("ticks each line from the owner's own records", () => {
    const items = evidenceChecklist({
      hoursObserved: false,
      evidence: [evidence("time"), evidence("recovery")],
      profile: {
        mapHealthHistory: [
          { at: "2026-08-01", score: 50 },
          { at: "2026-09-01", score: 60 },
        ],
      },
      asOf: AS_OF,
    });
    expect(items.map((i) => i.done)).toEqual([true, true, true, false, false]);
  });

  it("does not count an unverified item", () => {
    const items = evidenceChecklist({
      hoursObserved: false,
      evidence: [evidence("recovery", false)],
      profile: {},
      asOf: AS_OF,
    });
    expect(items[1].done).toBe(false);
  });
});
