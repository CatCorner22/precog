import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL, isPlaceholder } from "./operator";

describe("operator config", () => {
  it("tells a placeholder from a value the owner entered", () => {
    expect(isPlaceholder("[STATE]")).toBe(true);
    expect(isPlaceholder("[SUPPORT EMAIL]")).toBe(true);
    expect(isPlaceholder("Texas")).toBe(false);
    expect(isPlaceholder("help@precog.example")).toBe(false);
  });

  it("falls back to the support placeholder when SUPPORT_EMAIL is unset", () => {
    // vi.stubEnv cannot change import.meta.env after the module is evaluated,
    // so only the placeholder path is asserted here; the production gate in
    // scripts/migrate.mjs refuses a build without the real address.
    expect(SUPPORT_EMAIL).toBe("[SUPPORT EMAIL]");
  });
});
