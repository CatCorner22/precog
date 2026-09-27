import { describe, expect, it } from "vitest";
import { johariPanes, paneItems } from "./johari-pane";

describe("paneItems", () => {
  it("states the pane's real total when it lists only the first eight of nine", () => {
    const nine = Array.from({ length: 9 }, (_, i) => i);
    const pane = paneItems(nine, false);
    expect(pane.shown).toHaveLength(8);
    expect(pane.total).toBe(9);
    expect(pane.count).toBe("showing 8 of 9");
  });

  it("lists every item, with a plain count, once expanded or when all fit", () => {
    const nine = Array.from({ length: 9 }, (_, i) => i);
    expect(paneItems(nine, true)).toEqual({ shown: nine, total: 9, count: "9" });
    expect(paneItems([1, 2, 3], false).count).toBe("3");
  });
});

describe("johariPanes", () => {
  it("fills each pane from this business's items, and leaves a pane empty when none belong", () => {
    const panes = johariPanes([
      { title: "Bank reconciliation", classification: "known_known" },
      { title: "Cash drawer history", classification: "known_unknown" },
    ]);
    expect(panes).toEqual({
      open: ["Bank reconciliation"],
      blind: ["Cash drawer history"],
      hidden: [],
      unknown: [],
    });
  });
});
