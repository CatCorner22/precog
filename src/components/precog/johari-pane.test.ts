import { describe, expect, it } from "vitest";
import { examplesHeading, paneItems, PANE_PREVIEW } from "./johari-pane";

describe("paneItems", () => {
  it("states the pane's real total when it lists only the first eight of nine", () => {
    const nine = Array.from({ length: 9 }, (_, i) => i);
    const pane = paneItems(nine, false);
    expect(pane.shown).toHaveLength(PANE_PREVIEW);
    expect(pane.total).toBe(9);
    expect(pane.count).toBe("showing 8 of 9");
  });

  it("lists every item, with a plain count, once expanded or when all fit", () => {
    const nine = Array.from({ length: 9 }, (_, i) => i);
    expect(paneItems(nine, true)).toEqual({ shown: nine, total: 9, count: "9" });
    expect(paneItems([1, 2, 3], false).count).toBe("3");
  });
});

describe("examplesHeading", () => {
  it("does not call a restaurant's examples a dental office reference without saying they carry over", () => {
    expect(examplesHeading("dental")).toBe("Examples from a dental or medical office");
    expect(examplesHeading("restaurant")).toMatch(/same patterns occur in any business/);
  });
});
