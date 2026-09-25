import { z } from "zod";
import { invalidRequest } from "@/lib/request-errors";
import type { ReviewInput } from "./builder/review";
import type { SuggestionInput } from "./builder/suggest";
import type { PioneerProfileInput } from "./coach/pioneer-profile";

/**
 * Input checks for the server functions anyone can call signed out
 * (loadMapShare, suggestForProcess, reviewMap, runPioneerCoach). The earlier
 * validators called .map, .trim and String() on whatever arrived, so null or
 * mistyped input crashed with a TypeError whose text went back to the
 * caller. These schemas refuse the wrong kind of container (not an object,
 * not an array, an object where text belongs) with a plain 400 "Invalid
 * request", and otherwise keep the earlier truncation and clamping, so every
 * request the app itself sends is read exactly as before.
 */

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalidRequest();
  return parsed.data;
}

/** A text field: a string, number or boolean, read as text and cut to `max` characters. */
const text = (max: number) =>
  z.union([z.string(), z.number(), z.boolean()]).transform((v) => String(v).slice(0, max));

/** Any JS number, NaN and infinities included, as the earlier validators passed it through. */
const anyNumber = z.custom<number>((v) => typeof v === "number");

/** A number field: any number (NaN and infinities are clamped by the caller), or numeric text. */
const numeric = z.union([anyNumber, z.string(), z.boolean()]).transform((v) => Number(v));

/**
 * A list that keeps its first `keep` entries (as the earlier validators did)
 * and refuses more than `hardMax`, checking only the entries it keeps.
 */
function list<T extends z.ZodType>(item: T, keep: number, hardMax = 5_000) {
  return z
    .array(z.unknown())
    .max(hardMax)
    .transform((entries) => entries.slice(0, keep))
    .pipe(z.array(item));
}

/** The earlier `Math.max(min, Math.min(max, Number(x) || fallback))`, unchanged. */
const bound = (value: number | null | undefined, min: number, max: number, fallback: number) =>
  Math.max(min, Math.min(max, value || fallback));

// ---------------------------------------------------------------- loadMapShare

const loadShareSchema = z.object({
  token: z.string().max(256),
  passcode: z.string().max(256).nullish(),
});

export function parseLoadShareInput(input: unknown): { token: string; passcode?: string } {
  const data = parse(loadShareSchema, input);
  return { token: data.token, passcode: data.passcode?.trim() || undefined };
}

// ----------------------------------------------------------- suggestForProcess

const suggestionSchema = z.object({
  processName: text(80).nullish(),
  description: text(400).nullish(),
  industryLabel: text(60).nullish(),
  existingRiskTitles: list(text(200), 20).nullish(),
  existingIdeaTitles: list(text(200), 20).nullish(),
  availableControls: list(z.object({ id: text(80), name: text(80) }), 30).nullish(),
  ownerRoles: list(text(80), 10).nullish(),
});

export function parseSuggestionInput(input: unknown): SuggestionInput {
  const data = parse(suggestionSchema, input);
  return {
    processName: data.processName ?? "",
    description: data.description ?? "",
    industryLabel: data.industryLabel ?? "small business",
    existingRiskTitles: data.existingRiskTitles ?? [],
    existingIdeaTitles: data.existingIdeaTitles ?? [],
    availableControls: data.availableControls ?? [],
    ownerRoles: data.ownerRoles ?? [],
  };
}

// ------------------------------------------------------------------- reviewMap

const reviewProcessSchema = z.object({
  id: text(60),
  name: text(80),
  stage: numeric.nullish(),
  owners: list(text(60), 6).nullish(),
  controls: list(text(80), 8).nullish(),
  riskTitles: list(text(80).nullish(), 4).nullish(),
  fraudRisks: numeric.nullish(),
  heat: numeric.nullish(),
  dependencyCount: numeric.nullish(),
  openSodGaps: numeric.nullish(),
});

const reviewSchema = z.object({
  businessName: text(80).nullish(),
  industryLabel: text(60).nullish(),
  teamSize: numeric.nullish(),
  health: z
    .object({
      score: numeric.nullish(),
      band: text(30).nullish(),
      dimensions: list(
        z.object({ label: text(30), score: numeric.nullish(), hint: text(80).nullish() }),
        6,
      ).nullish(),
    })
    .nullish(),
  processes: list(reviewProcessSchema, 40).nullish(),
  issues: list(text(160), 10).nullish(),
  overburdened: list(
    z.object({ name: text(60), role: text(80), flags: list(text(80), 4).nullish() }),
    4,
  ).nullish(),
  unownedProcesses: list(text(80), 10).nullish(),
});

export function parseReviewInput(input: unknown): ReviewInput {
  const data = parse(reviewSchema, input);
  return {
    businessName: data.businessName ?? "",
    industryLabel: data.industryLabel ?? "small business",
    teamSize: bound(data.teamSize, 1, 200, 1),
    health: {
      score: bound(data.health?.score, 0, 100, 0),
      band: data.health?.band ?? "",
      dimensions: (data.health?.dimensions ?? []).map((d) => ({
        label: d.label,
        score: bound(d.score, 0, 100, 0),
        hint: d.hint ?? "",
      })),
    },
    processes: (data.processes ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      stage: p.stage || 0,
      owners: p.owners ?? [],
      controls: p.controls ?? [],
      riskTitles: (p.riskTitles ?? []).map((t) => t ?? ""),
      fraudRisks: p.fraudRisks || 0,
      heat: bound(p.heat, 0, 100, 0),
      dependencyCount: p.dependencyCount || 0,
      openSodGaps: p.openSodGaps || 0,
    })),
    issues: data.issues ?? [],
    overburdened: (data.overburdened ?? []).map((o) => ({
      name: o.name,
      role: o.role,
      flags: o.flags ?? [],
    })),
    unownedProcesses: data.unownedProcesses ?? [],
  };
}

// ------------------------------------------------------------- runPioneerCoach

/** Largest lists Pioneer reads; pioneerProfileFrom applies the same caps. */
const PIONEER_LIST_CAPS = {
  nodes: 250,
  relations: 2_500,
  decisions: 500,
  absences: 200,
} as const;

const optString = z.string().nullish();
const stringList = z.array(z.unknown()).nullish();
const objectList = z.array(z.looseObject({})).nullish();

/**
 * Entries of the custom lists: an object with a string id, and the fields the
 * engines walk or call string methods on typed when present. Other fields
 * pass through untouched.
 */
const personSchema = z.looseObject({
  id: z.string(),
  name: optString,
  role: optString,
  active: z.boolean().nullish(),
  tenureYears: anyNumber.nullish(),
  lastDay: optString,
  entitlements: stringList,
  department: optString,
  owner: z.boolean().nullish(),
});

const processSchema = z.looseObject({
  id: z.string(),
  name: optString,
  layer: optString,
  description: optString,
  dependencies: stringList,
  controlIds: stringList,
  stage: anyNumber.nullish(),
  ownerPersonIds: stringList,
  risks: objectList,
  ideas: objectList,
  wastes: objectList,
  inputs: stringList,
  outputs: stringList,
  evidence: objectList,
  cadence: optString,
  systems: stringList,
  documented: z.boolean().nullish(),
  procedureLocation: optString,
});

const knowledgeSchema = z.looseObject({
  id: z.string(),
  name: optString,
  criticality: optString,
  category: optString,
  description: optString,
  linkedProcessIds: stringList,
  kind: optString,
  documented: z.boolean().nullish(),
  procedureLocation: optString,
  confirmedAt: optString,
});

const relationSchema = z.looseObject({
  personId: z.string(),
  knowledgeId: z.string(),
  level: optString,
});

const staffSchema = z.looseObject({
  teamSize: anyNumber.nullish(),
  soleOwnerKnowledgeCount: anyNumber.nullish(),
  avgTenureYears: anyNumber.nullish(),
  segregationScore: anyNumber.nullish(),
  dualControlPayments: z.boolean().nullish(),
  independentBankRec: z.boolean().nullish(),
  segregationSource: optString,
  bankRecSource: optString,
});

const pioneerProfileSchema = z.looseObject({
  industry: optString,
  practiceName: optString,
  staff: staffSchema.nullish(),
  riskVariables: z.record(z.string(), z.union([anyNumber, z.boolean()]).nullable()).nullish(),
  dualRelease: z.looseObject({}).nullish(),
  customProcesses: list(processSchema, PIONEER_LIST_CAPS.nodes).nullish(),
  customPeople: list(personSchema, PIONEER_LIST_CAPS.nodes).nullish(),
  customKnowledge: list(knowledgeSchema, PIONEER_LIST_CAPS.nodes).nullish(),
  customRelations: list(relationSchema, PIONEER_LIST_CAPS.relations, 100_000).nullish(),
  // Journal entries and absences are rebuilt field by field downstream.
  decisions: list(z.unknown(), PIONEER_LIST_CAPS.decisions).nullish(),
  plannedAbsences: list(z.unknown(), PIONEER_LIST_CAPS.absences).nullish(),
});

const pioneerSchema = z.object({
  question: z.string().nullish(),
  preferLocal: z.boolean().nullish(),
  profile: pioneerProfileSchema.nullish(),
  today: z.string().max(40).nullish(),
});

export interface PioneerRequest {
  question: string;
  preferLocal: boolean;
  profile: PioneerProfileInput;
  today: string | undefined;
}

export function parsePioneerInput(input: unknown): PioneerRequest {
  const data = parse(pioneerSchema, input);
  return {
    question: (data.question ?? "").trim().slice(0, 1500),
    preferLocal: Boolean(data.preferLocal),
    // The schema checked the shapes Pioneer walks; pioneerProfileFrom builds
    // the canonical profile (defaults, caps, journal and absence rebuilds).
    profile: (data.profile ?? {}) as PioneerProfileInput,
    today: data.today ?? undefined,
  };
}
