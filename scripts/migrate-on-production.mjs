#!/usr/bin/env node
/**
 * Build hook: apply migrations only on a production deploy.
 *
 * `npm run build` always runs this after `vite build`. Preview deploys, CI,
 * and local builds leave the database alone (a preview build often carries
 * the production DATABASE_URL). A production deploy runs scripts/migrate.mjs,
 * which applies pending files and refuses to ship without DATABASE_URL and
 * BETTER_AUTH_SECRET. CI and a manual release call `npm run db:migrate`
 * directly, which is not gated by this hook.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.VERCEL_ENV !== "production") {
  console.log("[migrate] not a production deploy — leaving the database unchanged.");
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [join(dirname(fileURLToPath(import.meta.url)), "migrate.mjs")],
  {
    stdio: "inherit",
    env: process.env,
  },
);
process.exit(result.status ?? 1);
