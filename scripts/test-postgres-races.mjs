#!/usr/bin/env node
/**
 * Opt-in race tests against separate connections to an isolated local
 * PostgreSQL service: every src/**\/*.postgres.test.ts except the control
 * evidence one, which test:postgres:evidence already runs.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const raw = process.env.DATABASE_URL?.trim();
if (
  process.env.PRECOG_LIFECYCLE_POSTGRES !== "1" ||
  !raw ||
  process.env.VERCEL_ENV === "production"
) {
  throw new Error(
    "Set PRECOG_LIFECYCLE_POSTGRES=1 and an isolated local DATABASE_URL; never production.",
  );
}
const target = new URL(raw);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1", "postgres"].includes(target.hostname)
) {
  throw new Error("Race tests only accept an isolated local PostgreSQL service.");
}

const root = fileURLToPath(new URL("../", import.meta.url));
const EVIDENCE = "src/lib/precog/controls/executions/concurrency.postgres.test.ts";

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.name.endsWith(".postgres.test.ts")) yield path;
  }
}

const files = [...walk(join(root, "src"))]
  .map((path) => relative(root, path).split(sep).join("/"))
  .filter((path) => path !== EVIDENCE)
  .sort();
if (files.length === 0) throw new Error("No src/**/*.postgres.test.ts race tests found.");
// npm test also collects these files; without the explicit skip a race test
// would run on the single-connection embedded database and prove nothing.
const SKIP = 'describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")';
const unguarded = files.filter((path) => !readFileSync(join(root, path), "utf8").includes(SKIP));
if (unguarded.length > 0) {
  throw new Error(`Race tests without the explicit skip (${SKIP}):\n  ${unguarded.join("\n  ")}`);
}
console.log(`Race tests on real PostgreSQL:\n  ${files.join("\n  ")}`);

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
    "run",
    ...files,
    "--maxWorkers=1",
  ],
  { stdio: "inherit", env: process.env, cwd: root },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
