import type { Sql } from "@/lib/db";

/**
 * Revision-checked write of one business row.
 *
 * The check and the write are ONE statement: the `on conflict … do update`
 * carries `where businesses.revision = base`, so two clients that both loaded
 * revision N and save at the same moment cannot both succeed — Postgres
 * evaluates the predicate against the row it has just locked, and the loser's
 * update matches nothing. The earlier read-then-write version let the second
 * writer silently overwrite the first; `isStaleSave` in ./save-conflict still
 * documents the intended semantics, but the database now enforces them.
 *
 * Kept free of `createServerFn` so it can run against PGLite in a unit test.
 */
export interface BusinessSaveInput {
  userId: string;
  businessId: string;
  name: string;
  industry: string;
  /** Already-serialized profile, stored as jsonb. */
  profileJson: string;
  /** Revision the client last loaded for this business; null when it never has. */
  baseRevision: number | null;
}

export interface BusinessRowSnapshot<TProfile = unknown> {
  revision: number;
  profile: TProfile;
  industry: string;
  name: string;
  updated_at: string;
}

export type BusinessSaveResult<TProfile = unknown> =
  | { ok: true; revision: number; updatedAt: string }
  | { ok: false; conflict: true; existing: BusinessRowSnapshot<TProfile> };

export async function saveBusinessRevision<TProfile = unknown>(
  sql: Sql,
  input: BusinessSaveInput,
): Promise<BusinessSaveResult<TProfile>> {
  // First save of a business: no row, so no conflict target — plain insert at
  // revision 1. Existing row: update only when the caller's base revision
  // matches. `null::bigint` never equals anything, so a client that never
  // loaded this business cannot overwrite a row that exists (that is the
  // "stale" case the client resolves through the conflict banner).
  const written = await sql<{ revision: number | string; updated_at: string }>`
    insert into businesses (id, user_id, name, industry, profile, revision, updated_at)
    values (
      ${input.businessId},
      ${input.userId},
      ${input.name},
      ${input.industry},
      ${input.profileJson}::jsonb,
      1,
      now()
    )
    on conflict (user_id, id) do update set
      name = excluded.name,
      industry = excluded.industry,
      profile = excluded.profile,
      revision = businesses.revision + 1,
      updated_at = now()
    where businesses.revision = ${input.baseRevision}::bigint
    returning revision, updated_at
  `;
  const row = written[0];
  if (row) {
    return { ok: true, revision: Number(row.revision), updatedAt: String(row.updated_at) };
  }

  // Nothing written: the row exists at some other revision. Read it so the
  // client can show what it would be overwriting.
  const existingRows = await sql<{
    revision: number | string;
    profile: TProfile;
    industry: string;
    name: string;
    updated_at: string;
  }>`
    select revision, profile, industry, name, updated_at
    from businesses
    where id = ${input.businessId} and user_id = ${input.userId}
  `;
  const existing = existingRows[0];
  if (!existing) {
    // Only reachable if the row was deleted between the two statements.
    throw new Error("Unable to save business profile");
  }
  return {
    ok: false,
    conflict: true,
    existing: {
      revision: Number(existing.revision),
      profile: existing.profile,
      industry: existing.industry,
      name: existing.name,
      updated_at: String(existing.updated_at),
    },
  };
}
