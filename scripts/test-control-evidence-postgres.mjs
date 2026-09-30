#!/usr/bin/env node
/** Opt-in tests against separate connections to an isolated local PostgreSQL service. */
import { spawnSync } from "node:child_process";
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
  throw new Error("Control evidence tests only accept an isolated local PostgreSQL service.");
}
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
    "run",
    "src/lib/precog/controls/executions/store.test.ts",
    "src/lib/precog/controls/executions/pagination.test.ts",
    "src/lib/precog/controls/executions/concurrency.postgres.test.ts",
    "--maxWorkers=1",
  ],
  { stdio: "inherit", env: process.env, cwd: fileURLToPath(new URL("../", import.meta.url)) },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
