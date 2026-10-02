import { describe, expect, it } from "vitest";
import { belowThresholdNote, openSodHint, type OpenSodCounts } from "./open-findings";

const counts = (over: Partial<OpenSodCounts>): OpenSodCounts => ({
  openCritical: 0,
  openHigh: 0,
  criticalBelowThreshold: 0,
  highBelowThreshold: 0,
  ...over,
});

describe("openSodHint", () => {
  it("names the open critical findings while any is open", () => {
    expect(openSodHint(counts({ openCritical: 1, openHigh: 2 }))).toBe(
      "1 open critical duty conflict",
    );
  });

  it("names the open high findings that cap the word while no critical one is open", () => {
    expect(openSodHint(counts({ openHigh: 2 }))).toBe("2 open high duty conflicts");
  });

  it("reads zero critical when nothing caps the word", () => {
    expect(openSodHint(counts({}))).toBe("0 open critical duty conflicts");
  });
});

describe("belowThresholdNote", () => {
  it("explains a critical conflict dual release covers only above a threshold", () => {
    expect(belowThresholdNote(counts({ openCritical: 1, criticalBelowThreshold: 1 }))).toBe(
      "Dual release covers 1 critical duty conflict only above a threshold. Below the threshold one person still acts alone, so it counts as open.",
    );
  });

  it("explains high ones only while no critical one sets the word", () => {
    expect(belowThresholdNote(counts({ openHigh: 2, highBelowThreshold: 2 }))).toBe(
      "Dual release covers 2 high duty conflicts only above a threshold. Below the threshold one person still acts alone, so they count as open.",
    );
    expect(
      belowThresholdNote(counts({ openCritical: 1, openHigh: 1, highBelowThreshold: 1 })),
    ).toBeNull();
  });

  it("is null when no conflict that sets the word sits below a threshold", () => {
    expect(belowThresholdNote(counts({ openCritical: 2 }))).toBeNull();
    expect(belowThresholdNote(counts({}))).toBeNull();
  });
});
