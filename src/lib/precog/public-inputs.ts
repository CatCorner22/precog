import { POLICY_FIELDS } from "./scoring/insurance-record";
import * as z from "zod/mini";
import { invalidRequest } from "@/lib/request-errors";
import type { ReviewInput } from "./builder/review";
import type { SuggestionInput } from "./builder/suggest";
import type { PioneerProfileInput } from "./coach/pioneer-profile";
import { DRAFT_NOTES_MAX, type ProcedureDraftInput } from "./procedures/draft";
import { clamp } from "./number";
import { PIONEER_LIST_CAPS } from "./coach/pioneer-caps";

/**
 * Input checks for the server functions anyone can call signed out
 * (loadMapShare, suggestForProcess, draftProcedureSteps, reviewMap,
 * runPioneerCoach). The earlier validators called .map, .trim and String() on
 * whatever arrived, so null or
 * mistyped input crashed with a TypeError whose text went back to the
 * caller. These schemas refuse the wrong kind of container (not an object,
 * not an array, an object where text belongs) with a plain 400 "Invalid
 * request", and otherwise keep the earlier truncation and clamping, so every
 * request the app itself sends is read exactly as before.
 */

function parse<T extends z.ZodMiniType>(schema: T, input: unknown): z.output<T> {
  const parsed = z.safeParse(schema, input);
  if (!parsed.success) throw invalidRequest();
  return parsed.data;
}

/** A text field: a string, number or boolean, read as text and cut to `max` characters. */
const text = (max: number) =>
  z.pipe(
    z.union([z.string(), z.number(), z.boolean()]),
    z.transform((v) => String(v).slice(0, max)),
  );

/** Any JS number, NaN and infinities included, as the earlier validators passed it through. */
const anyNumber = z.custom<number>((v) => typeof v === "number");

/** A number field: any number (NaN and infinities are clamped by the caller), or numeric text. */
const numeric = z.pipe(
  z.union([anyNumber, z.string(), z.boolean()]),
  z.transform((v) => Number(v)),
);

/**
 * A list that keeps its first `keep` entries (as the earlier validators did)
 * and refuses more than `hardMax`, checking only the entries it keeps.
 */
function list<T extends z.ZodMiniType>(item: T, keep: number, hardMax = 5_000) {
  return z.pipe(
    z.pipe(
      z.array(z.unknown()).check(z.maxLength(hardMax)),
      z.transform((entries) => entries.slice(0, keep)),
    ),
    z.array(item),
  );
}

/** The earlier `Math.max(min, Math.min(max, Number(x) || fallback))`, unchanged. */
const bound = (value: number | null | undefined, min: number, max: number, fallback: number) =>
  clamp(value || fallback, min, max);

// ---------------------------------------------------------------- loadMapShare

const loadShareSchema = z.object({
  token: z.string().check(z.maxLength(256)),
  passcode: z.nullish(z.string().check(z.maxLength(256))),
});

export function parseLoadShareInput(input: unknown): { token: string; passcode?: string } {
  const data = parse(loadShareSchema, input);
  return { token: data.token, passcode: data.passcode?.trim() || undefined };
}

// ----------------------------------------------------------- suggestForProcess

const suggestionSchema = z.object({
  processName: z.nullish(text(80)),
  description: z.nullish(text(400)),
  industryLabel: z.nullish(text(60)),
  existingRiskTitles: z.nullish(list(text(200), 20)),
  existingIdeaTitles: z.nullish(list(text(200), 20)),
  availableControls: z.nullish(list(z.object({ id: text(80), name: text(80) }), 30)),
  ownerRoles: z.nullish(list(text(80), 10)),
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

// --------------------------------------------------------- draftProcedureSteps

const procedureDraftSchema = z.object({
  title: z.nullish(text(120)),
  placeName: z.nullish(text(80)),
  module: z.nullish(text(120)),
  notes: z.nullish(text(DRAFT_NOTES_MAX)),
  industryLabel: z.nullish(text(60)),
});

export function parseProcedureDraftInput(input: unknown): ProcedureDraftInput {
  const data = parse(procedureDraftSchema, input);
  return {
    title: data.title ?? "",
    placeName: data.placeName ?? "",
    module: data.module ?? "",
    notes: data.notes ?? "",
    industryLabel: data.industryLabel ?? "small business",
  };
}

// ------------------------------------------------------------------- reviewMap

const optNumeric = z.nullish(numeric);

const reviewProcessSchema = z.object({
  id: text(60),
  name: text(80),
  stage: optNumeric,
  owners: z.nullish(list(text(60), 6)),
  controls: z.nullish(list(text(80), 8)),
  riskTitles: z.nullish(list(z.nullish(text(80)), 4)),
  fraudRisks: optNumeric,
  heat: optNumeric,
  dependencyCount: optNumeric,
  openSodGaps: optNumeric,
});

const reviewSchema = z.object({
  businessName: z.nullish(text(80)),
  industryLabel: z.nullish(text(60)),
  teamSize: optNumeric,
  health: z.nullish(
    z.object({
      score: optNumeric,
      band: z.nullish(text(30)),
      dimensions: z.nullish(
        list(z.object({ label: text(30), score: optNumeric, hint: z.nullish(text(80)) }), 6),
      ),
    }),
  ),
  processes: z.nullish(list(reviewProcessSchema, 40)),
  issues: z.nullish(list(text(160), 10)),
  overburdened: z.nullish(
    list(z.object({ name: text(60), role: text(80), flags: z.nullish(list(text(80), 4)) }), 4),
  ),
  unownedProcesses: z.nullish(list(text(80), 10)),
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
export { PIONEER_LIST_CAPS };

const optString = z.nullish(z.string());
const optBoolean = z.nullish(z.boolean());
const optNumber = z.nullish(anyNumber);
const stringList = z.nullish(z.array(z.unknown()));
const objectList = z.nullish(z.array(z.looseObject({})));

/**
 * Entries of the custom lists: an object with a string id, and the fields the
 * engines walk or call string methods on typed when present. Other fields
 * pass through untouched.
 */
const personSchema = z.looseObject({
  id: z.string(),
  name: optString,
  role: optString,
  active: optBoolean,
  tenureYears: optNumber,
  lastDay: optString,
  entitlements: stringList,
  department: optString,
  owner: optBoolean,
});

const processSchema = z.looseObject({
  id: z.string(),
  name: optString,
  layer: optString,
  description: optString,
  dependencies: stringList,
  controlIds: stringList,
  stage: optNumber,
  ownerPersonIds: stringList,
  risks: objectList,
  ideas: objectList,
  wastes: objectList,
  inputs: stringList,
  outputs: stringList,
  evidence: objectList,
  cadence: optString,
  systems: stringList,
  documented: optBoolean,
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
  documented: optBoolean,
  procedureLocation: optString,
  confirmedAt: optString,
});

const relationSchema = z.looseObject({
  personId: z.string(),
  knowledgeId: z.string(),
  level: optString,
});

const staffSchema = z.looseObject({
  teamSize: optNumber,
  soleOwnerKnowledgeCount: optNumber,
  avgTenureYears: optNumber,
  segregationScore: optNumber,
  dualControlPayments: optBoolean,
  independentBankRec: optBoolean,
  segregationSource: optString,
  bankRecSource: optString,
});

const insuranceSchema = z.object({
  status: z.enum(["unknown", "none", "reported"]),
  confirmedFields: z.array(z.enum(POLICY_FIELDS)).check(z.maxLength(POLICY_FIELDS.length)),
  modeledScenarioIds: z.array(z.string().check(z.maxLength(100))).check(z.maxLength(500)),
  source: z.optional(z.string().check(z.maxLength(240))),
  reviewedOn: z.optional(z.string().check(z.maxLength(10))),
});

const riskVariablesSchema = z.catchall(
  z.object({ insurance: z.nullish(insuranceSchema) }),
  z.nullable(z.union([anyNumber, z.boolean()])),
);

const pioneerProfileSchema = z.looseObject({
  industry: optString,
  practiceName: optString,
  staff: z.nullish(staffSchema),
  riskVariables: z.nullish(riskVariablesSchema),
  setupAnswers: z.nullish(z.unknown()),
  dualRelease: z.nullish(z.looseObject({})),
  customProcesses: z.nullish(list(processSchema, PIONEER_LIST_CAPS.nodes)),
  customPeople: z.nullish(list(personSchema, PIONEER_LIST_CAPS.nodes)),
  customKnowledge: z.nullish(list(knowledgeSchema, PIONEER_LIST_CAPS.nodes)),
  // Refused past 5,000 (the list default) before any entry is parsed; Precog
  // sends at most the 2,500 Pioneer keeps.
  customRelations: z.nullish(list(relationSchema, PIONEER_LIST_CAPS.relations)),
  // Journal entries and absences are rebuilt field by field downstream.
  decisions: z.nullish(list(z.unknown(), PIONEER_LIST_CAPS.decisions)),
  plannedAbsences: z.nullish(list(z.unknown(), PIONEER_LIST_CAPS.absences)),
  // Links only (id, title, register items); rebuilt field by field downstream.
  procedureLinks: z.nullish(list(z.unknown(), PIONEER_LIST_CAPS.procedures)),
});

const pioneerSchema = z.object({
  question: z.nullish(z.string()),
  profile: z.nullish(pioneerProfileSchema),
  today: z.nullish(z.string().check(z.maxLength(40))),
});

interface PioneerRequest {
  question: string;
  profile: PioneerProfileInput;
  today: string | undefined;
}

export function parsePioneerInput(input: unknown): PioneerRequest {
  const data = parse(pioneerSchema, input);
  return {
    question: (data.question ?? "").trim().slice(0, 1500),
    // The schema checked the shapes Pioneer walks; pioneerProfileFrom builds
    // the canonical profile (defaults, caps, journal and absence rebuilds).
    profile: (data.profile ?? {}) as PioneerProfileInput,
    today: data.today ?? undefined,
  };
}
