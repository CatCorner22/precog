import { describe, expect, it } from "vitest";
import { readExactAmount } from "./read-exact-amount";

describe("readExactAmount", () => {
  it("accepts a figure above the slider's range, up to the stored limit", () => {
    expect(readExactAmount("2000000", 0, 50_000_000)).toEqual({ value: 2_000_000 });
    expect(readExactAmount("$2,000,000", 0, 50_000_000)).toEqual({ value: 2_000_000 });
  });

  it("rounds to cents", () => {
    expect(readExactAmount("1234.567", 0, 10_000)).toEqual({ value: 1234.57 });
  });

  it("rejects empty, negative, non-numeric and over-limit entries", () => {
    for (const draft of ["", "  ", "-5", "abc", "60000001"]) {
      expect(readExactAmount(draft, 0, 60_000_000)).toEqual({
        error: "Enter an amount from 0 to 60,000,000.",
      });
    }
  });
});
