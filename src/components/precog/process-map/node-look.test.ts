import { describe, expect, it } from "vitest";
import { predatorThermalColor } from "@/lib/precog/map-vision";
import { nodeAccent, targetLocked } from "./node-look";

describe("nodeAccent", () => {
  it("colours a predator card by its priority, not by a higher heat", () => {
    expect(nodeAccent("predator", 100, 80)).toBe(predatorThermalColor(80));
    expect(nodeAccent("predator", 100, 80)).not.toBe(predatorThermalColor(100));
  });
});

describe("targetLocked", () => {
  it("locks only immediate targets, however high the priority", () => {
    expect(targetLocked("terminator", { immediate: false })).toBe(false);
    expect(targetLocked("terminator", {})).toBe(false);
    expect(targetLocked("terminator", { immediate: true })).toBe(true);
  });

  it("never locks outside the Terminator vision or on an unscored card", () => {
    expect(targetLocked("predator", { immediate: true })).toBe(false);
    expect(targetLocked("terminator", { immediate: true, unscored: true })).toBe(false);
  });
});
