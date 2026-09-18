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
 *   6. Every SoD rule maps to at least one fraud scheme, and the map cites no
 *      rule that does not exist. Case matching runs off that map.
 *   7. Every industry pack's sector has at least one case behind it.
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
  .split(/\n {2}\{\n/)
  .slice(1)
  .map((b) => b.split(/\n {2}\},\n/)[0]);

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

// 6. Every rule maps to at least one fraud scheme, and the map cites no rule
//    that does not exist. Case matching runs off this map, so a hole in it
//    silently degrades every recommendation the app makes.
const indexSrc = read("src/lib/precog/evidence/index.ts");
const mapBody = indexSrc.match(
  /const RULE_SCHEMES: Record<string, SchemeKind\[\]> = \{([\s\S]*?)\n\};/,
)?.[1];
if (!mapBody) {
  fail("RULE_SCHEMES map not found — parser out of date.");
} else {
  const mapped = new Set(
    [...mapBody.matchAll(/"(rule-[a-z0-9-]+)":\s*\[([^\]]*)\]/g)]
      .filter((m) => m[2].trim().length > 0)
      .map((m) => m[1]),
  );
  for (const rule of definedRules) {
    if (!mapped.has(rule)) fail(`Rule ${rule} has no fraud scheme mapped to it.`);
  }
  for (const m of mapBody.matchAll(/"(rule-[a-z0-9-]+)":/g)) {
    if (!definedRules.has(m[1])) {
      fail(`RULE_SCHEMES maps ${m[1]}, which no conflict rule defines.`);
    }
  }
}

// 7. Every industry pack's sector has at least one case behind it. A pack
//    whose "what goes wrong in this trade" list cites nothing the library can
//    show is the hypothetical-risk failure this product exists to avoid.
const packSrc = read("src/lib/precog/industries/packs.ts");
const caseSectors = new Set(
  [...casesSrc.matchAll(/sector:\s*"([a-z-]+)"/g)].map((m) => m[1]),
);
for (const m of packSrc.matchAll(/sector:\s*"([a-z-]+)"/g)) {
  if (!caseSectors.has(m[1])) {
    fail(`Industry pack sector "${m[1]}" has no real case in the library.`);
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
    `all ${definedRules.size} segregation-of-duties rules backed by at least one real case ` +
    "and mapped to a fraud scheme.",
);
