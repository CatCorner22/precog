import { isCalendarDate } from "../dates";
import { isIndustryId } from "../industry";
import type { ProcessCadence } from "../types";
import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import type {
  Place,
  PlaceKind,
  Procedure,
  ProcedureChange,
  ProcedureProof,
  ProcedureStep,
} from "./types";

/**
 * Limits that keep procedures inside the stored business (2 MB in all, shared
 * with the map, register and journal). A typical procedure of ten steps is
 * about 2 KB, so the byte budget holds well over a hundred of them.
 */
export const PROCEDURE_LIMITS = {
  procedures: 120,
  places: 100,
  steps: 25,
  stepText: 300,
  caution: 160,
  prerequisites: 10,
  prerequisite: 160,
  title: 120,
  module: 120,
  url: 500,
  purpose: 300,
  trigger: 160,
  placeName: 80,
  placeNote: 200,
  changelog: 10,
  changeSummary: 120,
  links: 50,
  imagesPerStep: 6,
  proofs: 20,
  proofNote: 200,
  duties: 16,
  backups: 10,
  /** Serialized size of every procedure together. */
  bytes: 700 * 1024,
} as const;

/** Review interval when none is set, and the range the owner may choose from. */
export const DEFAULT_REVIEW_DAYS = 180;
export const MIN_REVIEW_DAYS = 30;
export const MAX_REVIEW_DAYS = 365;

/** The id the image store gives a picture. */
export const IMAGE_ID = /^img_[a-z0-9_]{1,60}$/;

const CADENCES: readonly ProcessCadence[] = [
  "continuous",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
  "ad-hoc",
];

/** Stored places, each typed and bounded; entries without a name are dropped. */
export function normalizePlaces(value: unknown): Place[] {
  if (!Array.isArray(value)) return [];
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (out.length >= PROCEDURE_LIMITS.places) break;
    const raw = record(entry);
    const id = text(raw.id, 60);
    const name = text(raw.name, PROCEDURE_LIMITS.placeName);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const url = webUrl(raw.url);
    const note = text(raw.note, PROCEDURE_LIMITS.placeNote);
    out.push({
      id,
      kind: placeKind(raw.kind),
      name,
      ...(url ? { url } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out;
}

/**
 * Stored procedures, each typed and bounded. `today` bounds the calendar days
 * (a verification cannot be dated in the future). Procedures past the byte
 * budget are dropped from the end, so an oversized copy still opens.
 */
export function normalizeProcedures(value: unknown, today: string): Procedure[] {
  if (!Array.isArray(value)) return [];
  const out: Procedure[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const entry of value) {
    if (out.length >= PROCEDURE_LIMITS.procedures) break;
    const procedure = normalizeProcedure(entry, today);
    if (!procedure || seen.has(procedure.id)) continue;
    const size = jsonBytes(procedure);
    if (bytes + size > PROCEDURE_LIMITS.bytes) break;
    bytes += size;
    seen.add(procedure.id);
    out.push(procedure);
  }
  return out;
}

/** Serialized size of a list of procedures, as the byte budget counts it. */
export function proceduresBytes(procedures: readonly Procedure[]): number {
  return procedures.reduce((sum, p) => sum + jsonBytes(p), 0);
}

const utf8 = new TextEncoder();

/**
 * UTF-8 bytes of a value as JSON, the unit the 2 MB profile cap is measured
 * in (profile-input.ts); counting characters would let text in other scripts
 * take up to three times the budget.
 */
function jsonBytes(value: unknown): number {
  return utf8.encode(JSON.stringify(value)).length;
}

/** One stored procedure made safe, or null when it has no id, title or known industry. */
export function normalizeProcedure(value: unknown, today: string): Procedure | null {
  const raw = record(value);
  const id = text(raw.id, 60);
  const title = text(raw.title, PROCEDURE_LIMITS.title);
  if (!id || !title || !isIndustryId(raw.industry)) return null;
  const createdAt = day(raw.createdAt, today) ?? today;
  const updatedAt = day(raw.updatedAt, today) ?? createdAt;
  const verifiedAt = day(raw.verifiedAt, today);
  const lastVerifiedAt = day(raw.lastVerifiedAt, today) ?? verifiedAt;
  const verifiedBy = verifiedAt ? text(raw.verifiedBy, 120) : "";
  const verifiedByAccountId = verifiedAt ? text(raw.verifiedByAccountId, 120) : "";
  const verifiedByAccountName = verifiedByAccountId ? text(raw.verifiedByAccountName, 120) : "";
  const optional = {
    libraryId: text(raw.libraryId, 60),
    placeId: text(raw.placeId, 60),
    module: text(raw.module, PROCEDURE_LIMITS.module),
    url: webUrl(raw.url),
    purpose: text(raw.purpose, PROCEDURE_LIMITS.purpose),
    trigger: text(raw.trigger, PROCEDURE_LIMITS.trigger),
    ownerPersonId: text(raw.ownerPersonId, 120),
    reviewerPersonId: text(raw.reviewerPersonId, 120),
  };
  return {
    id,
    industry: raw.industry,
    title,
    ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v)),
    ...(CADENCES.includes(raw.cadence as ProcessCadence)
      ? { cadence: raw.cadence as ProcessCadence }
      : {}),
    prerequisites: texts(
      raw.prerequisites,
      PROCEDURE_LIMITS.prerequisites,
      PROCEDURE_LIMITS.prerequisite,
    ),
    steps: normalizeSteps(raw.steps),
    knowledgeIds: ids(raw.knowledgeIds, PROCEDURE_LIMITS.links),
    processIds: ids(raw.processIds, PROCEDURE_LIMITS.links),
    ...(dutyIds(raw.dutyIds).length ? { dutyIds: dutyIds(raw.dutyIds) } : {}),
    backupPersonIds: ids(raw.backupPersonIds, PROCEDURE_LIMITS.backups).filter(
      (personId) => personId !== optional.ownerPersonId,
    ),
    reviewEveryDays: reviewDays(raw.reviewEveryDays),
    ...(verifiedAt ? { verifiedAt } : {}),
    ...(verifiedAt && verifiedBy ? { verifiedBy } : {}),
    ...(verifiedByAccountId ? { verifiedByAccountId } : {}),
    ...(verifiedByAccountName ? { verifiedByAccountName } : {}),
    ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
    version:
      Number.isInteger(raw.version) && (raw.version as number) >= 1 ? (raw.version as number) : 1,
    changelog: normalizeChangelog(raw.changelog, today),
    proofs: normalizeProofs(raw.proofs, today),
    createdAt,
    updatedAt: updatedAt < createdAt ? createdAt : updatedAt,
  };
}

/** A review interval within the allowed range, or the default. */
export function reviewDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_REVIEW_DAYS;
  return Math.min(MAX_REVIEW_DAYS, Math.max(MIN_REVIEW_DAYS, Math.round(value)));
}

/** An http or https address, or "" for anything else (javascript:, data:, a bare word). */
export function webUrl(value: unknown): string {
  const raw = text(value, PROCEDURE_LIMITS.url);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeSteps(value: unknown): ProcedureStep[] {
  if (!Array.isArray(value)) return [];
  const out: ProcedureStep[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (out.length >= PROCEDURE_LIMITS.steps) break;
    const raw = record(entry);
    const id = text(raw.id, 60);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const caution = text(raw.caution, PROCEDURE_LIMITS.caution);
    const imageIds = ids(raw.imageIds, PROCEDURE_LIMITS.imagesPerStep).filter((v) =>
      IMAGE_ID.test(v),
    );
    out.push({
      id,
      text: typeof raw.text === "string" ? raw.text.slice(0, PROCEDURE_LIMITS.stepText) : "",
      ...(caution ? { caution } : {}),
      ...(imageIds.length ? { imageIds } : {}),
      ...(raw.requiresPhoto === true ? { requiresPhoto: true as const } : {}),
      ...(raw.aiDrafted === true ? { aiDrafted: true as const } : {}),
      ...(raw.suggested === true ? { suggested: true as const } : {}),
    });
  }
  return out;
}

function normalizeChangelog(value: unknown, today: string): ProcedureChange[] {
  if (!Array.isArray(value)) return [];
  const out: ProcedureChange[] = [];
  for (const entry of value) {
    if (out.length >= PROCEDURE_LIMITS.changelog) break;
    const raw = record(entry);
    const on = day(raw.on, today);
    const summary = text(raw.summary, PROCEDURE_LIMITS.changeSummary);
    if (!on || !summary || !Number.isInteger(raw.version)) continue;
    out.push({ version: raw.version as number, on, summary });
  }
  return out;
}

const DUTY_IDS = new Set<string>(ENTITLEMENTS.map((e) => e.id));

function dutyIds(value: unknown): EntitlementId[] {
  return ids(value, PROCEDURE_LIMITS.duties).filter((id): id is EntitlementId => DUTY_IDS.has(id));
}

function normalizeProofs(value: unknown, today: string): ProcedureProof[] {
  if (!Array.isArray(value)) return [];
  const out: ProcedureProof[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (out.length >= PROCEDURE_LIMITS.proofs) break;
    const raw = record(entry);
    const id = text(raw.id, 60);
    const personId = text(raw.personId, 120);
    const on = day(raw.on, today);
    if (!id || !personId || !on || seen.has(id)) continue;
    seen.add(id);
    const note = text(raw.note, PROCEDURE_LIMITS.proofNote);
    out.push({ id, personId, on, alone: raw.alone === true, ...(note ? { note } : {}) });
  }
  return out;
}

function placeKind(value: unknown): PlaceKind {
  return value === "physical" ? "physical" : "software";
}

function day(value: unknown, today: string): string | undefined {
  return typeof value === "string" && isCalendarDate(value, today) ? value : undefined;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function texts(value: unknown, count: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => text(v, max))
    .filter(Boolean)
    .slice(0, count);
}

function ids(value: unknown, count: number): string[] {
  return [...new Set(texts(value, count * 2, 120))].slice(0, count);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
