import { describe, expect, it } from "vitest";
import { caseMedianComparison, outStopsNote, WEIGHTED_SHARE_NOTE } from "./start-here-copy";

describe("outStopsNote", () => {
  it("does not reassure while nobody is marked on the register", () => {
    expect(outStopsNote(0, 0, false)).toBe(
      "Not assessed yet: mark who can do each item on Who knows what.",
    );
  });

  it("says what already waits when nothing more stops", () => {
    expect(outStopsNote(0, 2, true)).toBe(
      "Nothing more stops, but 2 entries nobody can run alone already wait.",
    );
  });

  it("reassures only when the register is assessed and nothing stops or waits", () => {
    expect(outStopsNote(0, 0, true)).toBe("Everything they run, someone else can run alone.");
    expect(outStopsNote(3, 0, true)).toBeNull();
  });
});

describe("caseMedianComparison", () => {
  it("compares both ways instead of always saying the cases sit higher", () => {
    expect(caseMedianComparison(400_000, 126_000)).toBe("higher");
    expect(caseMedianComparison(30_075, 126_000)).toBe("lower");
    expect(caseMedianComparison(126_000, 126_000)).toBeNull();
    expect(caseMedianComparison(undefined, 126_000)).toBeNull();
    expect(caseMedianComparison(400_000, undefined)).toBeNull();
  });
});

describe("WEIGHTED_SHARE_NOTE", () => {
  it("states the criticality weights and defines must-do work", () => {
    expect(WEIGHTED_SHARE_NOTE).toContain(
      "a critical item counts 3 times as much as a nice-to-have",
    );
    expect(WEIGHTED_SHARE_NOTE).toContain("an important one twice");
    expect(WEIGHTED_SHARE_NOTE).toContain("Must-do work means the critical and important items");
  });
});
