import { resolveTemplate } from "../active-template";
import { mapAssessed } from "../builder/map-state";
import { printedBusinessName } from "../business-lifecycle";
import { trackRegisterFreshness } from "../continuity/register-state";
import type { ContinuityCommitment } from "../decisions/follow-through";
import { normalizeProfile, type PracticeProfile } from "../practice-profile";
import { isMapCustomized } from "../profile-actions";
import { mergeProfile } from "../profile-merge";
import { SCORING_VERSION } from "../scoring/weights";
import type { Person } from "../types";
import { buildControlReportModel, type ControlReportModel } from "./build-control-report";
import { NO_FINDING_RESPONSES, type FindingResponses } from "./finding-responses";

/**
 * The report model as a locked version stores it: plain JSON, so it reads
 * back from the database exactly as it was built. The non-JSON values in the
 * model, the `committed` and `partialCoverage` maps, are stored as entries.
 */
export type StoredReportModel = Omit<
  ControlReportModel,
  "committed" | "partialCoverage" | "responses"
> & {
  committed: Array<[string, ContinuityCommitment]>;
  /**
   * Absent in a model stored before the report read partial dual-release
   * coverage. Such a model revives with an empty map, so it prints the
   * counts and statuses it was locked with.
   */
  partialCoverage?: Array<[string, number]>;
  /**
   * Absent in a model stored under layouts 1 and 2, which print no responses.
   * Such a model revives with none.
   */
  responses?: FindingResponses;
  /**
   * Objects the model holds in more than one place (a register item, a
   * process), each stored once; every other place holds `{ "$ref": index }`.
   * Absent in a model stored before Precog shared them, which holds every
   * object in full. Only `reviveReportModel` reads a stored model, and it
   * puts them back.
   */
  refs?: StoredJson[];
};

/** A JSON value, as a stored model's shared objects are. */
type StoredJson = string | number | boolean | null | StoredJson[] | { [key: string]: StoredJson };

/**
 * What a locked version keeps besides its profile. `model` is null when the
 * build failed at lock time; the versions still record that the lock tried.
 * `tooLarge` is set when the model is past REPORT_MODEL_MAX_CHARS: the lock
 * refuses then (firm/reports.ts), so no version locks without its figures
 * for its size.
 */
export interface FrozenReport {
  scoringVersion: string;
  layoutVersion: number;
  model: StoredReportModel | null;
  tooLarge?: true;
}

/**
 * The shape of `ControlReportModel` that `ControlReport` prints today. Raise
 * it whenever a field of the model is added, renamed or changes meaning: a
 * stored model with another layout version recalculates instead of printing,
 * unless `ControlReport` still prints that layout with its own labels.
 *
 * Layout 3: the decision on each duty-conflict finding and the findings
 * judged not valid, plain decision labels, no assumed loss column.
 * Layout 2: map completeness (no heat part) and residual rows counted by band.
 * Layout 1: map health score (with heat) and the average residual score.
 */
export const REPORT_LAYOUT_VERSION = 3;

/** The layouts `ControlReport` prints from stored figures, each with its own labels. */
export const PRINTED_LAYOUT_VERSIONS: readonly number[] = [1, 2, REPORT_LAYOUT_VERSION];

/**
 * The largest stored model, in characters of JSON, after `slimReportModel`
 * and with repeated objects stored once. The samples store about 260 to 300
 * KB, and an own team of 20 to 150 people with 120 register items and 100
 * procedures 640 to 760 KB (src/test/large-business.ts). A lock past this cap
 * is refused with a message (firm/reports.ts).
 */
export const REPORT_MODEL_MAX_CHARS = 1_000_000;

/** How many ranked stand-in suggestions a stored model keeps per register item; the report prints the first. */
export const STORED_BACKUPS_PER_ITEM = 3;

/** A person as a stored model keeps them: the fields the report prints. */
type StoredPerson = Pick<Person, "id" | "name" | "role" | "active">;

/**
 * The model as a locked version stores it. Every person on the team, which
 * the coverage rows, cards and plans repeat in full, keeps only the fields
 * the report prints (id, name, job title, active), and each register item
 * keeps its first STORED_BACKUPS_PER_ITEM suggested stand-ins. The report
 * prints the same text from it as from the full model. Objects the model
 * shares stay shared.
 */
export function slimReportModel(model: ControlReportModel): ControlReportModel {
  const team = new Set<unknown>(model.continuity.people.map((load) => load.person));
  const copies = new Map<object, unknown>();
  const slim = (value: unknown, key?: string): unknown => {
    if (!value || typeof value !== "object") return value;
    const known = copies.get(value);
    if (known !== undefined) return known;
    let copy: unknown;
    if (team.has(value)) {
      const person = value as Person;
      const stored: StoredPerson = {
        id: person.id,
        name: person.name,
        role: person.role,
        active: person.active,
      };
      copy = stored;
    } else if (value instanceof Map) {
      copy = new Map([...value].map(([k, v]) => [k, slim(v)]));
    } else if (Array.isArray(value)) {
      const kept = key === "suggestedBackups" ? value.slice(0, STORED_BACKUPS_PER_ITEM) : value;
      copy = kept.map((entry) => slim(entry));
    } else {
      copy = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, slim(v, k)]));
    }
    copies.set(value, copy);
    return copy;
  };
  return slim(model) as ControlReportModel;
}

/** A stored model's place-holder for an object kept once in `refs`. */
interface SharedRef {
  $ref: number;
}

function isSharedRef(value: unknown): value is SharedRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "$ref" && Number.isInteger((value as SharedRef).$ref);
}

/** `root` with every object it reaches more than once stored once in `refs`. */
function shareRepeatedObjects<T extends object>(root: T): T & { refs?: StoredJson[] } {
  const seen = new Map<object, number>();
  const count = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const times = seen.get(value) ?? 0;
    seen.set(value, times + 1);
    if (times === 0) for (const entry of Object.values(value)) count(entry);
  };
  count(root);
  const refs: StoredJson[] = [];
  const index = new Map<object, number>();
  const encode = (value: unknown, inline = false): unknown => {
    if (!value || typeof value !== "object") return value;
    if (!inline && !Array.isArray(value) && (seen.get(value) ?? 0) > 1) {
      let at = index.get(value);
      if (at === undefined) {
        at = refs.length;
        index.set(value, at);
        refs.push(null);
        refs[at] = encode(value, true) as StoredJson;
      }
      const ref: SharedRef = { $ref: at };
      return ref;
    }
    if (Array.isArray(value)) return value.map((entry) => encode(entry));
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  };
  const body = encode(root, true) as T;
  return refs.length ? { ...body, refs } : body;
}

/** The model with each `{ "$ref": index }` replaced by the object it stands for. */
function restoreRepeatedObjects(stored: StoredReportModel): StoredReportModel {
  const { refs, ...body } = stored;
  if (!refs?.length) return body;
  const restored = new Map<number, unknown>();
  const decode = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    if (isSharedRef(value)) {
      if (!restored.has(value.$ref)) restored.set(value.$ref, decode(refs[value.$ref]));
      return restored.get(value.$ref);
    }
    if (Array.isArray(value)) return value.map(decode);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  };
  return decode(body) as StoredReportModel;
}

export function serializeReportModel(model: ControlReportModel): StoredReportModel {
  return shareRepeatedObjects({
    ...model,
    committed: [...model.committed.entries()],
    partialCoverage: [...model.partialCoverage.entries()],
  });
}

/**
 * The model a stored one prints. It reads every stored shape: a model with
 * repeated objects stored once, and one stored before that with every object
 * (and every person, with all their fields) in full.
 */
export function reviveReportModel(stored: StoredReportModel): ControlReportModel {
  const model = restoreRepeatedObjects(stored);
  return {
    ...model,
    committed: new Map(model.committed),
    partialCoverage: new Map(model.partialCoverage ?? []),
    responses: model.responses ?? NO_FINDING_RESPONSES,
  };
}

/**
 * The model the report page builds for a profile, with the same inputs it
 * derives under the read-only provider: normalised, its template, and the
 * map and register flags.
 */
export function buildReportModelForProfile(
  profile: PracticeProfile,
  today: string,
): ControlReportModel {
  const frozen = normalizeProfile(profile);
  const tpl = resolveTemplate(frozen);
  return buildControlReportModel({
    tpl,
    profile: frozen,
    mapCustomized: isMapCustomized(frozen),
    today,
    trackFreshness: trackRegisterFreshness(frozen, tpl),
    mapReady: mapAssessed(frozen),
    businessName: printedBusinessName(frozen),
  });
}

/**
 * Freezes the figures of a profile as saved on the account, merged as
 * `getReport` merges it, with the responses to each duty-conflict finding,
 * slimmed (`slimReportModel`). Past the cap the model is null and `tooLarge`
 * is set, and the lock refuses. The model is null when it fails to build;
 * the version then locks without it and recalculates when opened.
 */
export function freezeReport(
  raw: unknown,
  today: string,
  build: (
    profile: PracticeProfile,
    today: string,
  ) => ControlReportModel = buildReportModelForProfile,
): FrozenReport {
  const versions = { scoringVersion: SCORING_VERSION, layoutVersion: REPORT_LAYOUT_VERSION };
  try {
    const stored = (raw ?? {}) as PracticeProfile;
    const profile = mergeProfile(
      { profile: stored, industry: stored.industry ?? "", name: stored.practiceName ?? "" },
      today,
    );
    const model = serializeReportModel(slimReportModel(build(profile, today)));
    if (JSON.stringify(model).length > REPORT_MODEL_MAX_CHARS) {
      return { ...versions, model: null, tooLarge: true };
    }
    return { ...versions, model };
  } catch (err) {
    console.error("[report] could not store the locked figures", err);
    return { ...versions, model: null };
  }
}

/** Why a locked version prints recalculated figures, or null when it prints stored ones. */
export type RecalculationReason = "before-stored" | "not-stored" | "other-layout";

/**
 * The stored model a locked version prints, or why it recalculates. `frozen`
 * is null for a version locked before Precog stored figures.
 */
export function lockedFigures(
  frozen: Pick<FrozenReport, "layoutVersion" | "model"> | null,
): { model: StoredReportModel; layoutVersion: number } | { reason: RecalculationReason } {
  if (!frozen) return { reason: "before-stored" };
  if (!frozen.model) return { reason: "not-stored" };
  if (!PRINTED_LAYOUT_VERSIONS.includes(frozen.layoutVersion)) return { reason: "other-layout" };
  return { model: frozen.model, layoutVersion: frozen.layoutVersion };
}

const RECALCULATION_REASON: Record<RecalculationReason, string> = {
  "before-stored": "This version was locked before Precog stored its figures.",
  "not-stored": "Precog did not store this version's figures when it was locked.",
  "other-layout": "Precog stored this version's figures for an earlier report layout.",
};

/** The note a locked version prints over recalculated figures. */
export function recalculationNote(reason: RecalculationReason, day: string): string {
  return `Figures recalculated with scoring ${SCORING_VERSION} on ${day}. ${RECALCULATION_REASON[reason]}`;
}
