import { requireObject } from "../request-errors";
import { resolveTemplate } from "./active-template";
import { isBusinessId, MAX_PROFILE_BYTES } from "./profile-input";
import { normalizeProfile, type PracticeProfile } from "./practice-profile";
import { applyAssignmentsToPeople } from "./sod/apply-assignments";
import { buildAssignments, type RoleAssignment } from "./sod/detect";

/** True when two power maps give every person the same name, role and duties. */
function sameAssignments(a: readonly RoleAssignment[], b: readonly RoleAssignment[]): boolean {
  const key = (x: RoleAssignment) =>
    `${x.personId}|${x.personName}|${x.role}|${[...x.entitlements].sort().join(",")}`;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.length === right.length && left.every((k, i) => k === right[i]);
}

/**
 * What an assessment snapshot keeps of a business: everything the
 * assessment reads (the team, process map, register, who holds what, known
 * leave, controls and decisions, industry) and not the workspace's history
 * (saved map versions, saved process blocks, map-health points), which can be
 * many times larger and is not part of the assessment.
 */
export function snapshotSlice(profile: PracticeProfile): Partial<PracticeProfile> {
  const {
    mapVersions: _versions,
    savedProcessBlocks: _blocks,
    mapHealthHistory: _history,
    ...kept
  } = profile;
  return kept;
}

/**
 * A snapshot stores at most what the business itself may save, measured on
 * what is actually stored. The raw input may be larger (an older client sends
 * the whole profile, map versions included); it is only bounded so a request
 * cannot make the server normalise something absurd.
 */
export const MAX_SNAPSHOT_PROFILE_BYTES = MAX_PROFILE_BYTES;
export const MAX_SNAPSHOT_INPUT_BYTES = 4 * MAX_PROFILE_BYTES;

const bytes = (json: string) => new TextEncoder().encode(json).byteLength;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Entries of a stored list that carry the string fields every engine relies
 * on; anything else is dropped. Null when the value is not a list, which
 * means "the template's", as it does for a business.
 */
function entries<T>(value: unknown, required: readonly string[], max: number): T[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .slice(0, max)
    .filter(
      (entry): entry is T =>
        isRecord(entry) && required.every((key) => typeof entry[key] === "string"),
    );
}

function mapLayout(value: unknown): PracticeProfile["mapLayout"] {
  if (!isRecord(value)) return {};
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, point] of Object.entries(value).slice(0, 2_000)) {
    if (!isRecord(point)) continue;
    const { x, y } = point;
    if (
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y)
    ) {
      out[id.slice(0, 120)] = { x, y };
    }
  }
  return out;
}

/**
 * Treat every client-supplied profile as untrusted structured input: only
 * the fields a snapshot keeps are read, each list keeps only well-formed
 * entries, and `normalizeProfile` bounds the rest. Snapshots used to keep
 * only the name, staff, risk inputs, controls and decisions, so restoring
 * one turned an owner's business into the dental sample.
 *
 * `complete` is false for a snapshot saved before that change (no industry
 * stored): it cannot say which business or team it described.
 */
export function sanitizeSnapshotProfile(value: unknown): {
  profile: PracticeProfile;
  json: string;
  complete: boolean;
} {
  if (!isRecord(value)) throw new Error("Invalid practice profile");
  if (bytes(JSON.stringify(value)) > MAX_SNAPSHOT_INPUT_BYTES) {
    throw new Error("Practice profile is too large");
  }

  const candidate: Partial<PracticeProfile> = {
    practiceName: typeof value.practiceName === "string" ? value.practiceName : undefined,
    industry: value.industry as PracticeProfile["industry"],
    staff: isRecord(value.staff) ? (value.staff as unknown as PracticeProfile["staff"]) : undefined,
    riskVariables: isRecord(value.riskVariables)
      ? (value.riskVariables as unknown as PracticeProfile["riskVariables"])
      : undefined,
    dualRelease:
      isRecord(value.dualRelease) &&
      Array.isArray(value.dualRelease.rules) &&
      Array.isArray(value.dualRelease.exceptions)
        ? (value.dualRelease as unknown as PracticeProfile["dualRelease"])
        : undefined,
    decisions: Array.isArray(value.decisions) ? value.decisions : undefined,
    customPeople: entries(value.customPeople, ["id", "name", "role"], 1_000),
    customProcesses: entries(value.customProcesses, ["id", "name"], 500),
    customKnowledge: entries(value.customKnowledge, ["id", "name"], 2_000),
    customRelations: entries(value.customRelations, ["personId", "knowledgeId", "level"], 20_000),
    plannedAbsences: Array.isArray(value.plannedAbsences)
      ? (value.plannedAbsences as PracticeProfile["plannedAbsences"])
      : undefined,
    mapLayout: mapLayout(value.mapLayout),
    businessId: isBusinessId(value.businessId) ? value.businessId : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
  const profile = normalizeProfile(candidate);
  const json = JSON.stringify(profile);
  if (bytes(json) > MAX_SNAPSHOT_PROFILE_BYTES) throw new Error("Practice profile is too large");
  return { profile, json, complete: typeof value.industry === "string" };
}

/**
 * The business a restore leaves open. A restore replaces the contents of the
 * business open now: it keeps that business's id (it never creates or
 * switches to another business) and its workspace history, and it puts the
 * snapshot's team, map, register, controls and decisions in place. A power
 * map saved beside the profile is written onto the snapshot's people; for a
 * sample snapshot it changes the people only if it changes someone's duties,
 * so the sample stays the sample.
 *
 * Null for a snapshot saved before snapshots kept the business (`complete`
 * false): it cannot say which industry or team it described, and restoring
 * it would put the dental sample in place of the owner's business.
 */
export function restoredProfile(
  snapshot: { profile: PracticeProfile; powerMap?: RoleAssignment[]; profileComplete?: boolean },
  current: PracticeProfile,
): PracticeProfile | null {
  if (snapshot.profileComplete === false) return null;
  const saved = snapshot.profile;
  let customPeople = saved.customPeople ?? null;
  if (snapshot.powerMap) {
    const tpl = resolveTemplate(saved);
    if (customPeople || !sameAssignments(buildAssignments(tpl), snapshot.powerMap)) {
      customPeople = applyAssignmentsToPeople(tpl.people, snapshot.powerMap);
    }
  }
  return {
    ...saved,
    customPeople,
    businessId: current.businessId,
    onboardingComplete: true,
    mapVersions: current.mapVersions,
    savedProcessBlocks: current.savedProcessBlocks,
    mapHealthHistory: current.mapHealthHistory,
  };
}

/**
 * Request input for reading or deleting one snapshot. Missing or non-object
 * input is a 400 ("Invalid request"), not a TypeError from reading `.id`.
 */
export function parseSnapshotId(input: unknown): { id: string } {
  return { id: String(requireObject(input).id ?? "").slice(0, 80) };
}

/** Request input for saving a snapshot; the parts are checked by the handler. */
export function parseSnapshotCreate(input: unknown): {
  title: string;
  profile: unknown;
  powerMap: unknown;
  valueCase: unknown;
  valueEvidence: unknown;
} {
  const raw = requireObject(input);
  return {
    title: String(raw.title ?? "")
      .trim()
      .slice(0, 120),
    profile: raw.profile,
    powerMap: raw.powerMap,
    valueCase: raw.valueCase,
    valueEvidence: raw.valueEvidence,
  };
}
