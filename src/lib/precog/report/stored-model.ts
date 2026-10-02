import { resolveTemplate } from "../active-template";
import { mapAssessed } from "../builder/map-state";
import { printedBusinessName } from "../business-lifecycle";
import { trackRegisterFreshness } from "../continuity/register-state";
import type { ContinuityCommitment } from "../decisions/follow-through";
import { normalizeProfile, type PracticeProfile } from "../practice-profile";
import { isMapCustomized } from "../profile-actions";
import { mergeProfile } from "../profile-merge";
import { SCORING_VERSION } from "../scoring/weights";
import { buildControlReportModel, type ControlReportModel } from "./build-control-report";

/**
 * The report model as a locked version stores it: plain JSON, so it reads
 * back from the database exactly as it was built. The non-JSON values in the
 * model, the `committed` and `partialCoverage` maps, are stored as entries.
 */
export type StoredReportModel = Omit<ControlReportModel, "committed" | "partialCoverage"> & {
  committed: Array<[string, ContinuityCommitment]>;
  /**
   * Absent in a model stored before the report read partial dual-release
   * coverage. Such a model revives with an empty map, so it prints the
   * counts and statuses it was locked with.
   */
  partialCoverage?: Array<[string, number]>;
};

/**
 * What a locked version keeps besides its profile. `model` is null when
 * Precog could not store the figures at lock time (past the cap, or the
 * build failed); the versions still record that the lock tried.
 */
export interface FrozenReport {
  scoringVersion: string;
  layoutVersion: number;
  model: StoredReportModel | null;
}

/**
 * The shape of `ControlReportModel` that `ControlReport` prints today. Raise
 * it whenever a field of the model is added, renamed or changes meaning: a
 * stored model with another layout version recalculates instead of printing,
 * unless `ControlReport` still prints that layout with its own labels.
 *
 * Layout 2: map completeness (no heat part) and residual rows counted by band.
 * Layout 1: map health score (with heat) and the average residual score.
 */
export const REPORT_LAYOUT_VERSION = 2;

/** The layouts `ControlReport` prints from stored figures, each with its own labels. */
export const PRINTED_LAYOUT_VERSIONS: readonly number[] = [1, REPORT_LAYOUT_VERSION];

/**
 * The largest stored model, in characters of JSON. The samples build about
 * 400 KB; a model past this cap is not stored and the version recalculates,
 * as one locked before models were stored does.
 */
export const REPORT_MODEL_MAX_CHARS = 1_000_000;

export function serializeReportModel(model: ControlReportModel): StoredReportModel {
  return {
    ...model,
    committed: [...model.committed.entries()],
    partialCoverage: [...model.partialCoverage.entries()],
  };
}

export function reviveReportModel(stored: StoredReportModel): ControlReportModel {
  return {
    ...stored,
    committed: new Map(stored.committed),
    partialCoverage: new Map(stored.partialCoverage ?? []),
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
 * `getReport` merges it. The model is null when it is past the cap or fails
 * to build; the version then locks without it and recalculates when opened.
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
    const model = serializeReportModel(build(profile, today));
    if (JSON.stringify(model).length > REPORT_MODEL_MAX_CHARS) return { ...versions, model: null };
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
