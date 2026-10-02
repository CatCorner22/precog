import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "./industry";
import { defaultProfile, normalizeProfile, readStoredProfile } from "./practice-profile";
import { getIndustryTemplate } from "./templates";

/**
 * The normaliser runs on every stored business, in the browser and in the
 * weekly email job. A throw there hides a business on a device and, before
 * the job caught it, stopped the emails for everyone. Whatever a stored copy
 * holds, normalizeProfile returns a profile.
 */

/** A small seeded generator, so a failure names an input that reproduces. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Each sample filled in the way an owner's own copy is: every list held as custom. */
function samples(): Record<string, unknown>[] {
  return INDUSTRIES.map(({ id }) => {
    const tpl = getIndustryTemplate(id);
    return JSON.parse(
      JSON.stringify({
        ...defaultProfile(id),
        customProcesses: tpl.processes,
        customPeople: tpl.people,
        customKnowledge: tpl.knowledge,
        customRelations: tpl.relations,
      }),
    ) as Record<string, unknown>;
  });
}

const JUNK: unknown[] = [
  null,
  undefined,
  0,
  -1,
  Number.NaN,
  1e308,
  "",
  "text",
  true,
  {},
  [],
  [null],
  [1, "a", {}],
  { id: null, name: 3 },
  [{ id: null, name: 3, steps: null, items: "x", entries: [null], date: 5 }],
  [{ id: "a", name: "b", steps: [{}], items: [{}], people: {}, createdAt: "never" }],
  { length: 5 },
  "2026-02-30",
];

/** Replaces values throughout `value` with junk, at the rate `rate`. */
function corrupt(value: unknown, next: () => number, rate: number, depth = 0): unknown {
  if (next() < rate) return JUNK[Math.floor(next() * JUNK.length)];
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => corrupt(v, next, rate, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) out[key] = corrupt(v, next, rate, depth + 1);
    return out;
  }
  return value;
}

describe("normalizeProfile never throws", () => {
  it("reads each of the 8 industry samples", () => {
    expect(samples()).toHaveLength(8);
    for (const sample of samples()) {
      expect(normalizeProfile(sample).industry).toBe(sample.industry);
    }
  });

  it("reads a sample with any one field set to null, a wrong type, or nothing", () => {
    for (const sample of samples()) {
      for (const key of [...Object.keys(sample), "monthlyReviews", "procedures", "places"]) {
        for (const junk of JUNK) {
          expect(() => normalizeProfile({ ...sample, [key]: junk })).not.toThrow();
        }
      }
    }
  });

  it("reads oversized lists and lists of junk", () => {
    const sample = samples()[0];
    const big = (entry: unknown) => Array.from({ length: 5000 }, () => entry);
    for (const key of Object.keys(sample)) {
      for (const entry of [null, 7, "x", {}, (sample[key] as unknown[] | undefined)?.[0] ?? {}]) {
        expect(() => normalizeProfile({ ...sample, [key]: big(entry) })).not.toThrow();
      }
    }
  });

  it("reads a sample whose missing arrays and nested fields are missing too", () => {
    for (const sample of samples()) {
      const bare: Record<string, unknown> = { industry: sample.industry };
      expect(() => normalizeProfile(bare)).not.toThrow();
      for (const key of Object.keys(sample)) {
        const without = { ...sample };
        delete without[key];
        expect(() => normalizeProfile(without)).not.toThrow();
      }
    }
  });

  it("reads samples corrupted at random throughout", () => {
    const list = samples();
    for (let seed = 1; seed <= 400; seed += 1) {
      const next = rng(seed);
      const input = corrupt(list[seed % list.length], next, 0.02 + (seed % 5) * 0.03);
      expect(
        () => normalizeProfile(input as Record<string, unknown>),
        `seed ${seed}`,
      ).not.toThrow();
    }
  });

  it("reads any top-level value, and stored text is never unreadable for these inputs", () => {
    for (const junk of JUNK) {
      expect(() => normalizeProfile(junk as Record<string, unknown>)).not.toThrow();
      expect(
        readStoredProfile(JSON.stringify({ industry: "general", staff: junk })).unreadable,
      ).toBe(null);
    }
  });
});
