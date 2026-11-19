import { daysBetween, isCalendarDate } from "./dates";

// /home/ubuntu/scan/LLM/src/pioneer/intelligence/risk/infrastructure.py: MATERIAL_WEIBULL.
export const PIPE_WEIBULL = {
  cast_iron: { shape: 2.8, scale: 50 },
  ductile_iron: { shape: 3, scale: 70 },
  pvc: { shape: 2.2, scale: 80 },
  steel: { shape: 3.5, scale: 60 },
  concrete: { shape: 2.5, scale: 65 },
  lead: { shape: 2, scale: 40 },
} as const;

// /home/ubuntu/scan/LLM/src/pioneer/intelligence/risk/building.py: BuildingRiskAssessor.assess.
export const BUILDING_WEIGHTS = {
  age: 0.2,
  condition: 0.25,
  occupancy: 0.15,
  seismic: 0.15,
  inspection: 0.15,
  fire: 0.1,
} as const;
export const BUILDING_AGE_YEARS = 100;
export const FLOOR_AREA_PER_UNIT = 10;
export const OCCUPANTS_PER_UNIT = 5;
export const MAX_SEISMIC_ZONE = 4;
export const INSPECTION_YEARS = 5;
export const NO_FIRE_SUPPRESSION = 0.35;
// /home/ubuntu/scan/LLM/src/pioneer/intelligence/risk/models.py: BuildingProfile and severity_from_score.
export const MIN_BUILDING_YEAR = 1800;
export const MAX_BUILDING_YEAR = 2100;
export const WATCH_FROM = 0.25;
export const REVIEW_FROM = 0.5;
// Local calendar adapter for the source's last_inspection_years_ago input.
export const DAYS_PER_YEAR = 365.25;

export type PhysicalRiskInput = {
  pipeMaterial?: keyof typeof PIPE_WEIBULL;
  pipeAge?: number;
  buildingYear?: number;
  condition?: number;
  occupancy?: number;
  floorArea?: number;
  seismicZone?: number;
  fireSuppression?: boolean;
  lastInspection?: string;
};
export type PhysicalBand = "Low" | "Watch" | "Review";
export type BandResult = { band: PhysicalBand; reason?: never } | { band?: never; reason: string };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const between = (v: unknown, min: number, max = Infinity): v is number =>
  finite(v) && v >= min && v <= max;
const materialKnown = (v: unknown): v is keyof typeof PIPE_WEIBULL =>
  typeof v === "string" && Object.hasOwn(PIPE_WEIBULL, v);

export function normalizePhysicalRisk(value: unknown): PhysicalRiskInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const out: PhysicalRiskInput = {};
  if (materialKnown(v.pipeMaterial)) out.pipeMaterial = v.pipeMaterial;
  if (between(v.pipeAge, 0)) out.pipeAge = v.pipeAge;
  if (
    between(v.buildingYear, MIN_BUILDING_YEAR, MAX_BUILDING_YEAR) &&
    Number.isInteger(v.buildingYear)
  )
    out.buildingYear = v.buildingYear;
  if (between(v.condition, 0, 1)) out.condition = v.condition;
  if (between(v.occupancy, 0) && Number.isInteger(v.occupancy)) out.occupancy = v.occupancy;
  if (finite(v.floorArea) && v.floorArea > 0) out.floorArea = v.floorArea;
  if (between(v.seismicZone, 0, MAX_SEISMIC_ZONE) && Number.isInteger(v.seismicZone))
    out.seismicZone = v.seismicZone;
  if (typeof v.fireSuppression === "boolean") out.fireSuppression = v.fireSuppression;
  if (typeof v.lastInspection === "string" && isCalendarDate(v.lastInspection))
    out.lastInspection = v.lastInspection;
  return Object.keys(out).length ? out : undefined;
}

export function pipeFailureProbability(material: unknown, age: unknown): number | undefined {
  if (!materialKnown(material) || !between(age, 0)) return undefined;
  const { shape, scale } = PIPE_WEIBULL[material];
  return 1 - Math.exp(-((age / scale) ** shape));
}

export function physicalBand(value: number): PhysicalBand | undefined {
  if (!between(value, 0, 1)) return undefined;
  return value >= REVIEW_FROM ? "Review" : value >= WATCH_FROM ? "Watch" : "Low";
}

function buildingBand(p: PhysicalRiskInput, today: string): BandResult {
  const {
    buildingYear,
    condition,
    occupancy,
    floorArea,
    seismicZone,
    fireSuppression,
    lastInspection,
  } = p;
  if (
    buildingYear === undefined ||
    condition === undefined ||
    occupancy === undefined ||
    floorArea === undefined ||
    seismicZone === undefined ||
    fireSuppression === undefined ||
    lastInspection === undefined
  ) {
    return {
      reason:
        "Building estimate skipped: enter a valid building year, condition, occupancy, floor area, seismic zone, fire suppression and last inspection date. Unknown inputs are not estimated.",
    };
  }
  const age = Number(today.slice(0, 4)) - buildingYear;
  if (age < 0 || lastInspection > today)
    return {
      reason:
        "Building estimate skipped: the building year and inspection date cannot be in the future.",
    };
  const factors = {
    age: Math.min(1, age / BUILDING_AGE_YEARS),
    condition: 1 - condition,
    occupancy: Math.min(
      1,
      occupancy / Math.max(floorArea / FLOOR_AREA_PER_UNIT, 1) / OCCUPANTS_PER_UNIT,
    ),
    seismic: seismicZone / MAX_SEISMIC_ZONE,
    inspection: Math.min(1, daysBetween(lastInspection, today)! / DAYS_PER_YEAR / INSPECTION_YEARS),
    fire: fireSuppression ? 0 : NO_FIRE_SUPPRESSION,
  };
  const weighted = (Object.keys(factors) as (keyof typeof factors)[]).reduce(
    (sum, key) => sum + factors[key] * BUILDING_WEIGHTS[key],
    0,
  );
  const total = Object.values(BUILDING_WEIGHTS).reduce<number>((sum, weight) => sum + weight, 0);
  return { band: physicalBand(weighted / total)! };
}

export function assessPhysicalRisk(
  value: unknown,
  today: string,
): { pipe: BandResult; building: BandResult } {
  if (!isCalendarDate(today)) {
    const skipped = { reason: "Estimate skipped: a valid calendar day is needed." };
    return { pipe: { ...skipped }, building: { ...skipped } };
  }
  const input = normalizePhysicalRisk(value) ?? {};
  const probability = pipeFailureProbability(input.pipeMaterial, input.pipeAge);
  return {
    pipe:
      probability === undefined
        ? {
            reason:
              "Pipe estimate skipped: choose a known pipe material and enter a non-negative pipe age. Unknown materials are not estimated.",
          }
        : { band: physicalBand(probability)! },
    building: buildingBand(input, today),
  };
}
