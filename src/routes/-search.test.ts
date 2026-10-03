import { describe, expect, it } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { Route as HomeRoute } from "./index";
import { Route as ReportRoute } from "./report";

// The leading "-" keeps this file out of the generated route tree.
type Validate = (search: Record<string, unknown>) => unknown;
const home = HomeRoute.options.validateSearch as Validate;
const report = ReportRoute.options.validateSearch as Validate;
const beforeLoad = HomeRoute.options.beforeLoad as unknown as (ctx: {
  location: { searchStr: string };
}) => unknown;

/** The address the home route redirects a raw query to, or null when it renders. */
function redirectOf(searchStr: string): string | null {
  try {
    beforeLoad({ location: { searchStr } });
    return null;
  } catch (thrown) {
    if (isRedirect(thrown)) return thrown.options.href ?? null;
    throw thrown;
  }
}

describe("the home page address", () => {
  it("keeps a bookmarked tab and item, and drops what it does not know", () => {
    expect(home({ tab: "precog", item: "embezzlement", bogus: 1 })).toEqual({
      tab: "precog",
      item: "embezzlement",
    });
    expect(home({ tab: "start" })).toEqual({});
    expect(home({ tab: "command" })).toEqual({});
  });

  it("sends Value proof and the snapshots to the firm workspace", () => {
    expect(redirectOf("?tab=value")).toBe("/firm#value-proof");
    expect(redirectOf("?tab=snapshots")).toBe("/firm#history");
    expect(redirectOf("?tab=command")).toBeNull();
    expect(redirectOf("?tab=journal")).toBeNull();
    expect(redirectOf("")).toBeNull();
  });

  it("keeps the business a digest link names, and drops one too long to be an id", () => {
    expect(home({ tab: "monthly", business: "biz_abc123" })).toEqual({
      tab: "monthly",
      business: "biz_abc123",
    });
    expect(home({ business: "x".repeat(65) })).toEqual({});
    expect(home({ business: "" })).toEqual({});
    expect(home({ business: 42 })).toEqual({});
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
