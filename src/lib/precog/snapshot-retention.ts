import type { Sql } from "@/lib/db";

export const MAX_SNAPSHOTS_PER_USER = 50;

/**
 * Keeps only the newest `limit` snapshots for a user. The save handler
 * checks the count before inserting so the owner gets a clear message, but
 * two saves racing past that check can both insert; this runs after every
 * insert and holds the limit in the database whatever the interleaving.
 * Returns how many rows it removed.
 */
export async function enforceSnapshotRetention(
  sql: Sql,
  userId: string,
  limit = MAX_SNAPSHOTS_PER_USER,
): Promise<number> {
  const rows = await sql.query<{ id: string }>(
    `delete from assessment_snapshots
      where user_id = $1
        and id in (
          select id from assessment_snapshots
          where user_id = $1
          order by created_at desc, id desc
          offset $2
        )
      returning id`,
    [userId, limit],
  );
  return rows.length;
}
