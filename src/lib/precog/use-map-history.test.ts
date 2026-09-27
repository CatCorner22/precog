import { describe, expect, it } from "vitest";
import { captureMapSnapshot, type MapSnapshot } from "./builder/map-history";
import { defaultProfile } from "./practice-profile";
import { pushSnapshot } from "./use-map-history";

describe("pushSnapshot", () => {
  it("pushes one step for two edits made from the same rendered profile", () => {
    const stack: MapSnapshot[] = [];
    const rendered = defaultProfile("general");
    expect(pushSnapshot(stack, captureMapSnapshot(rendered))).toBe(true);
    expect(pushSnapshot(stack, captureMapSnapshot(rendered))).toBe(false);
    expect(stack).toHaveLength(1);
    const next = { ...rendered, mapLayout: { a: { x: 1, y: 2 } } };
    expect(pushSnapshot(stack, captureMapSnapshot(next))).toBe(true);
    expect(stack).toHaveLength(2);
  });

  it("keeps the newest fifty steps", () => {
    const stack: MapSnapshot[] = [];
    for (let i = 0; i < 60; i += 1) {
      pushSnapshot(stack, {
        customProcesses: null,
        customPeople: null,
        mapLayout: { [i]: { x: i, y: 0 } },
      });
    }
    expect(stack).toHaveLength(50);
    expect(Object.keys(stack[0].mapLayout ?? {})).toEqual(["10"]);
  });
});
