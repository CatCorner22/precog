import { describe, expect, it } from "vitest";
import { CASE_COUNT } from "./case-count";
import { CASE_LIBRARY } from "./cases";

describe("CASE_COUNT", () => {
  it("equals the number of cases in the library", () => {
    expect(CASE_COUNT).toBe(CASE_LIBRARY.length);
  });

  it("is a whole number above zero", () => {
    expect(Number.isInteger(CASE_COUNT)).toBe(true);
    expect(CASE_COUNT).toBeGreaterThan(0);
  });
});
