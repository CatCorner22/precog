import { describe, expect, it } from "vitest";
import { readHireDate } from "./hire-date";

const today = new Date("2026-09-22T00:00:00Z");

describe("readHireDate", () => {
  it("reads a two-digit year up to next year as this century and later ones as last century", () => {
    expect(readHireDate("01/01/27", { today })).toBe("2027-01-01");
    expect(readHireDate("01/01/28", { today })).toBe("1928-01-01");
    expect(readHireDate("01/01/29", { today })).toBe("1929-01-01");
  });
});
