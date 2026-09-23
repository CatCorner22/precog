import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { buildSharePayload } from "./share-payload";
import { MAX_SHARE_BYTES, parseCreateShareInput, validateSharePayload } from "./share-schema";

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

describe("parseCreateShareInput", () => {
  const payload = buildSharePayload(defaultProfile("dental"), []);

  it("reads what the share panel sends", () => {
    const parsed = parseCreateShareInput({
      payload,
      expiresInDays: 90,
      redacted: true,
      passcode: "  correct horse ",
    });
    expect(parsed.expiresInDays).toBe(90);
    expect(parsed.redacted).toBe(true);
    expect(parsed.passcode).toBe("correct horse");
    expect(parseCreateShareInput({ payload, expiresInDays: 30, passcode: "" }).passcode).toBe(
      undefined,
    );
  });

  it("refuses a passcode that is too short instead of dropping it", () => {
    // Regression: a 5-character passcode was silently dropped and the link
    // was created with no passcode at all.
    expect(() => parseCreateShareInput({ payload, passcode: "12345" })).toThrow(/8 to 64/);
    expect(() => parseCreateShareInput({ payload, passcode: "x".repeat(65) })).toThrow(/8 to 64/);
  });

  it("clamps the expiry and refuses non-object input", () => {
    expect(parseCreateShareInput({ payload, expiresInDays: 9_999 }).expiresInDays).toBe(365);
    expect(parseCreateShareInput({ payload }).expiresInDays).toBe(30);
    expect(() => parseCreateShareInput(null)).toThrow("Invalid request");
    expect(() => parseCreateShareInput({ payload, passcode: 12345678 })).toThrow("Invalid request");
  });
});
