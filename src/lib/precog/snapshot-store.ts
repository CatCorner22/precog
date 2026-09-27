import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { RequestError } from "@/lib/request-errors";
import { toIsoTimestamp } from "./iso-time";
import type { PracticeProfile } from "./practice-profile";
import { sanitizeSnapshotProfile } from "./snapshot-profile";
import { normalizeRoleAssignments } from "./sod/model-io";
import type { RoleAssignment } from "./sod/detect";
import { normalizeValueCase, type ValueCaseInputs } from "./value-case";
import { normalizeValueEvidence, type ValueEvidence } from "./value-evidence";

/**
 * Assessment snapshots in the database, one account at a time. Kept free of
 * `createServerFn` (see snapshots.ts) so it runs against PGLite in a unit test.
 */
export interface AssessmentSnapshotSummary {
  id: string;
  title: string;
  practiceName: string;
  /** The business the snapshot was taken of; null for one saved without an id. */
  businessId: string | null;
  modelVersion: string;
  corpusVersion: string;
  createdAt: string;
  includesPowerMap: boolean;
  includesValueProof: boolean;
}

export interface AssessmentSnapshot extends AssessmentSnapshotSummary {
  profile: PracticeProfile;
  /** False for a snapshot saved before snapshots kept the business's industry, team and map. */
  profileComplete: boolean;
  powerMap?: RoleAssignment[];
  valueCase?: ValueCaseInputs;
  valueEvidence?: ValueEvidence[];
}

export interface SnapshotInput {
  title: string;
  profile: unknown;
  powerMap?: unknown;
  valueCase?: unknown;
  valueEvidence?: unknown;
}

/** Snapshots one account may keep. */
export const MAX_SNAPSHOTS_PER_ACCOUNT = 50;

/** The account's snapshots, newest first, without their contents. */
export async function listSnapshotSummaries(
  sql: Sql,
  userId: string,
): Promise<AssessmentSnapshotSummary[]> {
  const rows = await sql.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS} from assessment_snapshots where user_id = $1
     order by created_at desc limit $2`,
    [userId, MAX_SNAPSHOTS_PER_ACCOUNT],
  );
  return rows.map(summary);
}

/**
 * Saves one snapshot. Bad input is refused with a 4xx status, and so is a
 * save past the limit: the count and the insert run under a lock on the
 * account, so two saves at once cannot both pass the count, and no older
 * snapshot is ever dropped to make room.
 */
export async function insertSnapshot(
  sql: Sql,
  userId: string,
  input: SnapshotInput,
): Promise<AssessmentSnapshotSummary> {
  if (!input.title) throw new RequestError(400, "Snapshot title is required");
  const { profile, json } = sanitizeSnapshotProfile(input.profile);
  if (!profile.practiceName) throw new RequestError(400, "The business needs a name");
  const powerMap = sanitizePowerMap(input.powerMap);
  const valueProof = sanitizeValueProof(input.valueCase, input.valueEvidence);

  return inTransaction(sql, async (tx) => {
    const account = await tx`select id from "user" where id = ${userId} for update`;
    if (!account.length) throw new RequestError(401, "Unauthorized");
    const counts = await tx<{ count: string | number }>`
      select count(*) as count from assessment_snapshots where user_id = ${userId}`;
    if (Number(counts[0]?.count ?? 0) >= MAX_SNAPSHOTS_PER_ACCOUNT) {
      throw new RequestError(
        409,
        `Snapshot limit reached (${MAX_SNAPSHOTS_PER_ACCOUNT}). Delete an older snapshot first.`,
      );
    }
    const rows = await tx.query<SummaryRow>(
      `insert into assessment_snapshots
        (id, user_id, title, practice_name, profile_json, power_map_json, value_case_json, value_evidence_json, model_version, corpus_version)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
       returning ${SUMMARY_COLUMNS}`,
      [
        `snap_${crypto.randomUUID()}`,
        userId,
        input.title,
        profile.practiceName.slice(0, 80),
        json,
        powerMap.json ?? null,
        valueProof.caseJson ?? null,
        valueProof.evidenceJson ?? null,
        ASSESSMENT_MODEL_VERSION,
        KNOWLEDGE_CORPUS_VERSION,
      ],
    );
    return summary(rows[0]);
  });
}

/**
 * One snapshot in full, or null. A stored power map that no longer reads
 * (saved by an older build) is left out rather than failing the whole read.
 */
export async function loadSnapshot(
  sql: Sql,
  userId: string,
  id: string,
): Promise<AssessmentSnapshot | null> {
  const rows = await sql.query<
    SummaryRow & {
      profile_json: PracticeProfile | string;
      power_map_json: unknown;
      value_case_json: unknown;
      value_evidence_json: unknown;
    }
  >(
    `select ${SUMMARY_COLUMNS}, profile_json, power_map_json, value_case_json, value_evidence_json
     from assessment_snapshots where id = $1 and user_id = $2 limit 1`,
    [id, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const stored =
    typeof row.profile_json === "string" ? JSON.parse(row.profile_json) : row.profile_json;
  const { profile, complete } = sanitizeSnapshotProfile(stored);
  let powerMap: RoleAssignment[] | undefined;
  try {
    powerMap = sanitizePowerMap(row.power_map_json).assignments;
  } catch {
    powerMap = undefined;
  }
  const valueProof = sanitizeValueProof(row.value_case_json, row.value_evidence_json);
  return {
    ...summary(row),
    profile,
    profileComplete: complete,
    powerMap,
    valueCase: valueProof.valueCase,
    valueEvidence: valueProof.valueEvidence,
  };
}

/** Deletes one of the account's snapshots; false when it has no such snapshot. */
export async function deleteSnapshot(sql: Sql, userId: string, id: string): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `delete from assessment_snapshots where id = $1 and user_id = $2 returning id`,
    [id, userId],
  );
  return rows.length > 0;
}

type SummaryRow = {
  id: string;
  title: string;
  practice_name: string;
  business_id: string | null;
  model_version: string;
  corpus_version: string;
  created_at: string | Date;
  has_power_map: boolean;
  has_value_proof: boolean;
};

/** What the list shows, computed in Postgres: the JSON documents never cross the wire. */
const SUMMARY_COLUMNS = `id, title, practice_name, profile_json->>'businessId' as business_id,
  model_version, corpus_version, created_at,
  power_map_json is not null as has_power_map,
  (value_case_json is not null or value_evidence_json is not null) as has_value_proof`;

function summary(row: SummaryRow): AssessmentSnapshotSummary {
  return {
    id: row.id,
    title: row.title,
    practiceName: row.practice_name,
    businessId: row.business_id ?? null,
    modelVersion: row.model_version,
    corpusVersion: row.corpus_version,
    createdAt: toIsoTimestamp(row.created_at),
    includesPowerMap: row.has_power_map,
    includesValueProof: row.has_value_proof,
  };
}

function sanitizeValueProof(valueCase: unknown, evidence: unknown) {
  if (valueCase == null && evidence == null) return {};
  const raw = JSON.stringify({ valueCase, evidence });
  if (new TextEncoder().encode(raw).byteLength > MAX_VALUE_PROOF_BYTES)
    throw new RequestError(413, "Value proof is too large");
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
    throw new RequestError(413, "Duty map is too large");
  const assignments = normalizeRoleAssignments(value);
  if (!assignments) throw new RequestError(400, "Invalid Duty map");
  return { assignments, json: JSON.stringify(assignments) };
}

const ASSESSMENT_MODEL_VERSION = "precog-2026.09";
const KNOWLEDGE_CORPUS_VERSION = "controls-2026.09";
const MAX_POWER_MAP_BYTES = 256 * 1024;
const MAX_VALUE_PROOF_BYTES = 128 * 1024;
