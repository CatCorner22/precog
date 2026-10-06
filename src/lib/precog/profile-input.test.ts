import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "./industry";
import { defaultProfile, normalizeProfile, type PracticeProfile } from "./practice-profile";
import {
  isBusinessId,
  MAX_PROFILE_BYTES,
  UNREADABLE_PROFILE_MESSAGE,
  validateProfileInput,
} from "./profile-input";
import { buildReportModelForProfile } from "./report/stored-model";
import { getIndustryTemplate } from "./templates";

const TODAY = "2026-10-06";

/** A sample filled in the way an owner's own copy is: every list held as custom. */
function sample(id: (typeof INDUSTRIES)[number]["id"]): Record<string, any> {
  const tpl = getIndustryTemplate(id);
  return JSON.parse(
    JSON.stringify({
      ...defaultProfile(id),
      customPeople: tpl.people,
      customProcesses: tpl.processes,
      customKnowledge: tpl.knowledge,
      customRelations: tpl.relations,
    }),
  );
}

/** The status and message a save gets back, or null when it is stored. */
function refusal(input: unknown): [number | undefined, string] | null {
  try {
    validateProfileInput(input);
  } catch (error) {
    return [(error as { status?: number }).status, (error as Error).message];
  }
  return null;
}

/** Where a report model holds a number that is not finite, or text that prints NaN, undefined or [object Object]. */
function unprintable(model: unknown): string[] {
  const bad: string[] = [];
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 12 || bad.length > 2) return;
    if (typeof value === "number" && !Number.isFinite(value)) bad.push(`${path}=${value}`);
    else if (typeof value === "string" && /\bNaN\b|\bundefined\b|\[object Object\]/.test(value)) {
      bad.push(`${path}="${value.slice(0, 90)}"`);
    } else if (value && typeof value === "object" && !(value instanceof Map)) {
      if (value instanceof Set) return;
      for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`, depth + 1);
    }
  };
  walk(model, "", 0);
  return bad;
}

/** One field of an own-team profile, as the stress fuzzing set it. */
const JUNK_TARGETS: [string, (profile: Record<string, any>, value: unknown) => void][] = [
  ["process.risks", (p, v) => void (p.customProcesses[0].risks = v)],
  ["process.risks[0]", (p, v) => void (p.customProcesses[0].risks = [v])],
  [
    "process.risks[0].likelihood",
    (p, v) => void (p.customProcesses.find((x: any) => x.risks?.length).risks[0].likelihood = v),
  ],
  [
    "process.risks[0].severity",
    (p, v) => void (p.customProcesses.find((x: any) => x.risks?.length).risks[0].severity = v),
  ],
  ["process.inputs", (p, v) => void (p.customProcesses[0].inputs = v)],
  ["process.inputs[0]", (p, v) => void (p.customProcesses[0].inputs = [v])],
  ["process.outputs", (p, v) => void (p.customProcesses[0].outputs = v)],
  ["process.systems", (p, v) => void (p.customProcesses[0].systems = v)],
  ["process.ideas", (p, v) => void (p.customProcesses[0].ideas = v)],
  ["process.ideas[0]", (p, v) => void (p.customProcesses[0].ideas = [v])],
  ["process.wastes", (p, v) => void (p.customProcesses[0].wastes = v)],
  ["process.wastes[0]", (p, v) => void (p.customProcesses[0].wastes = [v])],
  ["person.entitlements", (p, v) => void (p.customPeople[0].entitlements = v)],
  [
    "person.entitlements[0]",
    (p, v) => void (p.customPeople[0].entitlements = [v, "record_deposits", "bank_reconcile"]),
  ],
  ["knowledge.criticality", (p, v) => void (p.customKnowledge[0].criticality = v)],
  ["knowledge.kind", (p, v) => void (p.customKnowledge[0].kind = v)],
];
const JUNK_VALUES: unknown[] = [
  null,
  0,
  -1,
  1e308,
  "",
  "text",
  true,
  {},
  { length: 2 },
  [],
  0.5,
  101,
  "high",
  "urgent",
  7,
  Number.NaN,
];

describe("validateProfileInput", () => {
  it("accepts a default profile and pins its business id", () => {
    const profile = defaultProfile("retail");
    const out = validateProfileInput(profile);
    expect(out.businessId).toBe(profile.businessId);
    expect(JSON.parse(out.json).businessId).toBe(profile.businessId);
  });

  it("falls back to biz_default for a legacy profile with no id", () => {
    const { businessId, ...legacy } = defaultProfile("dental");
    void businessId;
    expect(validateProfileInput(legacy).businessId).toBe("biz_default");
  });

  it("rejects non-objects, missing names, unknown industries and bad ids", () => {
    expect(() => validateProfileInput(null)).toThrow(/object/);
    expect(() => validateProfileInput([])).toThrow(/object/);
    expect(() => validateProfileInput({ industry: "dental" })).toThrow(/name/);
    expect(() => validateProfileInput({ practiceName: "X", industry: "space" })).toThrow(
      /industry/,
    );
    expect(() =>
      validateProfileInput({ ...defaultProfile("dental"), businessId: "biz/../other" }),
    ).toThrow(/Business id/);
    expect(() => validateProfileInput({ ...defaultProfile("dental"), businessId: "" })).toThrow(
      /Business id/,
    );
  });

  it("refuses a list entry every reader would fail on", () => {
    const base = defaultProfile("general");
    const refused = [400, UNREADABLE_PROFILE_MESSAGE];
    expect(UNREADABLE_PROFILE_MESSAGE).toBe(
      "This business has data Precog cannot read. Reload the page and try again.",
    );
    expect(refusal({ ...base, customPeople: [null] })).toEqual(refused);
    expect(refusal({ ...base, customPeople: [{ id: "x", name: "No title" }] })).toEqual(refused);
    expect(refusal({ ...base, customKnowledge: [null] })).toEqual(refused);
    expect(refusal({ ...base, customRelations: "all" })).toEqual(refused);
    expect(refusal({ ...base, mapVersions: [{ id: "v" }] })).toEqual(refused);
    expect(refusal({ ...base, mapLayout: { a: { x: "left" } } })).toEqual(refused);
    expect(refusal(base)).toBeNull();
  });

  it("refuses a duty list holding a null, or one that is an object", () => {
    const person = (entitlements: unknown) => ({
      ...defaultProfile("general"),
      businessId: "biz1",
      customPeople: [{ id: "p1", name: "Ann", role: "Bookkeeper", active: true, entitlements }],
    });
    for (const entitlements of [[null, "record_deposits"], { length: 2 }, 7]) {
      expect(refusal(person(entitlements))).toEqual([400, UNREADABLE_PROFILE_MESSAGE]);
    }
    expect(refusal(person(["record_deposits"]))).toBeNull();
  });

  it("refuses non-list risks, a criticality outside the vocabulary and a NaN likelihood", () => {
    const risks = sample("general");
    risks.customProcesses[0].risks = "text";
    const criticality = sample("general");
    criticality.customKnowledge[0].criticality = "urgent";
    const likelihood = sample("general");
    likelihood.customProcesses.find((p: any) => p.risks?.length).risks[0].likelihood = Number.NaN;
    for (const input of [risks, criticality, likelihood]) {
      expect(refusal(input)).toEqual([400, UNREADABLE_PROFILE_MESSAGE]);
    }
  });

  it("stores only what the normaliser and the report can read", () => {
    const failures: string[] = [];
    for (const [target, set] of JUNK_TARGETS) {
      for (const value of JUNK_VALUES) {
        const input = sample("general");
        input.businessId = "biz1";
        set(input, value);
        const name = `${target}=${JSON.stringify(value) ?? String(value)}`;
        // A copy stored before this check, read back: the normaliser rebuilds it.
        try {
          const bad = unprintable(buildReportModelForProfile(input as PracticeProfile, TODAY));
          if (bad.length) failures.push(`${name} (stored earlier): ${bad.join("; ")}`);
        } catch (error) {
          failures.push(`${name} (stored earlier): THROW ${(error as Error).message}`);
        }
        let stored: PracticeProfile;
        try {
          stored = validateProfileInput(input).profile;
        } catch (error) {
          if ((error as Error).message !== UNREADABLE_PROFILE_MESSAGE) {
            failures.push(`${name}: refused with "${(error as Error).message}"`);
          }
          continue;
        }
        try {
          const normalized = normalizeProfile(stored, { today: TODAY });
          for (const list of ["customPeople", "customProcesses", "customKnowledge"] as const) {
            if (normalized[list]?.length !== stored[list]?.length) {
              failures.push(`${name}: ${list} read back with a different length`);
            }
          }
          const bad = unprintable(buildReportModelForProfile(stored, TODAY));
          if (bad.length) failures.push(`${name}: ${bad.join("; ")}`);
        } catch (error) {
          failures.push(`${name}: THROW ${(error as Error).message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("stores every sample byte for byte", () => {
    for (const { id } of INDUSTRIES) {
      const input = sample(id);
      const { json, profile } = validateProfileInput(input);
      expect(json).toBe(JSON.stringify(input));
      expect(profile).toEqual(input);
      expect(unprintable(buildReportModelForProfile(profile, TODAY))).toEqual([]);
    }
  });

  it("accepts a valid profile with 1,000 decisions", () => {
    const input = sample("general");
    input.decisions = Array.from({ length: 1_000 }, (_, i) => ({
      id: `d${i}`,
      createdAt: "2026-09-01T00:00:00.000Z",
      subject: `Decision ${i}`,
      kind: "monitor",
      note: "",
    }));
    const { json } = validateProfileInput(input);
    expect(json).toBe(JSON.stringify(input));
  });

  it("caps the document size", () => {
    const huge = { ...defaultProfile("dental"), notes: "x".repeat(MAX_PROFILE_BYTES) };
    expect(() => validateProfileInput(huge)).toThrow(/too large/);
  });

  it("answers bad input with a 4xx status, not a server error", () => {
    const statusOf = (input: unknown) => {
      try {
        validateProfileInput(input);
      } catch (error) {
        return (error as { status?: number }).status;
      }
      return undefined;
    };
    expect(statusOf(null)).toBe(400);
    expect(statusOf({ industry: "dental" })).toBe(400);
    expect(statusOf({ ...defaultProfile("dental"), notes: "x".repeat(MAX_PROFILE_BYTES) })).toBe(
      413,
    );
  });
});

describe("isBusinessId", () => {
  it("allows the generated shape and rejects anything else", () => {
    expect(isBusinessId("biz_default")).toBe(true);
    expect(isBusinessId("biz_m1abc_x9y8z")).toBe(true);
    expect(isBusinessId("a".repeat(64))).toBe(true);
    expect(isBusinessId("a".repeat(65))).toBe(false);
    expect(isBusinessId("has space")).toBe(false);
    expect(isBusinessId(42)).toBe(false);
  });
});
