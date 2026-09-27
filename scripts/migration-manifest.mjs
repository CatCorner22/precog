/**
 * The rules a migrations/ folder must follow, shared by the production runner
 * (./migrate-core.mjs) and the preview's PGlite bootstrap (src/lib/db.ts), so
 * both accept or refuse the same set of files. Pure: it takes the file names
 * and the parsed renamed.json and reads nothing itself.
 */
const FILE_NAME = /^\d{4}_[^/\\]+\.sql$/;

/**
 * Throw on a file name without a four-digit prefix, two files sharing a
 * prefix, or a malformed rename manifest. Returns the [current, previous]
 * rename pairs (keys starting with "_" are comments).
 *
 * @param {readonly string[]} files the .sql file names in migrations/
 * @param {unknown} renamed the parsed renamed.json ({} when the file is absent)
 * @returns {[string, string][]}
 */
export function validateMigrationManifest(files, renamed = {}) {
  const prefixes = new Set();
  for (const name of files) {
    if (!FILE_NAME.test(name)) throw new Error(`Invalid migration filename: ${name}`);
    const prefix = name.slice(0, 4);
    if (prefixes.has(prefix)) throw new Error(`two migrations share the prefix ${prefix}`);
    prefixes.add(prefix);
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
  return renames;
}
