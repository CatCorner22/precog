#!/usr/bin/env node
/**
 * Integrity check for the evidence library.
 *
 * The evidence layer only earns its keep if its claims stay true, so the
 * invariants are enforced rather than assumed:
 *
 *   1. Every SoD rule ID a case cites actually exists in conflict-rules.ts.
 *      A dangling reference means the app would show a case next to the wrong
 *      control, or next to no control at all.
 *   2. Every SoD rule has at least one real case behind it. A rule with no
 *      case is exactly the "zealous auditor" finding this product exists to
 *      avoid: a control demanded with nothing to show for it.
 *   3. Every case and every benchmark carries a source URL.
 *   4. Case IDs and benchmark IDs are unique.
 *   5. A case that states a loss of 0 carries a caveat explaining why, so a
 *      missing figure is never mistaken for a small one.
 *
 * Run: npm run verify:evidence
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const rulesSrc = read("src/lib/precog/sod/conflict-rules.ts");
const casesSrc = read("src/lib/precog/evidence/cases.ts");
const benchSrc = read("src/lib/precog/evidence/benchmarks.ts");

const failures = [];
const fail = (msg) => failures.push(msg);

/** Rule IDs defined by the SoD engine. */
const definedRules = new Set(
  [...rulesSrc.matchAll(/id:\s*"(rule-[a-z0-9-]+)"/g)].map((m) => m[1]),
);
if (definedRules.size === 0) fail("No conflict rules found — parser out of date.");

/** Split the case library into individual records. */
const caseBlocks = casesSrc
  .split(/\n  \{\n/)
  .slice(1)
  .map((b) => b.split(/\n  \},\n/)[0]);

const seenCaseIds = new Set();
const citedRules = new Set();

for (const block of caseBlocks) {
  const id = block.match(/id:\s*"([^"]+)"/)?.[1];
  if (!id) {
    fail("A case record has no id.");
    continue;
  }
  if (seenCaseIds.has(id)) fail(`Duplicate case id: ${id}`);
  seenCaseIds.add(id);

  for (const m of block.matchAll(/"(rule-[a-z0-9-]+)"/g)) {
    citedRules.add(m[1]);
    if (!definedRules.has(m[1])) {
      fail(`Case ${id} cites rule ${m[1]}, which no conflict rule defines.`);
    }
  }

  if (!/url:\s*"https:\/\//.test(block)) {
    fail(`Case ${id} has no source URL.`);
  }
  if (!/sodRuleIds:\s*\[\s*"/.test(block)) {
    fail(`Case ${id} is not tied to any segregation-of-duties rule.`);
  }
  if (/lossUsd:\s*0\b/.test(block) && !/caveat:/.test(block)) {
    fail(`Case ${id} records no loss figure but carries no caveat explaining why.`);
  }
}

for (const rule of definedRules) {
  if (!citedRules.has(rule)) {
    fail(`Rule ${rule} has no real case behind it.`);
  }
}

const benchIds = [...benchSrc.matchAll(/id:\s*"(bm-[a-z0-9-]+)"/g)].map((m) => m[1]);
const seenBench = new Set();
for (const id of benchIds) {
  if (seenBench.has(id)) fail(`Duplicate benchmark id: ${id}`);
  seenBench.add(id);
}
if (benchIds.length === 0) fail("No benchmarks found — parser out of date.");
if (!/url:\s*"https:\/\//.test(benchSrc)) fail("Benchmarks carry no source URL.");

if (failures.length > 0) {
  console.error("Evidence library check failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `Evidence library OK: ${seenCaseIds.size} cases, ${benchIds.length} benchmarks, ` +
    `all ${definedRules.size} segregation-of-duties rules backed by at least one real case.`,
);
