import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { buildSharePayload } from "./share-payload";
import { MAX_SHARE_BYTES, validateSharePayload } from "./share-schema";

describe("validateSharePayload", () => {
  it("accepts what buildSharePayload produces for every industry", () => {
    for (const industry of [
      "dental",
      "retail",
      "professional_services",
      "restaurant",
      "general",
    ] as const) {
      const payload = buildSharePayload(defaultProfile(industry), [
        { title: "Split cash handling", why: "SoD gap", effort: "low" },
      ]);
      expect(() => validateSharePayload(payload)).not.toThrow();
      expect(validateSharePayload(payload).processes.length).toBe(payload.processes.length);
    }
  });

  it("rejects a payload that is not an object", () => {
    expect(() => validateSharePayload("nope")).toThrow(/not valid/);
    expect(() => validateSharePayload(null)).toThrow(/not valid/);
  });

  it("answers a bad or oversized payload with a 4xx status", () => {
    const statusOf = (input: unknown) => {
      try {
        validateSharePayload(input);
      } catch (error) {
        return (error as { status?: number }).status;
      }
      return undefined;
    };
    const payload = buildSharePayload(defaultProfile("dental"), []);
    expect(statusOf(null)).toBe(400);
    expect(statusOf({ ...payload, note: "x".repeat(MAX_SHARE_BYTES + 1) })).toBe(413);
  });

  it("rejects an unknown industry and says where", () => {
    const payload = buildSharePayload(defaultProfile("dental"), []);
    expect(() => validateSharePayload({ ...payload, industry: "crypto" })).toThrow(/at industry/);
  });

  it("rejects a payload over the byte cap before parsing it", () => {
    const payload = buildSharePayload(defaultProfile("dental"), []);
    const huge = { ...payload, note: "x".repeat(MAX_SHARE_BYTES + 1) };
    expect(() => validateSharePayload(huge)).toThrow(/too large/);
  });

  it("rejects a process list that would not render (missing name)", () => {
    const payload = buildSharePayload(defaultProfile("dental"), []);
    const broken = {
      ...payload,
      processes: [{ ...payload.processes[0], name: undefined }],
    };
    expect(() => validateSharePayload(broken)).toThrow(/processes\.0\.name/);
  });
});
