import { describe, expect, it } from "vitest";
import { DUAL_RELEASE_MAX_USD } from "@/lib/precog/controls/dual-release";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { withDualRelease } from "@/lib/precog/profile-actions";
import { readThreshold, withThreshold } from "./use-dual-release-panel";

describe("a typed payment threshold (ST-INPUT-6)", () => {
  it("refuses a negative amount with a message instead of saving $0", () => {
    expect(readThreshold("-5")).toEqual({ error: "Enter an amount of $0 or more." });
    expect(readThreshold("-5000")).toEqual({ error: "Enter an amount of $0 or more." });
  });

  it("refuses a blank or non-numeric entry instead of saving $0", () => {
    expect(readThreshold("")).toEqual({ error: "Enter an amount of $0 or more." });
    expect(readThreshold("abc")).toEqual({ error: "Enter an amount of $0 or more." });
  });

  it("keeps an amount above the most Precog stores at that most, and says so", () => {
    expect(readThreshold("1e12")).toEqual({
      value: DUAL_RELEASE_MAX_USD,
      note: "Kept at $1,000,000,000, the most this figure accepts.",
    });
    expect(readThreshold("99999999999999999999")).toMatchObject({ value: DUAL_RELEASE_MAX_USD });
  });

  it("keeps cents as typed", () => {
    expect(readThreshold("12.5")).toEqual({ value: 12.5 });
    expect(readThreshold("12.75")).toEqual({ value: 12.75 });
    expect(readThreshold("$2,500")).toEqual({ value: 2500 });
    expect(readThreshold("0")).toEqual({ value: 0 });
  });

  it("saves 12.50 as 12.50, not 13, through the profile", () => {
    const profile = defaultProfile("dental");
    const policy = withThreshold(profile.dualRelease, "ach", 12.5);
    expect(policy.rules.find((r) => r.channel === "ach")?.thresholdUsd).toBe(12.5);
    const saved = withDualRelease(profile, policy, new Date("2026-10-06T12:00:00Z"));
    expect(saved.dualRelease.rules.find((r) => r.channel === "ach")?.thresholdUsd).toBe(12.5);
  });
});
