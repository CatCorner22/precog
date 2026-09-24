import { describe, expect, it } from "vitest";
import {
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
});
