import { describe, expect, it } from "vitest";
import {
  assessPhysicalRisk,
  physicalBand,
  pipeFailureProbability,
  PIPE_WEIBULL,
  normalizePhysicalRisk,
  BUILDING_WEIGHTS,
  MIN_BUILDING_YEAR,
  MAX_BUILDING_YEAR,
  type PhysicalRiskInput,
} from "./physical-risk";
import { defaultProfile, hasUserWork, normalizeProfile } from "./practice-profile";
import { buildReportModelForProfile } from "./report/stored-model";
import { validateProfileInput } from "./profile-input";

const today = "2026-11-19";
const complete: PhysicalRiskInput = {
  pipeMaterial: "cast_iron",
  pipeAge: 80,
  buildingYear: 2026,
  condition: 1,
  occupancy: 0,
  floorArea: 1000,
  seismicZone: 0,
  fireSuppression: true,
  lastInspection: today,
};

describe("physical risk bands", () => {
  it.each([
    [0, "Low"],
    [0.25 - Number.EPSILON, "Low"],
    [0.25, "Watch"],
    [0.25 + Number.EPSILON, "Watch"],
    [0.5 - Number.EPSILON, "Watch"],
    [0.5, "Review"],
    [0.5 + Number.EPSILON, "Review"],
    [0.75 - Number.EPSILON, "Review"],
    [0.75, "Review"],
    [0.75 + Number.EPSILON, "Review"],
    [1, "Review"],
  ] as const)("maps edge %s to %s", (value, expected) =>
    expect(physicalBand(value)).toBe(expected),
  );
  it.each([NaN, Infinity, -Infinity, -1, 1.1])("refuses invalid band input %s", (v) =>
    expect(physicalBand(v)).toBeUndefined(),
  );
  it("keeps the six exact source parameter pairs and building weights", () => {
    expect(PIPE_WEIBULL).toEqual({
      cast_iron: { shape: 2.8, scale: 50 },
      ductile_iron: { shape: 3, scale: 70 },
      pvc: { shape: 2.2, scale: 80 },
      steel: { shape: 3.5, scale: 60 },
      concrete: { shape: 2.5, scale: 65 },
      lead: { shape: 2, scale: 40 },
    });
    expect(BUILDING_WEIGHTS).toEqual({
      age: 0.2,
      condition: 0.25,
      occupancy: 0.15,
      seismic: 0.15,
      inspection: 0.15,
      fire: 0.1,
    });
  });
  it.each(Object.entries(PIPE_WEIBULL))(
    "uses the CDF without source defaults for %s",
    (material, { scale, shape }) => {
      expect(pipeFailureProbability(material, 0)).toBe(0);
      expect(pipeFailureProbability(material, scale)).toBeCloseTo(1 - Math.exp(-1), 14);
      expect(pipeFailureProbability(material, scale / 2)).toBeCloseTo(
        1 - Math.exp(-(0.5 ** shape)),
        14,
      );
      expect(pipeFailureProbability(material, scale * 2)).toBeGreaterThan(
        pipeFailureProbability(material, scale)!,
      );
      expect(assessPhysicalRisk({ pipeMaterial: material, pipeAge: scale }, today).pipe).toEqual({
        band: "Review",
      });
    },
  );
  it.each(["copper", "__proto__", "toString", undefined, null])(
    "skips unknown material %s rather than using default parameters",
    (material) => {
      expect(pipeFailureProbability(material, 20)).toBeUndefined();
      expect(assessPhysicalRisk({ pipeMaterial: material, pipeAge: 20 }, today).pipe).toMatchObject(
        { reason: expect.stringContaining("Unknown materials") },
      );
    },
  );
  it.each([-1, NaN, Infinity, "20", null, undefined])(
    "skips invalid or missing age %s",
    (pipeAge) =>
      expect(assessPhysicalRisk({ pipeMaterial: "pvc", pipeAge }, today).pipe.band).toBeUndefined(),
  );
  it.each([
    "buildingYear",
    "condition",
    "occupancy",
    "floorArea",
    "seismicZone",
    "fireSuppression",
    "lastInspection",
  ] as const)("requires %s even when other facts exist", (key) => {
    const partial = { ...complete };
    delete partial[key];
    expect(assessPhysicalRisk(partial, today).building).toMatchObject({
      reason: expect.stringContaining("Building estimate skipped"),
    });
  });
  it("uses every building factor, without substituting defaults for zero or false", () => {
    expect(assessPhysicalRisk(complete, today).building).toEqual({ band: "Low" });
    expect(assessPhysicalRisk({ ...complete, condition: 0 }, today).building).toEqual({
      band: "Watch",
    });
    expect(
      assessPhysicalRisk(
        {
          ...complete,
          condition: 0,
          occupancy: 500,
          seismicZone: 4,
          lastInspection: "2020-11-19",
          buildingYear: 1900,
          fireSuppression: false,
        },
        today,
      ).building,
    ).toEqual({ band: "Review" });
    expect(assessPhysicalRisk({ ...complete, condition: 0.001 }, today).building).toEqual({
      band: "Low",
    });
    expect(
      assessPhysicalRisk({ ...complete, condition: 0.001, fireSuppression: false }, today).building,
    ).toEqual({ band: "Watch" });
  });
  it.each([
    { buildingYear: 2025 },
    { occupancy: 1 },
    { seismicZone: 1 },
    { lastInspection: "2026-11-15" },
    { fireSuppression: false },
  ])("uses each source factor at the Watch boundary: %j", (factor) => {
    expect(
      assessPhysicalRisk({ ...complete, condition: 0.001, ...factor }, today).building,
    ).toEqual({ band: "Watch" });
  });
  it("uses floor area when normalizing occupancy", () => {
    expect(
      assessPhysicalRisk({ ...complete, condition: 0.001, occupancy: 1, floorArea: 10000 }, today)
        .building,
    ).toEqual({ band: "Low" });
    expect(
      assessPhysicalRisk({ ...complete, condition: 0.001, occupancy: 1, floorArea: 10 }, today)
        .building,
    ).toEqual({ band: "Watch" });
  });
  it.each([
    { ...complete, buildingYear: 2027 },
    { ...complete, lastInspection: "2026-11-20" },
    { ...complete, lastInspection: "2026-02-30" },
  ])("rejects future or invalid calendar inputs", (input) =>
    expect(assessPhysicalRisk(input, today).building.band).toBeUndefined(),
  );
  it("is deterministic, read-only and emits only bands or reasons", () => {
    const before = JSON.stringify(complete);
    const result = assessPhysicalRisk(complete, today);
    expect(assessPhysicalRisk(complete, today)).toEqual(result);
    expect(JSON.stringify(complete)).toBe(before);
    expect(result).toEqual({ pipe: { band: "Review" }, building: { band: "Low" } });
    expect(assessPhysicalRisk({}, today).pipe.reason).toBeTruthy();
    expect(assessPhysicalRisk(null, "bad day").building.reason).toBeTruthy();
  });
});

describe("optional physical-risk persistence", () => {
  it.each([
    null,
    undefined,
    [],
    "bad",
    3,
    {},
    { unknown: true },
    {
      pipeMaterial: "copper",
      pipeAge: -1,
      buildingYear: 1,
      condition: 2,
      occupancy: 0.5,
      floorArea: 0,
      seismicZone: 8,
      fireSuppression: "false",
      lastInspection: "bad",
    },
  ])("drops malformed and old input without guessing: %j", (value) =>
    expect(normalizePhysicalRisk(value)).toBeUndefined(),
  );
  it("normalizes field by field and excludes unknown data", () => {
    expect(
      normalizePhysicalRisk({
        ...complete,
        pipeAge: "80",
        weather: "unknown",
        rows: [{ secret: "raw" }],
      }),
    ).toEqual({ ...complete, pipeAge: undefined });
    for (const year of [MIN_BUILDING_YEAR, MAX_BUILDING_YEAR])
      expect(normalizePhysicalRisk({ buildingYear: year })).toEqual({ buildingYear: year });
    expect(
      normalizePhysicalRisk({
        pipeAge: 0,
        condition: 0,
        occupancy: 0,
        seismicZone: 0,
        fireSuppression: false,
      }),
    ).toEqual({ pipeAge: 0, condition: 0, occupancy: 0, seismicZone: 0, fireSuppression: false });
  });
  it("preserves old profiles and round-trips normalized JSON without altering reports", () => {
    const old = normalizeProfile(defaultProfile("dental"), { today });
    expect(old).not.toHaveProperty("physicalRisk");
    const saved = normalizeProfile({ ...old, physicalRisk: complete }, { today });
    expect(normalizeProfile(JSON.parse(JSON.stringify(saved)), { today })).toEqual(saved);
    expect(validateProfileInput(saved).profile.physicalRisk).toEqual(complete);
    expect(
      validateProfileInput({
        ...saved,
        physicalRisk: { ...complete, rows: ["SECRET"], floodZone: "unknown" },
      }).profile.physicalRisk,
    ).toEqual(complete);
    expect(hasUserWork(saved)).toBe(true);
    expect(buildReportModelForProfile(saved, today)).toEqual(
      buildReportModelForProfile(old, today),
    );
  });
});
