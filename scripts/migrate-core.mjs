/**
 * Driver-independent, concurrent-safe migration ledger. The caller must reserve
 * ONE connection for this run: never implement exec with independent pool.query
 * calls. Each ledger change/file owns a transaction and a transaction-scoped
 * advisory lock, acquired BEFORE reading the ledger. Rechecking under that lock
 * lets competing deploys skip a file another runner committed in the meantime.
 * Transaction pooling is supported; no session-scoped lock survives a COMMIT.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const LOCK_NAMESPACE = 1347568455; // PRCG, fixed across all releases/runners.
const LOCK_ID = 1;
const FILE_NAME = /^\d{4}_[^/\\]+\.sql$/;

export async function runMigrations({
  migrationsDir,
  exec,
  log = () => undefined,
  lockTimeoutMs = 30_000,
}) {
  if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1 || lockTimeoutMs > 300_000)
    throw new Error("Migration lock timeout must be an integer from 1 to 300000 milliseconds");

  // Validate and read the complete manifest BEFORE making any database change.
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const prefixes = new Set();
  for (const name of files) {
    if (!FILE_NAME.test(name)) throw new Error(`Invalid migration filename: ${name}`);
    const prefix = name.slice(0, 4);
    if (prefixes.has(prefix)) throw new Error(`two migrations share the prefix ${prefix}`);
    prefixes.add(prefix);
  }
  let renamed = {};
  try {
    renamed = JSON.parse(await readFile(join(migrationsDir, "renamed.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!renamed || typeof renamed !== "object" || Array.isArray(renamed))
    throw new Error("Migration rename manifest must be an object");
  const previousNames = new Set();
  const renames = Object.entries(renamed).filter(([name]) => !name.startsWith("_"));
  for (const [current, previous] of renames) {
    if (!files.includes(current) || typeof previous !== "string" || !FILE_NAME.test(previous))
      throw new Error(`Invalid migration rename: ${current}`);
    if (previousNames.has(previous)) throw new Error(`Duplicate migration rename: ${previous}`);
    previousNames.add(previous);
  }
  const sources = new Map(
    await Promise.all(
      files.map(async (name) => [name, await readFile(join(migrationsDir, name), "utf8")]),
    ),
  );

  async function transaction(work) {
    await exec("BEGIN");
    try {
      await exec("SELECT set_config('lock_timeout', $1, true)", [`${lockTimeoutMs}ms`]);
      try {
        await exec(`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${LOCK_ID})`);
      } catch (error) {
        if (error.code === "55P03")
          throw new Error(
            `Migration lock wait exceeded ${lockTimeoutMs}ms. Another migration is running; retry after it finishes.`,
            { cause: error },
          );
        throw error;
      }
      const result = await work();
      await exec("COMMIT");
      return result;
    } catch (error) {
      try {
        await exec("ROLLBACK");
      } catch {
        // Preserve the original failure; the caller closes the reserved client.
      }
      throw error;
    }
  }

  const moved = await transaction(async () => {
    await exec(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = new Set((await exec("SELECT name FROM _migrations")).map((r) => r.name));
    const changes = [];
    for (const [current, previous] of renames) {
      if (applied.has(current) || !applied.has(previous)) continue;
      await exec("UPDATE _migrations SET name = $1 WHERE name = $2", [current, previous]);
      applied.delete(previous);
      applied.add(current);
      changes.push([previous, current]);
    }
    return changes;
  });
  for (const [previous, current] of moved) log(`[migrate] ledger: ${previous} -> ${current}`);

  const appliedNow = [];
  for (const name of files) {
    try {
      const written = await transaction(async () => {
        const applied = await exec("SELECT name FROM _migrations WHERE name = $1", [name]);
        if (applied.length) return false;
        await exec(sources.get(name));
        await exec("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        return true;
      });
      if (!written) continue;
    } catch (error) {
      log(`[migrate] error applying ${name}`);
      throw error;
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
