/**
 * The migration ledger, independent of the database driver: reads
 * migrations/*.sql in order, refuses duplicate prefixes, moves ledger rows
 * for files that were renumbered (migrations/renamed.json), and applies
 * each pending file in its own transaction. `scripts/migrate.mjs` runs it
 * against Postgres at deploy time; the unit test runs it against PGLite.
 *
 * `exec(sql, params?)` runs one statement and returns its rows. A whole
 * multi-statement file is passed as one string, which both node-postgres'
 * simple-query protocol and PGLite's `exec` accept.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function runMigrations({ migrationsDir, exec, log = () => undefined }) {
  await exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const applied = new Set((await exec("SELECT name FROM _migrations")).map((r) => r.name));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const prefixes = new Set();
  for (const name of files) {
    const prefix = name.slice(0, 4);
    if (prefixes.has(prefix)) throw new Error(`two migrations share the prefix ${prefix}`);
    prefixes.add(prefix);
  }

  // A ledger written before a file was renumbered holds the old name: move
  // the row to the current name rather than applying the file twice.
  let renamed = {};
  try {
    renamed = JSON.parse(await readFile(join(migrationsDir, "renamed.json"), "utf8"));
  } catch {
    // No rename table: nothing to move.
  }
  const moved = [];
  for (const [current, previous] of Object.entries(renamed)) {
    if (current.startsWith("_") || applied.has(current) || !applied.has(previous)) continue;
    await exec("UPDATE _migrations SET name = $1 WHERE name = $2", [current, previous]);
    applied.add(current);
    moved.push([previous, current]);
    log(`[migrate] ledger: ${previous} -> ${current}`);
  }

  const appliedNow = [];
  for (const name of files) {
    if (applied.has(name)) continue;
    const text = await readFile(join(migrationsDir, name), "utf8");
    try {
      await exec("BEGIN");
      await exec(text);
      await exec("INSERT INTO _migrations (name) VALUES ($1)", [name]);
      await exec("COMMIT");
    } catch (err) {
      log(`[migrate] error applying ${name}`);
      try {
        await exec("ROLLBACK");
      } catch {
        // ROLLBACK fails when the connection died — keep the original error.
      }
      throw err;
    }
    log(`[migrate] applied ${name}`);
    appliedNow.push(name);
  }
  log(
    appliedNow.length
      ? `[migrate] done — ${appliedNow.length} migration(s) applied.`
      : "[migrate] up to date.",
  );
  return { applied: appliedNow, moved };
}
