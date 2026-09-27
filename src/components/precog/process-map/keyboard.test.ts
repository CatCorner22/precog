import { describe, expect, it } from "vitest";
import { processAfterArrow, type OrderedProcess } from "./keyboard";

// Two lanes: stage 0 holds a (top) and b; stage 1 holds c (level with b).
const order: OrderedProcess[] = [
  { id: "a", stage: 0, y: 0 },
  { id: "b", stage: 0, y: 200 },
  { id: "c", stage: 1, y: 180 },
];

describe("processAfterArrow", () => {
  it("starts at the first process when nothing is selected", () => {
    expect(processAfterArrow(order, null, "ArrowRight")?.id).toBe("a");
  });

  it("moves to the nearest process in the next lane by height", () => {
    expect(processAfterArrow(order, "b", "ArrowRight")?.id).toBe("c");
    expect(processAfterArrow(order, "c", "ArrowLeft")?.id).toBe("b");
  });

  it("moves within a lane and stops at its ends", () => {
    expect(processAfterArrow(order, "a", "ArrowDown")?.id).toBe("b");
    expect(processAfterArrow(order, "b", "ArrowDown")?.id).toBe("b");
    expect(processAfterArrow(order, "a", "ArrowUp")?.id).toBe("a");
    expect(processAfterArrow(order, "a", "ArrowLeft")?.id).toBe("a");
  });

  it("has nowhere to go on an empty map", () => {
    expect(processAfterArrow([], null, "ArrowDown")).toBeUndefined();
  });
});
