import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { normalizeProfile, type PracticeProfile } from "./practice-profile";
import { normalizeRoleAssignments } from "./sod/model-io";
import type { RoleAssignment } from "./sod/detect";
import { normalizeValueCase, type ValueCaseInputs } from "./value-case";
import { normalizeValueEvidence, type ValueEvidence } from "./value-evidence";

export const ASSESSMENT_MODEL_VERSION = "precog-2026.09";
export const KNOWLEDGE_CORPUS_VERSION = "controls-2026.09";
import { MAX_SNAPSHOTS_PER_USER, enforceSnapshotRetention } from "./snapshot-retention";
const MAX_PROFILE_BYTES = 128 * 1024;
const MAX_POWER_MAP_BYTES = 256 * 1024;

export interface AssessmentSnapshotSummary {
  id: string;
  title: string;
  practiceName: string;
  modelVersion: string;
  corpusVersion: string;
  createdAt: string;
  includesPowerMap: boolean;
  includesValueProof: boolean;
}

export interface AssessmentSnapshot extends AssessmentSnapshotSummary {
  profile: PracticeProfile;
  powerMap?: RoleAssignment[];
  valueCase?: ValueCaseInputs;
  valueEvidence?: ValueEvidence[];
}

type SnapshotRow = {
  id: string;
  title: string;
  practice_name: string;
  model_version: string;
  corpus_version: string;
  created_at: string | Date;
  profile_json?: PracticeProfile | string;
  power_map_json?: unknown;
  value_case_json?: unknown;
  value_evidence_json?: unknown;
};

function summary(row: SnapshotRow): AssessmentSnapshotSummary {
  return {
    id: row.id,
    title: row.title,
    practiceName: row.practice_name,
    modelVersion: row.model_version,
    corpusVersion: row.corpus_version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    includesPowerMap: row.power_map_json != null,
    includesValueProof: row.value_case_json != null || row.value_evidence_json != null,
  };
}

function sanitizeValueProof(valueCase: unknown, evidence: unknown) {
  if (valueCase == null && evidence == null) return {};
  const raw = JSON.stringify({ valueCase, evidence });
  if (new TextEncoder().encode(raw).byteLength > 128 * 1024)
    throw new Error("Value proof is too large");
  const normalizedCase =
    valueCase && typeof valueCase === "object"
      ? normalizeValueCase(valueCase as Partial<ValueCaseInputs>)
      : undefined;
  const normalizedEvidence = evidence == null ? undefined : normalizeValueEvidence(evidence);
  return {
    valueCase: normalizedCase,
    valueEvidence: normalizedEvidence,
    caseJson: normalizedCase ? JSON.stringify(normalizedCase) : undefined,
    evidenceJson: normalizedEvidence ? JSON.stringify(normalizedEvidence) : undefined,
  };
}

function sanitizePowerMap(value: unknown): { assignments?: RoleAssignment[]; json?: string } {
  if (value == null) return {};
  const raw = JSON.stringify(value);
  if (new TextEncoder().encode(raw).byteLength > MAX_POWER_MAP_BYTES)
    throw new Error("Power map is too large");
  const assignments = normalizeRoleAssignments(value);
  if (!assignments) throw new Error("Invalid power map");
  return { assignments, json: JSON.stringify(assignments) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Treat every client-supplied profile as untrusted structured input. */
function sanitizeProfile(value: unknown): { profile: PracticeProfile; json: string } {
  if (!isRecord(value)) throw new Error("Invalid practice profile");
  const rawJson = JSON.stringify(value);
  if (new TextEncoder().encode(rawJson).byteLength > MAX_PROFILE_BYTES) {
    throw new Error("Practice profile is too large");
  }

  // Allow-list top-level fields before normalization so unknown input is never
  // persisted and malformed nested containers cannot reach merge functions.
  const candidate: Partial<PracticeProfile> = {
    practiceName: typeof value.practiceName === "string" ? value.practiceName : undefined,
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
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
  const profile = normalizeProfile(candidate);
  const json = JSON.stringify(profile);
  if (new TextEncoder().encode(json).byteLength > MAX_PROFILE_BYTES) {
    throw new Error("Practice profile is too large");
  }
  return { profile, json };
}

export const listAssessmentSnapshots = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AssessmentSnapshotSummary[]> => {
    const sql = await getSql();
    const rows = await sql.query<SnapshotRow>(
      `select id, title, practice_name, model_version, corpus_version, created_at
              , power_map_json, value_case_json, value_evidence_json from assessment_snapshots where user_id = $1
       order by created_at desc limit 50`,
      [context.userId],
    );
    return rows.map(summary);
  });

export const createAssessmentSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      title: string;
      profile: unknown;
      powerMap?: unknown;
      valueCase?: unknown;
      valueEvidence?: unknown;
    }) => ({
      title: String(input.title ?? "")
        .trim()
        .slice(0, 120),
      profile: input.profile,
      powerMap: input.powerMap,
      valueCase: input.valueCase,
      valueEvidence: input.valueEvidence,
    }),
  )
  .handler(async ({ data, context }): Promise<AssessmentSnapshotSummary> => {
    if (!data.title) throw new Error("Snapshot title is required");
    const { profile, json } = sanitizeProfile(data.profile);
    const powerMap = sanitizePowerMap(data.powerMap);
    const valueProof = sanitizeValueProof(data.valueCase, data.valueEvidence);
    if (!profile.practiceName) throw new Error("Practice profile is required");

    const id = `snap_${crypto.randomUUID()}`;
    const sql = await getSql();
    const counts = await sql.query<{ count: string | number }>(
      `select count(*) as count from assessment_snapshots where user_id = $1`,
      [context.userId],
    );
    if (Number(counts[0]?.count ?? 0) >= MAX_SNAPSHOTS_PER_USER) {
      throw new Error(
        `Snapshot limit reached (${MAX_SNAPSHOTS_PER_USER}). Delete an older snapshot first.`,
      );
    }
    const rows = await sql.query<SnapshotRow>(
      `insert into assessment_snapshots
        (id, user_id, title, practice_name, profile_json, power_map_json, value_case_json, value_evidence_json, model_version, corpus_version)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
       returning id, title, practice_name, model_version, corpus_version, created_at, power_map_json, value_case_json, value_evidence_json`,
      [
        id,
        context.userId,
        data.title,
        profile.practiceName.slice(0, 80),
        json,
        powerMap.json ?? null,
        valueProof.caseJson ?? null,
        valueProof.evidenceJson ?? null,
        ASSESSMENT_MODEL_VERSION,
        KNOWLEDGE_CORPUS_VERSION,
      ],
    );
    // Two saves can pass the count check together; the database keeps the limit either way.
    await enforceSnapshotRetention(sql, context.userId);
    return summary(rows[0]);
  });

export const getAssessmentSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input.id ?? "").slice(0, 80) }))
  .handler(async ({ data, context }): Promise<AssessmentSnapshot | null> => {
    const sql = await getSql();
    const rows = await sql.query<SnapshotRow>(
      `select id, title, practice_name, profile_json, power_map_json, value_case_json, value_evidence_json, model_version, corpus_version, created_at
       from assessment_snapshots where id = $1 and user_id = $2 limit 1`,
      [data.id, context.userId],
    );
    const row = rows[0];
    if (!row) return null;
    const stored =
      typeof row.profile_json === "string" ? JSON.parse(row.profile_json) : row.profile_json;
    const { profile } = sanitizeProfile(stored);
    const powerMap = sanitizePowerMap(row.power_map_json).assignments;
    const valueProof = sanitizeValueProof(row.value_case_json, row.value_evidence_json);
    return {
      ...summary(row),
      profile,
      powerMap,
      valueCase: valueProof.valueCase,
      valueEvidence: valueProof.valueEvidence,
    };
  });

export const deleteAssessmentSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input.id ?? "").slice(0, 80) }))
  .handler(async ({ data, context }): Promise<{ deleted: boolean }> => {
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      `delete from assessment_snapshots where id = $1 and user_id = $2 returning id`,
      [data.id, context.userId],
    );
    return { deleted: rows.length > 0 };
  });
