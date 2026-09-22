import { describe, expect, it } from "vitest";
import { defaultProfile } from "./practice-profile";
import { isBusinessId, MAX_PROFILE_BYTES, validateProfileInput } from "./profile-input";

describe("validateProfileInput", () => {
  it("accepts a default profile and pins its business id", () => {
    const profile = defaultProfile("retail");
    const out = validateProfileInput(profile);
    expect(out.businessId).toBe(profile.businessId);
    expect(JSON.parse(out.json).businessId).toBe(profile.businessId);
  });

  it("falls back to biz_default for a legacy profile with no id", () => {
    const { businessId, ...legacy } = defaultProfile("dental");
    void businessId;
    expect(validateProfileInput(legacy).businessId).toBe("biz_default");
  });

  it("rejects non-objects, missing names, unknown industries and bad ids", () => {
    expect(() => validateProfileInput(null)).toThrow(/object/);
    expect(() => validateProfileInput([])).toThrow(/object/);
    expect(() => validateProfileInput({ industry: "dental" })).toThrow(/name/);
    expect(() => validateProfileInput({ practiceName: "X", industry: "space" })).toThrow(
      /industry/,
    );
    expect(() =>
      validateProfileInput({ ...defaultProfile("dental"), businessId: "biz/../other" }),
    ).toThrow(/Business id/);
    expect(() => validateProfileInput({ ...defaultProfile("dental"), businessId: "" })).toThrow(
      /Business id/,
    );
  });

  it("caps the document size", () => {
    const huge = { ...defaultProfile("dental"), notes: "x".repeat(MAX_PROFILE_BYTES) };
    expect(() => validateProfileInput(huge)).toThrow(/too large/);
  });
});

describe("isBusinessId", () => {
  it("allows the generated shape and rejects anything else", () => {
    expect(isBusinessId("biz_default")).toBe(true);
    expect(isBusinessId("biz_m1abc_x9y8z")).toBe(true);
    expect(isBusinessId("a".repeat(64))).toBe(true);
    expect(isBusinessId("a".repeat(65))).toBe(false);
    expect(isBusinessId("has space")).toBe(false);
    expect(isBusinessId(42)).toBe(false);
  });
});
