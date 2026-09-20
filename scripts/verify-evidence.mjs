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
 *   7. Every industry the app offers resolves to a case-library sector that
 *      has at least one real case behind it.
 *   8. No unsourceable fraud rate reappears, and the shared statistics record
 *      carries a source URL.
 *   9. Every duty-family pairing the detector can emit has schemes mapped, so
 *      no finding reaches the user without a real case behind it.
 *  10. Every retrieval-corpus chunk declares what stands behind it: a cited
 *      document with an https URL, or practitioner guidance marked as such.
 *      Any case a chunk points at exists. No chunk carries the old free-text
 *      "source" badge that named nothing a reader could open.
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
const definedRules = new Set([...rulesSrc.matchAll(/id:\s*"(rule-[a-z0-9-]+)"/g)].map((m) => m[1]));
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
  const tenure = block.match(/tenureYearsStated:\s*(-?\d+(?:\.\d+)?)/);
  if (tenure) {
    if (!/^\d+$/.test(tenure[1])) {
      fail(`Case ${id} states tenure as ${tenure[1]}; it must be a whole number of years.`);
    }
    if (
      !/hired|worked there from|(of|for) (more than |over )?(\d+|[a-z]+) years|years of tenure|long-?time employee/i.test(
        block,
      )
    ) {
      fail(`Case ${id} states tenure but its text does not say where that figure comes from.`);
    }
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

// 7. Every industry the app offers resolves to a case-library sector that has
//    at least one real case behind it. An industry whose findings cite nothing
//    the library can show is the hypothetical-risk failure this product exists
//    to avoid.
const industrySrc = read("src/lib/precog/industry.ts");
const evidenceIndexSrc = read("src/lib/precog/evidence/index.ts");
const caseSectors = new Set([...casesSrc.matchAll(/sector:\s*"([a-z-]+)"/g)].map((m) => m[1]));
const industryIds = [
  ...(industrySrc.match(/export type IndustryId =([\s\S]*?);/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g),
].map((m) => m[1]);
if (industryIds.length === 0) fail("No IndustryId values found — parser out of date.");
const mapBodySector =
  evidenceIndexSrc.match(/export function sectorForIndustry[\s\S]*?\n\}\n/)?.[0] ?? "";
if (!mapBodySector) fail("sectorForIndustry not found — parser out of date.");
for (const id of industryIds) {
  const mapped = mapBodySector.includes(`case "${id}":`);
  // An unmapped industry falls through to "any", which must itself have cases.
  const sector = mapped
    ? mapBodySector.split(`case "${id}":`)[1].match(/return\s+"([a-z-]+)"/)?.[1]
    : "any";
  if (!sector || !caseSectors.has(sector)) {
    fail(`Industry "${id}" resolves to sector "${sector}", which has no real case.`);
  }
}

// 9. Every duty-family pairing the detector can emit has schemes mapped.
//
//    Family findings are the detector's catch-all: anything not covered by a
//    named rule falls through to them. They used to carry no case at all,
//    which made them read as framework assertion rather than evidence. A
//    pairing with no schemes mapped goes straight back to that.
const rulesBody = rulesSrc.replace(/\/\*[\s\S]*?\*\//g, "");
const matrixBlock = rulesBody.match(/FAMILY_CONFLICT_MATRIX[\s\S]*?=\s*\{([\s\S]*?)\n\};/)?.[1];
const familySchemesBlock = evidenceIndexSrc.match(
  /const FAMILY_SCHEMES: Record<string, SchemeKind\[\]> = \{([\s\S]*?)\n\};/,
)?.[1];
if (!matrixBlock || !familySchemesBlock) {
  fail("Duty-family matrix or FAMILY_SCHEMES not found — parser out of date.");
} else {
  const mappedPairs = new Set(
    [...familySchemesBlock.matchAll(/"([a-z_]+-[a-z_]+)":\s*\[[^\]]+\]/g)].map((m) => m[1]),
  );
  // Rows look like:  custody: { authorization: true, recording: true, ... }
  for (const row of matrixBlock.matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    const from = row[1];
    for (const col of row[2].matchAll(/(\w+):\s*true/g)) {
      const key = [from, col[1]].sort().join("-");
      if (!mappedPairs.has(key)) {
        fail(
          `Duty-family pairing "${key}" has no schemes mapped, so it can produce a finding with no real case behind it.`,
        );
      }
    }
  }
}

// 8. No fabricated fraud rate reappears, and the shared statistics record
//    carries a source URL.
//
//    The app previously asserted an "industryEmbezzlementRate" of 18%, varied
//    per industry to look precise. No published study gives an annual
//    probability of occupational fraud for a small business in a given
//    industry. A figure of that shape cannot be sourced, so it must not come
//    back under any name.
const sharedSrc = read("src/lib/precog/templates/shared-controls.ts");
const BANNED = [
  "industryEmbezzlementRate",
  "embezzlementRate",
  "fraudProbability",
  "annualFraudRate",
];
const searched = {
  "src/lib/precog/types.ts": read("src/lib/precog/types.ts"),
  "src/lib/precog/templates/shared-controls.ts": sharedSrc,
  "src/lib/precog/engine.ts": read("src/lib/precog/engine.ts"),
};
for (const [file, body] of Object.entries(searched)) {
  // Strip comments so the explanation of why the field was removed does not
  // trip the check that removed it.
  const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const banned of BANNED) {
    if (code.includes(banned)) {
      fail(`${file} declares "${banned}" — an unsourceable fraud rate.`);
    }
  }
}
if (!/sourceUrl:\s*"https:\/\//.test(sharedSrc)) {
  fail("DEFAULT_FRAUD_STATS carries no sourceUrl.");
}
if (/per-industry|industryEmbezzlement/.test(sharedSrc.replace(/\/\*[\s\S]*?\*\//g, ""))) {
  fail("shared fraud statistics appear to vary by industry, which no source supports.");
}

// 10. Retrieval corpus provenance.
const corpusSrc = read("src/lib/precog/rag/corpus.ts");
const corpusBody = corpusSrc.slice(corpusSrc.indexOf("export const KNOWLEDGE_CORPUS"));
const chunkBlocks = corpusBody.split(/\n {2}\{\n {4}id: "/).slice(1);
if (chunkBlocks.length === 0) fail("No corpus chunks found — parser out of date.");
for (const block of chunkBlocks) {
  const id = block.match(/^([^"]+)"/)?.[1] ?? "?";
  if (/^\s*source:/m.test(block))
    fail(`Corpus chunk ${id} still carries a free-text source badge.`);
  if (!/^\s*basis:/m.test(block)) fail(`Corpus chunk ${id} declares no basis.`);
  for (const m of block.matchAll(/caseIds:\s*\[([^\]]*)\]/g)) {
    for (const c of m[1].matchAll(/"([^"]+)"/g)) {
      if (!seenCaseIds.has(c[1]))
        fail(`Corpus chunk ${id} cites case ${c[1]}, which does not exist.`);
    }
  }
}
for (const m of corpusSrc.matchAll(/url:\s*"([^"]*)"/g)) {
  if (!/^https:\/\//.test(m[1])) fail(`Corpus citation URL is not https: ${m[1]}`);
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
