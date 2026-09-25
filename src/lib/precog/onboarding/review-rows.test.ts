import { describe, expect, it } from "vitest";
import { setupRowNeedsAttention } from "./review-rows";

const matched = { title: "Bookkeeper", partial: false };
describe("exception-first setup review", () => {
  it("leaves matched named rows out of the exception filter, without asserting duties are verified", () => {
    expect(
      setupRowNeedsAttention(
        { name: "Ana", role: "Bookkeeper", duties: ["bank_reconcile"] },
        matched,
      ),
    ).toBe(false);
  });
  it("shows unknown and partially recognized titles", () => {
    const row = { name: "Ana", role: "Custom job", duties: [] };
    expect(setupRowNeedsAttention(row, undefined)).toBe(true);
    expect(setupRowNeedsAttention(row, { ...matched, partial: true })).toBe(true);
    expect(setupRowNeedsAttention(row, { title: undefined, partial: false })).toBe(true);
  });
  it("shows an unnamed row with a role or assigned duties", () => {
    expect(setupRowNeedsAttention({ name: " ", role: "Bookkeeper", duties: [] }, matched)).toBe(
      true,
    );
    expect(
      setupRowNeedsAttention({ name: "", role: "", duties: ["bank_reconcile"] }, undefined),
    ).toBe(true);
  });
  it("shows a named person with no job title", () => {
    expect(setupRowNeedsAttention({ name: "Ana", role: "", duties: [] }, undefined)).toBe(true);
  });
  it("does not count unused blank rows as exceptions", () => {
    expect(setupRowNeedsAttention({ name: " ", role: " ", duties: [] }, undefined)).toBe(false);
  });
});
