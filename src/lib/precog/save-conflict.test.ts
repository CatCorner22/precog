import { describe, expect, it } from "vitest";
import { isStaleSave } from "./save-conflict";

describe("isStaleSave", () => {
  it("treats an absent business as fresh", () => {
    expect(isStaleSave(null, null)).toBe(false);
    expect(isStaleSave(null, 3)).toBe(false);
  });

  it("treats a missing or mismatched base revision as stale", () => {
    expect(isStaleSave(0, null)).toBe(true);
    expect(isStaleSave(2, 1)).toBe(true);
  });

  it("accepts a matching revision", () => {
    expect(isStaleSave(2, 2)).toBe(false);
  });
});
