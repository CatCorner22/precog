import { describe, expect, it } from "vitest";
import { Route as HomeRoute } from "./index";
import { Route as ReportRoute } from "./report";

// The leading "-" keeps this file out of the generated route tree.
type Validate = (search: Record<string, unknown>) => unknown;
const home = HomeRoute.options.validateSearch as Validate;
const report = ReportRoute.options.validateSearch as Validate;

describe("the home page address", () => {
  it("keeps a bookmarked tab and item, and drops what it does not know", () => {
    expect(home({ tab: "precog", item: "embezzlement", bogus: 1 })).toEqual({
      tab: "precog",
      item: "embezzlement",
    });
    expect(home({ tab: "start" })).toEqual({});
    expect(home({ tab: "value" })).toEqual({ tab: "value" });
  });

  it("opens the place an older tab id became", () => {
    expect(home({ tab: "journal" })).toEqual({ tab: "monthly", item: "decisions" });
    expect(home({ tab: "coso" })).toEqual({ tab: "scores", item: "coverage" });
    expect(home({ tab: "layers", item: "source" })).toEqual({ tab: "sod", item: "controls" });
    expect(home({ tab: "bogus", item: "x" })).toEqual({});
  });
});

describe("the report address", () => {
  it("accepts a locked version id and ignores anything else", () => {
    expect(report({ version: "rv_abc123" })).toEqual({ version: "rv_abc123" });
    expect(report({ version: "../etc" })).toEqual({});
    expect(report({ version: "abc" })).toEqual({});
    expect(report({ version: 12345 })).toEqual({});
  });
});
