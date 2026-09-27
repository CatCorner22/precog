import { describe, expect, it } from "vitest";
import { isNavTarget, isTabId, parseHomeSearch, TAB_IDS, TAB_WORDS } from "./navigation";

describe("parseHomeSearch", () => {
  it("keeps a known tab and drops an unknown one", () => {
    expect(parseHomeSearch({ tab: "snapshots" })).toEqual({ tab: "snapshots" });
    expect(parseHomeSearch({ tab: "value" })).toEqual({ tab: "value" });
    expect(parseHomeSearch({ tab: "bogus" })).toEqual({});
    expect(parseHomeSearch({ tab: 3 })).toEqual({});
  });

  it("never puts Start here in the address", () => {
    expect(parseHomeSearch({ tab: "start" })).toEqual({});
    expect(parseHomeSearch({ tab: "start", item: "x" })).toEqual({});
  });

  it("keeps the item on a tab that opens on one", () => {
    expect(parseHomeSearch({ tab: "precog", item: "embezzlement" })).toEqual({
      tab: "precog",
      item: "embezzlement",
    });
    expect(parseHomeSearch({ tab: "knowledge", item: " k1 " })).toEqual({
      tab: "knowledge",
      item: "k1",
    });
    expect(parseHomeSearch({ tab: "layers", item: "source" })).toEqual({
      tab: "layers",
      item: "source",
    });
  });

  it("reads a numeric item as text", () => {
    expect(parseHomeSearch({ tab: "map", item: 42 })).toEqual({ tab: "map", item: "42" });
  });

  it("drops an item on a tab that has none, an empty item, and an oversized one", () => {
    expect(parseHomeSearch({ tab: "sod", item: "x" })).toEqual({ tab: "sod" });
    expect(parseHomeSearch({ tab: "precog", item: "  " })).toEqual({ tab: "precog" });
    expect(parseHomeSearch({ tab: "precog", item: "x".repeat(121) })).toEqual({ tab: "precog" });
  });

  it("keeps build mode on How work flows only", () => {
    expect(parseHomeSearch({ tab: "map", build: true })).toEqual({ tab: "map", build: true });
    expect(parseHomeSearch({ tab: "map", build: "1" })).toEqual({ tab: "map", build: true });
    expect(parseHomeSearch({ tab: "map", build: false })).toEqual({ tab: "map" });
    expect(parseHomeSearch({ tab: "sod", build: true })).toEqual({ tab: "sod" });
  });
});

describe("tab vocabulary", () => {
  it("lists each tab once, with a plain and a tactical name", () => {
    expect(new Set(TAB_IDS).size).toBe(TAB_WORDS.length);
    for (const t of TAB_WORDS) {
      expect(t.label.trim()).not.toBe("");
      expect(t.tactical.trim()).not.toBe("");
    }
  });

  it("accepts 'control' as a place to go but not as a tab", () => {
    expect(isNavTarget("control")).toBe(true);
    expect(isTabId("control")).toBe(false);
    expect(isNavTarget("journal ")).toBe(false);
    expect(isNavTarget("knowlege")).toBe(false);
  });
});
