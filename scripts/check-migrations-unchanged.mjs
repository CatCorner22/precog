#!/usr/bin/env node
/**
 * `npm run check:migrations`: fails when this branch modifies, deletes or
 * renames a file under migrations/ that exists on the base ref. A deployed
 * database never re-runs an applied file, so an edit reaches only new
 * databases; a change belongs in a new numbered file. Adding files is fine,
 * and migrations/renamed.json may gain keys but never lose or change one.
 *
 * Base ref: BASE_REF, else origin/main. Compares the merge base with the
 * working tree, so uncommitted edits count too. CI runs it on pull requests.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const RENAMED = "migrations/renamed.json";

/**
 * The problems in a `git diff --name-status` listing of migrations/, one line
 * per offending file. `renamedBefore`/`renamedAfter` are the raw texts of
 * migrations/renamed.json on the base and now (null when absent).
 */
export function migrationEditProblems(
  nameStatus,
  { renamedBefore = null, renamedAfter = null } = {},
) {
  const problems = [];
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;
    const [status, ...paths] = line.split("\t");
    const kind = status[0];
    if (kind === "A") continue;
    if (kind === "M" && paths[0] === RENAMED) {
      const problem = renamedJsonProblem(renamedBefore, renamedAfter);
      if (problem) problems.push(`${RENAMED}: ${problem}`);
      continue;
    }
    const verb = { M: "modified", D: "deleted", R: "renamed", C: "copied", T: "changed type" };
    problems.push(`${paths.join(" -> ")}: ${verb[kind] ?? `changed (${status})`}`);
  }
  return problems;
}

/** Why the new renamed.json drops or changes a key of the old one, or null. */
export function renamedJsonProblem(before, after) {
  let old;
  let now;
  try {
    old = JSON.parse(before ?? "{}");
    now = JSON.parse(after ?? "{}");
  } catch {
    return "is not valid JSON";
  }
  if (!isObject(old) || !isObject(now)) return "is not a JSON object";
  const lost = Object.keys(old).filter((key) => !(key in now) || now[key] !== old[key]);
  return lost.length ? `removes or changes ${lost.join(", ")} (only add keys)` : null;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main() {
  const base = process.env.BASE_REF?.trim() || "origin/main";
  const mergeBase = git("merge-base", base, "HEAD").trim();
  const nameStatus = git("diff", "--name-status", "--find-renames", mergeBase, "--", "migrations");
  let renamedBefore = null;
  try {
    renamedBefore = git("show", `${mergeBase}:${RENAMED}`);
  } catch {
    // Not on the base: any content only adds keys.
  }
  let renamedAfter = null;
  try {
    renamedAfter = readFileSync(RENAMED, "utf8");
  } catch {
    // A deleted renamed.json is reported as "deleted" from the listing.
  }
  const problems = migrationEditProblems(nameStatus, { renamedBefore, renamedAfter });
  if (problems.length) {
    console.error(`[check:migrations] These migration files differ from ${base}:`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(
      "[check:migrations] Never edit, delete or rename a migration on main. Add a new file with the next unused number instead.",
    );
    process.exit(1);
  }
  console.log(`[check:migrations] no existing migration changed since ${base}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  main();
}
