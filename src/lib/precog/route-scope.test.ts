import { describe, expect, it } from "vitest";
import { isPracticePath, needsPractice } from "./route-scope";

describe("needsPractice", () => {
  it.each(["/", "/report", "/firm"])("%s waits for the business", (id) => {
    expect(needsPractice(["__root__", id])).toBe(true);
  });

  it.each(["/login", "/privacy", "/terms", "/share/$token", "/join/$token", "/threat"])(
    "%s renders without it",
    (id) => {
      expect(needsPractice(["__root__", id])).toBe(false);
    },
  );

  it("renders the not-found page without it", () => {
    expect(needsPractice(["__root__"])).toBe(false);
  });
});

describe("isPracticePath", () => {
  it.each(["/", "/report/", "/firm"])("%s opens the business", (path) => {
    expect(isPracticePath(path)).toBe(true);
  });

  it.each(["/login", "/privacy", "/share/abc", "/join/abc", "/reports", "/threat"])(
    "%s does not",
    (path) => {
      expect(isPracticePath(path)).toBe(false);
    },
  );
});
