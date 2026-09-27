import { describe, expect, it } from "vitest";
import { needsPractice } from "./route-scope";

describe("needsPractice", () => {
  it.each(["/", "/report", "/threat", "/firm"])("%s waits for the business", (id) => {
    expect(needsPractice(["__root__", id])).toBe(true);
  });

  it.each(["/login", "/privacy", "/terms", "/share/$token", "/join/$token"])(
    "%s renders without it",
    (id) => {
      expect(needsPractice(["__root__", id])).toBe(false);
    },
  );

  it("renders the not-found page without it", () => {
    expect(needsPractice(["__root__"])).toBe(false);
  });
});
