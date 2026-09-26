import { describe, expect, it } from "vitest";
import {
  clampPage,
  pageCount,
  pageSlice,
  REGISTER_ITEM_PAGE,
  REGISTER_PEOPLE_PAGE,
  registerOverResponsiveLimit,
} from "./register-window";

describe("continuity register window", () => {
  it("shows one page of people and items instead of the whole grid", () => {
    const people = Array.from({ length: 40 }, (_, i) => i);
    const items = Array.from({ length: 160 }, (_, i) => i);
    expect(pageSlice(people, 0, REGISTER_PEOPLE_PAGE)).toHaveLength(REGISTER_PEOPLE_PAGE);
    expect(pageSlice(people, 4, REGISTER_PEOPLE_PAGE)).toEqual([32, 33, 34, 35, 36, 37, 38, 39]);
    expect(pageSlice(items, 0, REGISTER_ITEM_PAGE)).toHaveLength(REGISTER_ITEM_PAGE);
    expect(registerOverResponsiveLimit(people.length, items.length)).toBe(true);
    expect(registerOverResponsiveLimit(8, 20)).toBe(false);
  });

  it("keeps any requested page inside the list", () => {
    expect(clampPage(-1, 40, 8)).toBe(0);
    expect(clampPage(Number.NaN, 40, 8)).toBe(0);
    expect(clampPage(Number.POSITIVE_INFINITY, 40, 8)).toBe(0);
    expect(clampPage(2.7, 40, 8)).toBe(2);
    expect(clampPage(99, 40, 8)).toBe(4);
    expect(clampPage(3, 0, 8)).toBe(0);
  });

  it("counts one page for an empty list and rounds a partial page up", () => {
    expect(pageCount(0, 8)).toBe(1);
    expect(pageCount(8, 8)).toBe(1);
    expect(pageCount(9, 8)).toBe(2);
  });
});
