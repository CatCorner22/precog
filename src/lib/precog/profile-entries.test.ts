import { describe, expect, it } from "vitest";
import { asRecord, readText } from "./profile-entries";

describe("asRecord", () => {
  it("returns the object itself", () => {
    const value = { a: 1 };
    expect(asRecord(value)).toBe(value);
  });

  it("returns an empty record for anything that is not an object", () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
    expect(asRecord("text")).toEqual({});
    expect(asRecord(7)).toEqual({});
    expect(asRecord(true)).toEqual({});
  });

  it("returns an empty record for an array", () => {
    expect(asRecord([{ a: 1 }])).toEqual({});
  });
});

describe("readText", () => {
  it("trims a string and cuts it at the maximum", () => {
    expect(readText("  Oakridge Dental  ", 80)).toBe("Oakridge Dental");
    expect(readText("x".repeat(100), 80)).toBe("x".repeat(80));
  });

  it("trims before it cuts", () => {
    expect(readText("   abc", 3)).toBe("abc");
  });

  it("reads anything that is not a string as empty", () => {
    expect(readText(42, 80)).toBe("");
    expect(readText(null, 80)).toBe("");
    expect(readText(undefined, 80)).toBe("");
    expect(readText(["a"], 80)).toBe("");
    expect(readText({ toString: () => "a" }, 80)).toBe("");
  });
});
