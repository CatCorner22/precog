import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultProfile } from "../practice-profile";
import { buildSharePayload } from "./share-payload";
import { MAX_SHARE_BYTES, parseCreateShareInput, validateSharePayload } from "./share-schema";

describe("validateSharePayload", () => {
  afterEach(() => vi.restoreAllMocks());

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
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => validateSharePayload("nope")).toThrow(/Precog could not create this share/);
    expect(() => validateSharePayload(null)).toThrow(/Precog could not create this share/);
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
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const payload = buildSharePayload(defaultProfile("dental"), []);
    expect(statusOf(null)).toBe(400);
    expect(statusOf({ ...payload, note: "x".repeat(MAX_SHARE_BYTES + 1) })).toBe(413);
  });

  it("rejects an unknown industry, logs where and tells the owner in a sentence", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const payload = buildSharePayload(defaultProfile("dental"), []);
    expect(() => validateSharePayload({ ...payload, industry: "crypto" })).toThrow(
      "Precog could not create this share from the map as it stands. Reload the page and try again.",
    );
    expect(warn.mock.calls[0]?.[1]).toBe("industry");
  });

  it("rejects a payload over the byte cap before parsing it", () => {
    const payload = buildSharePayload(defaultProfile("dental"), []);
    const huge = { ...payload, note: "x".repeat(MAX_SHARE_BYTES + 1) };
    expect(() => validateSharePayload(huge)).toThrow(
      /^This map is too large to share \(\d+ KB; the limit is 256 KB\)\. Shorten process descriptions or share fewer processes\.$/,
    );
  });

  it("rejects a process list that would not render (missing name)", () => {
    const payload = buildSharePayload(defaultProfile("dental"), []);
    const broken = {
      ...payload,
      processes: [{ ...payload.processes[0], name: undefined }],
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => validateSharePayload(broken)).toThrow(/Precog could not create this share/);
    expect(warn.mock.calls[0]?.[1]).toBe("processes.0.name");
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
