import { describe, expect, it } from "vitest";
import { shownProcess } from "./selection";

describe("shownProcess", () => {
  const map = [{ id: "a" }, { id: "b" }];

  it("shows the selected process, else the first one", () => {
    expect(shownProcess(map, "b")?.id).toBe("b");
    expect(shownProcess(map, "gone")?.id).toBe("a");
  });

  it("shows nothing once the last process is deleted, while the old id is still selected", () => {
    expect(shownProcess([], "a")).toBeUndefined();
  });

  it("shows nothing with nothing selected", () => {
    expect(shownProcess(map, null)).toBeUndefined();
  });
});
