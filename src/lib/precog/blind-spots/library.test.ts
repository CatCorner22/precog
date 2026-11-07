import { describe, expect, it } from "vitest";
import { BLIND_SPOTS, HEADCOUNT_THRESHOLDS, TIER_ORDER, TIER_WORDS } from "./library";

const ALL_TEXT = (s: (typeof BLIND_SPOTS)[number]) =>
  [s.title, s.why, s.check, ...s.fix, ...s.sources.map((x) => x.label)].join(" ");

describe("the blind-spot library", () => {
  it("gives every entry a unique id, a tier, a question and at least one public source", () => {
    const ids = BLIND_SPOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of BLIND_SPOTS) {
      expect(TIER_ORDER).toContain(s.tier);
      expect(s.check.trim().endsWith("?")).toBe(true);
      expect(s.fix.length).toBeGreaterThan(0);
      expect(s.sources.length).toBeGreaterThan(0);
      for (const src of s.sources) expect(src.url).toMatch(/^https:\/\//);
    }
  });

  it("keeps to the product wording rules", () => {
    const text = [
      ...BLIND_SPOTS.map(ALL_TEXT),
      ...Object.values(TIER_WORDS).flatMap((w) => [w.label, w.detail]),
      ...HEADCOUNT_THRESHOLDS.map((t) => t.rule),
    ].join("\n");
    expect(text).not.toMatch(/\bshould\b/i);
    expect(text).not.toMatch(/\be\.g\./i);
    expect(text).not.toMatch(/\bthe app\b/i);
    expect(text).not.toMatch(/\bbackup\b/i);
    expect(text).not.toMatch(/\blog ?in\b/i);
  });

  it("marks every entry that quotes a state rule with its state", () => {
    for (const s of BLIND_SPOTS) {
      const namesTennessee = /Tennessee|Tenn\. Code/.test(ALL_TEXT(s));
      if (s.region) expect(namesTennessee).toBe(true);
    }
    expect(HEADCOUNT_THRESHOLDS.map((t) => t.at)).toEqual(
      [...HEADCOUNT_THRESHOLDS.map((t) => t.at)].sort((a, b) => a - b),
    );
  });
});
