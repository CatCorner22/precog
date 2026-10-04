#!/usr/bin/env node
/**
 * Checks that the production build carries the function time limits from
 * vite.config.ts (nitro `vercel.functions` and `vercel.functionRules`): every
 * function under .vercel/output/functions has a numeric `maxDuration` in its
 * .vc-config.json, and the function that serves /api/cron/digest (the `dest`
 * of that route in config.json, else the catch-all __server.func) has 300.
 * Run after `npm run build`; exits non-zero naming each problem. It also
 * warns, without failing, while no function carries `regions` (the owner has
 * not set FUNCTION_REGIONS yet), since functions then run in Vercel's default
 * region rather than next to the database.
 *
 * Usage: node scripts/check-build-functions.mjs
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const OUTPUT = ".vercel/output";
const CRON_ROUTE = "/api/cron/digest";
const CRON_MAX_DURATION = 300;
const REGION_WARNING =
  "[functions] no region pinned: FUNCTION_REGIONS in vite.config.ts is null, so functions run in Vercel's default region, not next to the database (docs/OPERATIONS.md, Function limits).";

/** Every `.vc-config.json` below `dir`, without following the symlinked function directories twice. */
async function findFunctionConfigs(dir, seen = new Set()) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.name === ".vc-config.json") {
      found.push(path);
      continue;
    }
    const info = await stat(path).catch(() => null);
    if (!info?.isDirectory()) continue;
    if (entry.isSymbolicLink()) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    found.push(...(await findFunctionConfigs(path, seen)));
  }
  return found;
}

const config = JSON.parse(await readFile(join(OUTPUT, "config.json"), "utf8"));
const cronRoute = config.routes?.find((route) => route.src === CRON_ROUTE && route.dest);
const cronFunction = `${(cronRoute?.dest ?? "/__server").replace(/^\//, "")}.func`;

const problems = [];
const configs = await findFunctionConfigs(join(OUTPUT, "functions"));
if (configs.length === 0) problems.push(`no .vc-config.json under ${OUTPUT}/functions`);
const durations = new Map();
let pinnedRegions = 0;
for (const path of configs) {
  const name = relative(join(OUTPUT, "functions"), path).replace(/\/\.vc-config\.json$/, "");
  const { maxDuration, regions } = JSON.parse(await readFile(path, "utf8"));
  if (Array.isArray(regions) && regions.length > 0) pinnedRegions += 1;
  if (typeof maxDuration !== "number" || !Number.isFinite(maxDuration)) {
    problems.push(`${name}: maxDuration is ${JSON.stringify(maxDuration) ?? "missing"}`);
  }
  durations.set(name, maxDuration);
}
if (!durations.has(cronFunction)) {
  problems.push(`${cronFunction}: no function serves ${CRON_ROUTE}`);
} else if (durations.get(cronFunction) !== CRON_MAX_DURATION) {
  problems.push(
    `${cronFunction}: maxDuration is ${durations.get(cronFunction)}, expected ${CRON_MAX_DURATION} for ${CRON_ROUTE}`,
  );
}

if (configs.length > 0 && pinnedRegions === 0) {
  console.warn(REGION_WARNING);
}

if (problems.length) {
  console.error(
    `[functions] the build's functions lack their time limits:\n  ${problems.join("\n  ")}`,
  );
  process.exit(1);
}
console.log(
  `[functions] ${durations.size} function(s) carry maxDuration; ${cronFunction} serves ${CRON_ROUTE} at ${CRON_MAX_DURATION} s`,
);
