import { resolveTemplate } from "../active-template";
import { mapAssessed } from "../builder/map-state";
import { printedBusinessName } from "../business-lifecycle";
import { trackRegisterFreshness } from "../continuity/register-state";
import type { ContinuityCommitment } from "../decisions/follow-through";
import { normalizeProfile, type PracticeProfile } from "../practice-profile";
import { isMapCustomized } from "../profile-actions";
import { mergeProfile } from "../profile-merge";
import { SCORING_VERSION } from "../scoring/weights";
import type { DetectedConflict, RoleAssignment } from "../sod/detect";
import type { Person } from "../types";
import {
  buildControlReportModel,
  NO_REPORT_EXAMPLES,
  type ControlReportModel,
} from "./build-control-report";
import { NO_FINDING_RESPONSES, type FindingResponses } from "./finding-responses";

/**
 * The report model as a locked version stores it: plain JSON, so it reads
 * back from the database exactly as it was built. The non-JSON values in the
 * model, the `committed` and `partialCoverage` maps, are stored as entries.
 */
export type StoredReportModel = Omit<
  ControlReportModel,
  "committed" | "partialCoverage" | "responses" | "sod" | "benchmark" | "examples"
> & {
  /**
   * Absent in a model stored under layouts 1 to 6, which did not store
   * Precog's examples. Such a model revives with none; those layouts print
   * no example marks anyway.
   */
  examples?: ControlReportModel["examples"];
  /**
   * Absent in a model stored under layouts 1 to 3, which did not store the
   * benchmark. Such a model revives with none, and prints none.
   */
  benchmark?: ControlReportModel["benchmark"];
  /**
   * The duty-conflict findings, packed (`PackedConflicts`). A model stored
   * before Precog packed them holds every finding in full.
   */
  sod: Omit<ControlReportModel["sod"], "conflicts"> & {
    conflicts: DetectedConflict[] | PackedConflicts;
  };
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
 * Layout 7: the header names a map with no processes as "no processes
 * mapped yet", not "custom process map", and counts the processes on an
 * own map still exactly as Precog's example had them; the process map list
 * and the priority stack mark each such process, and each control the owner
 * never confirmed, as Precog's example. The ids of those examples
 * are stored with the model (`examples`). Every printed-text change made after it
 * goes behind `printsLayoutSeven`.
 * Layout 6: the header's team size from the owner's own active people on
 * the map ("12-person practice"), "starter process map (not yet edited)" in
 * place of "sample process map" for an own team, the segregation sentence
 * counted as the executive summary counts it (`openConflictHeadline`), and
 * the residual tile in the residual band words ("Severe on the residual
 * index", "N high · N moderate"). Every printed-text change made after it
 * goes behind `printsLayoutSix`.
 * Layout 5: the monthly checks for the oldest month still open on the
 * report's day, named with their due day; the priority bands in the
 * urgency words ("Fix first", "Fix soon", "Worth doing", "Watch"); each
 * fix-first count named with its own scale ("Fix first on the priority
 * list", "N fix first on the residual index"); and, in the status column,
 * the day a logged decision accepted a finding's risk.
 * Layout 4: the published benchmark the evidence section leads with, stored
 * (`benchmark`), and dual release's covered count without the owner's own
 * pairs, as the executive summary counts them.
 * Layout 3: the decision on each duty-conflict finding and the findings
 * judged not valid, plain decision labels, no assumed loss column.
 * Layout 2: map completeness (no heat part) and residual rows counted by band.
 * Layout 1: map health score (with heat) and the average residual score.
 */
export const REPORT_LAYOUT_VERSION = 7;

/** The layouts `ControlReport` prints from stored figures, each with its own labels. */
export const PRINTED_LAYOUT_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, REPORT_LAYOUT_VERSION];

/**
 * Whether a report printed under `layoutVersion` prints layout 6's text. A
 * live report, and a locked one that recalculates, print the current layout;
 * a version locked under layouts 1 to 5 with stored figures prints what it
 * printed then. A section that changes printed text keeps the old text
 * behind `!printsLayoutSix(layoutVersion)`.
 */
export function printsLayoutSix(layoutVersion: number): boolean {
  return layoutVersion >= 6;
}

/**
 * Whether a report printed under `layoutVersion` prints layout 7's text: the
 * map header that says when no process is mapped, and Precog's example
 * processes and controls marked as such. A version locked under layouts 1
 * to 6 prints what it printed then.
 */
export function printsLayoutSeven(layoutVersion: number): boolean {
  return layoutVersion >= 7;
}

/**
 * The largest stored model, in characters of JSON, after `slimReportModel`
 * and `serializeReportModel`. An own team with 120 register items and 100
 * procedures (src/test/large-business.ts) stores about 400 KB at 250 people,
 * 440 KB at 400 and 600 KB at 1,000, the roster limit; 1,000 people with 300
 * items, 200 procedures and 3,000 duty grants about 960 KB. A lock past this
 * cap is refused with a message that names the team (firm/reports.ts).
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
 * keeps its first STORED_BACKUPS_PER_ITEM suggested stand-ins. Three parts
 * the report never prints are left empty: the duty matrix, the scored
 * scenarios behind the residual counts, and each contingency card's list of
 * everyone still in. The report prints the same text from it as from the
 * full model. Objects the model shares stay shared.
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
  const slimmed = slim(model) as ControlReportModel;
  return {
    ...slimmed,
    // The duty matrix is the same reference table for every business, and
    // the report prints none of it.
    sod: { ...slimmed.sod, matrix: [] },
    // The report prints the residual counts, not the scored scenarios behind them.
    portfolio: { ...slimmed.portfolio, top: [], all: [] },
    // A contingency card prints who is out and what stops, never everyone
    // still in, which is the whole rest of the team on every card.
    cards: slimmed.cards.map((card) => ({ ...card, remaining: [] })),
  };
}

/**
 * The duty-conflict findings as a stored model keeps them. Findings on one
 * rule share their title, explanation, labels and suggested controls, and the
 * team's assignments already name each person, so each rule's first finding
 * is kept once in `rules`, and each finding is a row: the index of its rule,
 * the person's id, its score, and only the fields that differ from what the
 * rule's first finding and the person's assignment give (with `$absent`
 * naming a field the finding lacks). Rows keep the findings' order.
 */
interface PackedConflicts {
  rules: DetectedConflict[];
  rows: Array<[number, string, number] | [number, string, number, ConflictOverrides]>;
}

type ConflictOverrides = Partial<DetectedConflict> & { $absent?: string[] };

/** The finding a row starts from: its rule's first finding, for this person. */
function conflictBase(
  rule: DetectedConflict,
  personId: string,
  score: number,
  people: ReadonlyMap<string, RoleAssignment>,
): DetectedConflict {
  const person = people.get(personId);
  return {
    ...rule,
    id: rule.id.startsWith(`${rule.personId}:`)
      ? `${personId}:${rule.id.slice(rule.personId.length + 1)}`
      : rule.id,
    personId,
    personName: person?.personName ?? rule.personName,
    role: person?.role ?? rule.role,
    score,
  };
}

function packConflicts(
  conflicts: readonly DetectedConflict[],
  assignments: readonly RoleAssignment[],
): PackedConflicts {
  const people = new Map(assignments.map((a) => [a.personId, a]));
  const rules: DetectedConflict[] = [];
  const ruleIndex = new Map<string, number>();
  const rows = conflicts.map((conflict): PackedConflicts["rows"][number] => {
    let at = ruleIndex.get(conflict.ruleId);
    if (at === undefined) {
      at = rules.length;
      ruleIndex.set(conflict.ruleId, at);
      rules.push(conflict);
    }
    const base = conflictBase(rules[at], conflict.personId, conflict.score, people);
    const overrides: Record<string, unknown> = {};
    const absent: string[] = [];
    const actual = conflict as unknown as Record<string, unknown>;
    const expected = base as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (actual[key] === undefined) {
        if (expected[key] !== undefined) absent.push(key);
      } else if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
        overrides[key] = actual[key];
      }
    }
    if (absent.length) overrides.$absent = absent;
    return Object.keys(overrides).length
      ? [at, conflict.personId, conflict.score, overrides as ConflictOverrides]
      : [at, conflict.personId, conflict.score];
  });
  return { rules, rows };
}

function unpackConflicts(
  packed: PackedConflicts,
  assignments: readonly RoleAssignment[],
): DetectedConflict[] {
  const people = new Map(assignments.map((a) => [a.personId, a]));
  return packed.rows.map(([at, personId, score, overrides]) => {
    const base = conflictBase(packed.rules[at], personId, score, people);
    if (!overrides) return base;
    const { $absent, ...changed } = overrides;
    const conflict: Record<string, unknown> = { ...base, ...changed };
    for (const key of $absent ?? []) delete conflict[key];
    return conflict as unknown as DetectedConflict;
  });
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

/**
 * A stored model's table: a list of objects with the same fields, kept as the
 * field names once and one row of values per object. A row holds
 * `{ "$none": 1 }` (`NO_VALUE`) for a field its object lacks.
 */
interface StoredColumns {
  $cols: string[];
  $rows: StoredJson[][];
}

const NO_VALUE = { $none: 1 } as const;

function isNoValue(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "$none";
}

function isColumns(value: unknown): value is StoredColumns {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  // In either order: the database (jsonb) keeps an object's keys in its own order.
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    keys.includes("$cols") &&
    keys.includes("$rows") &&
    Array.isArray((value as StoredColumns).$cols) &&
    Array.isArray((value as StoredColumns).$rows)
  );
}

/**
 * The fields of the entries of `list`, in the order every entry lists them.
 * Null when an entry is not an object, lists two fields in another order, or
 * the table would not be shorter than the list: the field names a table
 * saves must outweigh the `NO_VALUE` it writes for each missing field.
 */
function sharedFields(list: readonly unknown[]): string[] | null {
  const fields: string[] = [];
  let present = 0;
  let saved = 0;
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    let at = -1;
    for (const [key, value] of Object.entries(entry)) {
      if (value === undefined) continue;
      present += 1;
      // `"key":` against the `,` that separates values in a row.
      saved += key.length + 2;
      const found = fields.indexOf(key, at + 1);
      if (found >= 0) {
        at = found;
      } else if (fields.includes(key)) {
        return null;
      } else {
        // A field first seen here goes right after the one before it.
        fields.splice(at + 1, 0, key);
        at += 1;
      }
    }
  }
  if (!fields.length) return null;
  const missing = fields.length * list.length - present;
  const cost =
    missing * (JSON.stringify(NO_VALUE).length + 1) +
    fields.reduce((n, field) => n + field.length + 3, 0) +
    list.length * 2;
  return saved > cost ? fields : null;
}

/** `value` with every list of two or more objects kept as a table (`StoredColumns`). */
function storeAsColumns(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const fields = value.length > 1 ? sharedFields(value) : null;
    if (!fields) return value.map(storeAsColumns);
    const table: StoredColumns = {
      $cols: fields,
      $rows: value.map((entry: Record<string, unknown>) =>
        fields.map((field) =>
          entry[field] === undefined ? NO_VALUE : (storeAsColumns(entry[field]) as StoredJson),
        ),
      ),
    };
    return table;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, storeAsColumns(v)]),
  );
}

/** `value` with each table (`StoredColumns`) back as its list of objects. */
function restoreColumns(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (isColumns(value)) {
    return value.$rows.map((row) =>
      Object.fromEntries(
        value.$cols.flatMap((field, i) =>
          isNoValue(row[i]) ? [] : [[field, restoreColumns(row[i])] as const],
        ),
      ),
    );
  }
  if (Array.isArray(value)) return value.map(restoreColumns);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restoreColumns(v)]));
}

/**
 * The model as a locked version stores it: the duty-conflict findings packed
 * (`PackedConflicts`), each repeated object once (`refs`), and each list of
 * like objects as a table (`StoredColumns`).
 */
export function serializeReportModel(model: ControlReportModel): StoredReportModel {
  return storeAsColumns(
    shareRepeatedObjects({
      ...model,
      sod: { ...model.sod, conflicts: packConflicts(model.sod.conflicts, model.sod.assignments) },
      committed: [...model.committed.entries()],
      partialCoverage: [...model.partialCoverage.entries()],
    }),
  ) as StoredReportModel;
}

/**
 * The model a stored one prints. It reads every stored shape: a model with
 * packed duty-conflict findings and tables, one stored before that with each
 * finding and list in full, one with repeated objects stored once, and one
 * stored before that with every object (and every person, with all their
 * fields) in full.
 */
export function reviveReportModel(stored: StoredReportModel): ControlReportModel {
  const model = restoreRepeatedObjects(restoreColumns(stored) as StoredReportModel);
  const { conflicts } = model.sod;
  return {
    ...model,
    sod: {
      ...model.sod,
      conflicts: Array.isArray(conflicts)
        ? conflicts
        : unpackConflicts(conflicts, model.sod.assignments),
    },
    committed: new Map(model.committed),
    partialCoverage: new Map(model.partialCoverage ?? []),
    responses: model.responses ?? NO_FINDING_RESPONSES,
    benchmark: model.benchmark ?? null,
    examples: model.examples ?? NO_REPORT_EXAMPLES,
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
