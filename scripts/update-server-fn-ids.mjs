#!/usr/bin/env node
/**
 * `npm run update:server-fn-ids` rewrites scripts/server-fn-ids.json: the id
 * of every `export const <name> = createServerFn(...)` under src/, as the
 * build derives it from the file path and export name (./lib/server-fn-id.mjs).
 * scripts/server-fn-ids.test.mjs compares the source with this snapshot, so a
 * moved or renamed server-function file fails CI instead of breaking saving in
 * every open tab after a deploy.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serverFunctionIdOf } from "./lib/server-fn-id.mjs";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SNAPSHOT = join(ROOT, "scripts", "server-fn-ids.json");

const EXPORT = /^export const (\w+)\s*=\s*createServerFn\b/gm;
const CALL = /\bcreateServerFn\s*\(/g;

/**
 * `{ "<file>#<export>": id }` for every server function under src/, sorted by
 * key. Throws on a `createServerFn(` call that is not such an export, so the
 * snapshot never silently misses one.
 */
export function collectServerFnIds(root = ROOT) {
  const entries = [];
  const files = readdirSync(join(root, "src"), { recursive: true })
    .map((file) => `src/${String(file).split("\\").join("/")}`)
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    // Comment lines (JSDoc examples) are not calls.
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join("\n");
    const exports = [...code.matchAll(EXPORT)].map((match) => match[1]);
    const calls = code.match(CALL)?.length ?? 0;
    if (calls !== exports.length)
      throw new Error(
        `${file}: every createServerFn call must be \`export const <name> = createServerFn(...)\`, so its id is known`,
      );
    for (const name of exports) entries.push([`${file}#${name}`, serverFunctionIdOf(file, name)]);
  }
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ids = collectServerFnIds();
  writeFileSync(SNAPSHOT, `${JSON.stringify(ids, null, 2)}\n`);
  console.log(`[server-fn-ids] wrote ${Object.keys(ids).length} ids to scripts/server-fn-ids.json`);
}
