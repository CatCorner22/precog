import { describe, expect, it } from "vitest";
import { findLikelySecrets, maskLikelySecrets, secretKindsIn } from "./credential-guard";

describe("long runs that are not secrets", () => {
  it("leaves a UUID as it is", () => {
    const text = "Open record 3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c in the portal.";
    expect(findLikelySecrets(text)).toEqual([]);
    expect(maskLikelySecrets(text)).toBe(text);
  });

  it("leaves a dated URL path as it is", () => {
    const text =
      "The checklist is at https://intranet.example.test/2026-10-10/abc123-quarterly-close-checklist-v2";
    expect(findLikelySecrets(text)).toEqual([]);
    expect(maskLikelySecrets(text)).toBe(text);
    const path = "Saved under /2026-10-10-month-end-close-notes";
    expect(maskLikelySecrets(path)).toBe(path);
  });

  it("still masks a long key on its own, and one beside a UUID", () => {
    expect(secretKindsIn(["Recovery code a8f3k2m9q7x1z5c4v6b0n2l8"])).toEqual(["token"]);
    expect(maskLikelySecrets("API key sk-live-4f9a8b7c6d5e4f3a2b1c0d9e")).toBe("API key [removed]");
    expect(
      maskLikelySecrets(
        "Record 3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c, token ghp1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p",
      ),
    ).toBe("Record 3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c, token [removed]");
  });

  it("still masks a password written after a slash", () => {
    expect(maskLikelySecrets("password: Summer2026/Winter")).toBe("[removed]");
  });
});
