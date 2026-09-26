import { describe, expect, it } from "vitest";
import { isInactive, isKnownActive, isOnLeave, statusKey } from "./roster-status";

describe("roster status words", () => {
  it("reads leaving words as inactive, and status-only codes only in a status column", () => {
    expect(isInactive("Terminated - Voluntary")).toBe(true);
    expect(isInactive("Former employee")).toBe(true);
    expect(isInactive("T")).toBe(true);
    expect(isInactive("T", true)).toBe(false);
    expect(isInactive("Terminated", true)).toBe(true);
    expect(isInactive("Active")).toBe(false);
    expect(isInactive("")).toBe(false);
  });

  it("reads leave as still employed, and a leaving word outranks it", () => {
    expect(isOnLeave("On Leave")).toBe(true);
    expect(isOnLeave("L")).toBe(true);
    expect(isOnLeave("Inactive - Leave of Absence")).toBe(true);
    expect(isOnLeave("Terminated - On Leave")).toBe(false);
    expect(isOnLeave("Active")).toBe(false);
    expect(isKnownActive("Full-Time")).toBe(true);
    expect(isKnownActive("LOA")).toBe(true);
    expect(isKnownActive("Onboarding")).toBe(false);
  });

  it("keys a status without case or punctuation", () => {
    expect(statusKey("  Full-Time ")).toBe("full time");
  });
});
