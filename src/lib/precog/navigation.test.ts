import { describe, expect, it } from "vitest";
import {
  isNavTarget,
  isTabId,
  parseHomeSearch,
  resolveNavTarget,
  ROUTE_ALIASES,
  routeAliasHref,
  TAB_ALIASES,
  TAB_IDS,
  TAB_WORDS,
  tabLabel,
} from "./navigation";

const tactical = (_plain: string, tacticalWord: string) => tacticalWord;

describe("parseHomeSearch", () => {
  it("keeps a known tab and drops an unknown one", () => {
    expect(parseHomeSearch({ tab: "procedures" })).toEqual({ tab: "procedures" });
    expect(parseHomeSearch({ tab: "bogus" })).toEqual({});
    expect(parseHomeSearch({ tab: 3 })).toEqual({});
  });

  it("never puts Home in the address", () => {
    expect(parseHomeSearch({ tab: "start" })).toEqual({});
    expect(parseHomeSearch({ tab: "start", item: "x" })).toEqual({});
  });

  it("keeps the item on a tab that opens on one", () => {
    expect(parseHomeSearch({ tab: "precog", item: "embezzlement" })).toEqual({
      tab: "precog",
      item: "embezzlement",
    });
    expect(parseHomeSearch({ tab: "precog", item: "failure:control:c-sod-ap" })).toEqual({
      tab: "precog",
      item: "failure:control:c-sod-ap",
    });
    expect(parseHomeSearch({ tab: "knowledge", item: " k1 " })).toEqual({
      tab: "knowledge",
      item: "k1",
    });
    expect(parseHomeSearch({ tab: "sod", item: "controls" })).toEqual({
      tab: "sod",
      item: "controls",
    });
    expect(parseHomeSearch({ tab: "scores", item: "coverage" })).toEqual({
      tab: "scores",
      item: "coverage",
    });
  });

  it("keeps a recommended procedure's item as given, so a conflict card's link opens it", () => {
    expect(parseHomeSearch({ tab: "procedures", item: "lib:lib-bank-rec" })).toEqual({
      tab: "procedures",
      item: "lib:lib-bank-rec",
    });
    // The retired blueprint screen still opens Procedures with the item.
    expect(parseHomeSearch({ tab: "blueprint", item: "lib:lib-payroll" })).toEqual({
      tab: "procedures",
      item: "lib:lib-payroll",
    });
  });

  it("reads a numeric item as text", () => {
    expect(parseHomeSearch({ tab: "map", item: 42 })).toEqual({ tab: "map", item: "42" });
  });

  it("drops an item on a tab that has none, an empty item, and an oversized one", () => {
    expect(parseHomeSearch({ tab: "pioneer", item: "x" })).toEqual({ tab: "pioneer" });
    expect(parseHomeSearch({ tab: "team", item: "x" })).toEqual({ tab: "team" });
    expect(parseHomeSearch({ tab: "precog", item: "  " })).toEqual({ tab: "precog" });
    expect(parseHomeSearch({ tab: "precog", item: "x".repeat(121) })).toEqual({ tab: "precog" });
  });

  it("keeps build mode on How work flows only", () => {
    expect(parseHomeSearch({ tab: "map", build: true })).toEqual({ tab: "map", build: true });
    expect(parseHomeSearch({ tab: "map", build: "1" })).toEqual({ tab: "map", build: true });
    expect(parseHomeSearch({ tab: "map", build: false })).toEqual({ tab: "map" });
    expect(parseHomeSearch({ tab: "sod", build: true })).toEqual({ tab: "sod" });
    expect(parseHomeSearch({ tab: "journal", build: "validate" })).toEqual({
      tab: "monthly",
      item: "decisions",
    });
  });

  it("opens the tab and view an alias became", () => {
    expect(parseHomeSearch({ tab: "journal" })).toEqual({ tab: "monthly", item: "decisions" });
    expect(parseHomeSearch({ tab: "residual" })).toEqual({ tab: "scores", item: "residual" });
    expect(parseHomeSearch({ tab: "coso", item: "other" })).toEqual({
      tab: "scores",
      item: "coverage",
    });
    expect(parseHomeSearch({ tab: "intel" })).toEqual({ tab: "scores", item: "patterns" });
    expect(parseHomeSearch({ tab: "control-failure" })).toEqual({
      tab: "precog",
      item: "failure",
    });
  });

  it("opens Home for the retired Dashboard and Procedures for the retired blueprint", () => {
    expect(parseHomeSearch({ tab: "command" })).toEqual({});
    expect(parseHomeSearch({ tab: "blueprint" })).toEqual({ tab: "procedures" });
    expect(parseHomeSearch({ tab: "blueprint", item: "pr-1" })).toEqual({
      tab: "procedures",
      item: "pr-1",
    });
  });

  it("leaves a route alias out of the home address; the route redirects it first", () => {
    expect(parseHomeSearch({ tab: "value" })).toEqual({});
    expect(parseHomeSearch({ tab: "snapshots" })).toEqual({});
  });

  it("opens Controls on Who controls what for a Where risk sits link", () => {
    expect(parseHomeSearch({ tab: "layers", item: "source" })).toEqual({
      tab: "sod",
      item: "controls",
    });
    expect(parseHomeSearch({ tab: "layers" })).toEqual({ tab: "sod", item: "controls" });
  });

  it("keeps a known QuickBooks outcome and drops anything else", () => {
    expect(parseHomeSearch({ quickbooks: "connected" })).toEqual({ quickbooks: "connected" });
    expect(parseHomeSearch({ tab: "monthly", quickbooks: "wrong-account" })).toEqual({
      tab: "monthly",
      quickbooks: "wrong-account",
    });
    expect(parseHomeSearch({ quickbooks: "<script>" })).toEqual({});
    expect(parseHomeSearch({ quickbooks: 1 })).toEqual({});
  });
});

describe("resolveNavTarget", () => {
  it("resolves every alias to a real tab and its own view", () => {
    for (const [id, alias] of Object.entries(TAB_ALIASES)) {
      expect(isNavTarget(id)).toBe(true);
      expect(isTabId(id)).toBe(false);
      const item = "item" in alias ? alias.item : undefined;
      expect(resolveNavTarget(id)).toEqual(item ? { tab: alias.tab, item } : { tab: alias.tab });
      expect(isTabId(alias.tab)).toBe(true);
    }
  });

  it("sends the Decisions log to Monthly review, on its section", () => {
    expect(resolveNavTarget("journal", "d1")).toEqual({ tab: "monthly", item: "decisions" });
  });

  it("passes an item only to a tab that opens on one", () => {
    expect(resolveNavTarget("map", "p1")).toEqual({ tab: "map", item: "p1" });
    expect(resolveNavTarget("pioneer", "p1")).toEqual({ tab: "pioneer" });
    expect(resolveNavTarget("monthly", "decisions")).toEqual({
      tab: "monthly",
      item: "decisions",
    });
  });

  it("opens a confirmed or in-place control on the Controls view", () => {
    expect(resolveNavTarget("control")).toEqual({ tab: "sod", item: "controls" });
    expect(resolveNavTarget("control-in-place", "c1")).toEqual({ tab: "sod", item: "controls" });
    expect(resolveNavTarget("layers", "source")).toEqual({ tab: "sod", item: "controls" });
  });

  it("opens the control-failure report from its alias", () => {
    expect(resolveNavTarget("control-failure")).toEqual({ tab: "precog", item: "failure" });
  });

  it("opens the retired Dashboard on Home and the retired blueprint on Procedures", () => {
    expect(resolveNavTarget("command")).toEqual({ tab: "start" });
    expect(resolveNavTarget("blueprint")).toEqual({ tab: "procedures" });
  });

  it("sends Value proof and the snapshots to their sections on the firm workspace", () => {
    expect(resolveNavTarget("value")).toEqual({ href: "/firm#value-proof" });
    expect(resolveNavTarget("snapshots", "s1")).toEqual({ href: "/firm#history" });
    expect(routeAliasHref("?tab=value")).toBe("/firm#value-proof");
    expect(routeAliasHref("?tab=snapshots&item=x")).toBe("/firm#history");
    expect(routeAliasHref("?tab=journal")).toBeNull();
    expect(routeAliasHref("")).toBeNull();
  });

  it("returns nothing for an unknown name, so the address falls back to Start here", () => {
    expect(resolveNavTarget("bogus")).toBeNull();
    expect(resolveNavTarget("journal ")).toBeNull();
    expect(parseHomeSearch({ tab: "bogus", item: "x" })).toEqual({});
  });
});

describe("tab vocabulary", () => {
  it("lists each tab once, with a plain and a tactical name", () => {
    expect(new Set(TAB_IDS).size).toBe(TAB_WORDS.length);
    expect(TAB_WORDS).toHaveLength(10);
    for (const retired of ["layers", "command", "value", "blueprint", "snapshots"]) {
      expect(isTabId(retired)).toBe(false);
    }
    for (const t of TAB_WORDS) {
      expect(t.label.trim()).not.toBe("");
      expect(t.tactical.trim()).not.toBe("");
    }
  });

  it("never gives an alias the id of a tab", () => {
    for (const id of Object.keys(TAB_ALIASES)) expect(isTabId(id)).toBe(false);
    for (const id of Object.keys(ROUTE_ALIASES)) {
      expect(isTabId(id)).toBe(false);
      expect(isNavTarget(id)).toBe(true);
      expect(Object.keys(TAB_ALIASES)).not.toContain(id);
    }
  });

  it("accepts 'control' and 'control-in-place' as places to go but not as tabs", () => {
    expect(isNavTarget("control")).toBe(true);
    expect(isNavTarget("control-in-place")).toBe(true);
    expect(isTabId("control-in-place")).toBe(false);
    expect(isTabId("control")).toBe(false);
    expect(isNavTarget("journal ")).toBe(false);
    expect(isNavTarget("knowlege")).toBe(false);
  });

  it("names an alias in its own words, not its tab's", () => {
    expect(tabLabel("journal")).toBe("Decisions log");
    expect(tabLabel("journal", tactical)).toBe("Journal");
    expect(tabLabel("coso")).toBe("Coverage check");
    expect(tabLabel("residual")).toBe("What is still exposed");
    expect(tabLabel("intel")).toBe("Patterns");
    expect(tabLabel("control")).toBe("Controls");
    expect(tabLabel("layers", tactical)).toBe("Controls");
    expect(tabLabel("command")).toBe("Start here");
    expect(tabLabel("blueprint")).toBe("Procedures");
    expect(tabLabel("value")).toBe("Value proof");
    expect(tabLabel("snapshots")).toBe("History");
  });

  it("names the new tabs", () => {
    expect(tabLabel("start")).toBe("Start here");
    expect(tabLabel("monthly")).toBe("Monthly review");
    expect(tabLabel("scores")).toBe("How Precog scores");
    expect(tabLabel("scores", tactical)).toBe("Scoring");
    expect(tabLabel("precog", tactical)).toBe("Scenarios");
    expect(tabLabel("bogus")).toBe("bogus");
  });
});
