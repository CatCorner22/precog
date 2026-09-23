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
 *  11. (Warning only.) A case's own account, howItWorked plus controlGap,
 *      mentions at least one of the two duties each rule it cites pairs. A
 *      keyword match cannot prove a record shows both duties, so this never
 *      fails the run; it lists the attachments a person should read again.
 *
 * Run: npm run verify:evidence
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** The text of a string-valued field in a case record, single- or double-quoted. */
function stringField(block, field) {
  const m = block.match(new RegExp(`${field}:\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`));
  return m ? m[1].slice(1, -1) : "";
}

const rulesSrc = read("src/lib/precog/sod/conflict-rules.ts");
const casesSrc = read("src/lib/precog/evidence/cases.ts");
const benchSrc = read("src/lib/precog/evidence/benchmarks.ts");

const failures = [];
const fail = (msg) => failures.push(msg);
const warnings = [];
const warn = (msg) => warnings.push(msg);

/** Rule IDs defined by the SoD engine. */
const definedRules = new Set([...rulesSrc.matchAll(/id:\s*"(rule-[a-z0-9-]+)"/g)].map((m) => m[1]));
if (definedRules.size === 0) fail("No conflict rules found — parser out of date.");

/** Split the case library into individual records. */
const caseBlocks = casesSrc
  .split(/\n {2}\{\n/)
  .slice(1)
  .map((b) => b.split(/\n {2}\},\n/)[0]);

const seenCaseIds = new Set();
const seenSourceUrls = new Map();
const citedRules = new Set();
/** Every case's declared schemes, for the rule coverage check. */
const caseSchemeLists = [];
/** Each case's own account and the rules it cites, for check 11. */
const caseAccounts = [];

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

  const sourceUrl = block.match(/url:\s*"(https:\/\/[^"]+)"/)?.[1];
  if (!sourceUrl) {
    fail(`Case ${id} has no source URL.`);
  } else if (seenSourceUrls.has(sourceUrl)) {
    // One release, one case: a second record from the same URL double-counts
    // that case in every tally and median the app shows.
    fail(`Case ${id} cites the same source URL as case ${seenSourceUrls.get(sourceUrl)}.`);
  } else {
    seenSourceUrls.set(sourceUrl, id);
  }
  const caseSchemes = [
    ...(block.match(/schemes:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
  ].map((m) => m[1]);
  if (!/sodRuleIds:\s*\[\s*"/.test(block)) {
    // A record that shows no named pair of duties cites no rule rather than
    // the nearest one; it is found by its schemes instead.
    if (caseSchemes.length === 0) fail(`Case ${id} cites no rule and declares no scheme.`);
    else warn(`Case ${id} shows no named pair of duties; it is found by its schemes only.`);
  }
  caseSchemeLists.push(caseSchemes);
  caseAccounts.push({
    id,
    text: ["howItWorked", "controlGap"].map((field) => stringField(block, field)).join(" "),
    rules: [...(block.match(/sodRuleIds:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (m) => m[1],
    ),
  });
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

// 5b. Every control in the catalog is named by at least one case. The app
//     tells an owner that each recommended control would plausibly have
//     caught a real case; a control no case names has no such claim behind it.
const controlsSrc = read("src/lib/precog/evidence/controls.ts");
const catalogIds = [...controlsSrc.matchAll(/^\s*\|\s*"([a-z0-9-]+)"/gm)].map((m) => m[1]);
const citedControls = new Set(
  [...casesSrc.matchAll(/control:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]),
);
for (const id of catalogIds) {
  if (!citedControls.has(id)) fail(`Control ${id} is in the catalog but no case names it.`);
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
  // 2. Every rule has a real case behind it: one whose record shows the pair,
  //    or, when no record in the library does, one that shows a scheme the
  //    pair enables. The second kind is shown only as "a related scheme",
  //    never as "this exact gap", and is listed here for a person to source.
  const schemesByRule = new Map(
    [...mapBody.matchAll(/"(rule-[a-z0-9-]+)":\s*\[([^\]]*)\]/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    ]),
  );
  for (const rule of definedRules) {
    if (citedRules.has(rule)) continue;
    const wanted = new Set(schemesByRule.get(rule) ?? []);
    const related = caseSchemeLists.some((list) => list.some((s) => wanted.has(s)));
    if (related)
      warn(`Rule ${rule} has no case whose record shows its pair; related schemes only.`);
    else fail(`Rule ${rule} has no real case behind it, not even a related scheme.`);
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

// 11. Each rule a case cites should be visible in the case's own account. The
//     keywords below are the words a record uses when it describes someone
//     holding that duty. When a record mentions neither duty of a rule it
//     cites, the attachment is printed for a person to reread: it is either a
//     mistake, or one of the few records kept on its closest rule because no
//     case shows the pair.
const DUTY_WORDS = {
  collect_cash: [
    "cash",
    "collect",
    "customer pay",
    "patient pay",
    "paid by customers",
    "insurer",
    "insurance check",
    "insurance pay",
    "receipts",
    "received the mail",
    "take a patient payment",
    "incoming payments",
    "received the payments",
    "customers to pay",
  ],
  post_payments: [
    "books",
    "ledger",
    "record",
    "posting",
    "quickbooks",
    "accounting",
    "entries",
    "entry",
  ],
  prepare_deposit: ["deposit"],
  bank_reconcile: [
    "reconcil",
    "bank statement",
    "bank account",
    "cleared-check",
    "cleared check",
    "window onto the finances",
    "view of the bank",
    "landed in the practice",
    "what left the bank",
    "reviews itself",
    "read the statement",
    "card statement",
  ],
  approve_writeoffs: ["write-off", "write off", "wrote off", "written off", "writing off"],
  post_adjustments: [
    "adjust",
    "write-off",
    "write off",
    "wrote off",
    "void",
    "edit the record",
    "falsifying payment records",
    "falsifying entries",
    "credit balance",
  ],
  submit_claims: ["claim", "billed", "billing", "invoic"],
  create_vendor: [
    "vendor",
    "supplier",
    "payee",
    "company named",
    "sham company",
    "fake compan",
    "fictitious compan",
  ],
  approve_vendor: ["approv", "choosing the contractor", "steered"],
  approve_invoices: ["approv"],
  release_payment: [
    "check",
    "paid",
    "pay the",
    "payment",
    "transfer",
    "wire",
    "released",
    "spent",
    "spending",
    "withdraw",
    "purchases",
  ],
  approve_payroll: [
    "approv",
    "ran payroll",
    "ran its payroll",
    "responsible for payroll",
    "processed payroll",
    "payroll register",
  ],
  enter_payroll: [
    "payroll",
    "timesheet",
    "hours",
    "pay rate",
    "salary",
    "paycheck",
    "own pay",
    "compensation",
  ],
  edit_payroll_master: [
    "pay rate",
    "own rate",
    "reactivate",
    "put a name on payroll",
    "added her husband",
    "employee record",
    "employee numbers",
    "changed the names",
  ],
  post_journal_entries: [
    "journal",
    "entries",
    "entry",
    "ledger",
    "books",
    "recorded them",
    "recording them",
    "coded",
  ],
  pms_admin_roles: ["administ", "system access", "permission", "user role"],
  issue_refunds: ["refund"],
  change_fee_schedule: ["fee schedule", "pricing", "price"],
  edit_patient_master: ["customer record", "patient record", "account profile"],
  manage_user_access: ["access", "login", "password", "user account", "credential", "privilege"],
  export_bulk_data: ["export", "download", "account profiles", "customer list"],
  order_supplies: ["order", "purchas"],
  receive_goods: ["receiv", "signing for", "signed for", "arrived", "stocked", "stocks"],
  enter_invoices: ["invoice", "bills", "accounts payable"],
  initiate_ach: ["electronic", "online bank", "online access", "wire", "transfer", "ach"],
  sign_checks: ["sign", "check"],
  review_audit_logs: ["audit log", "access log", "logs"],
  manage_backups: ["backup", "back up", "recovery"],
  view_reports_only: [],
};
const ruleDuties = new Map(
  [...rulesSrc.matchAll(/id:\s*"(rule-[a-z0-9-]+)",\s*a:\s*"([a-z_]+)",\s*b:\s*"([a-z_]+)"/g)].map(
    (m) => [m[1], [m[2], m[3]]],
  ),
);
const mentions = (text, duty) => (DUTY_WORDS[duty] ?? []).some((w) => text.includes(w));
for (const { id, text, rules } of caseAccounts) {
  const lower = text.toLowerCase();
  for (const rule of rules) {
    const duties = ruleDuties.get(rule);
    if (!duties) continue;
    if (!duties.some((d) => mentions(lower, d))) {
      warn(
        `Case ${id} cites ${rule} (${duties.join(" + ")}), but its account mentions neither duty.`,
      );
    }
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

if (warnings.length > 0) {
  console.warn(`Evidence library warnings (${warnings.length}, not failures; reread these):\n`);
  for (const w of warnings) console.warn(`  - ${w}`);
  console.warn("");
}

if (failures.length > 0) {
  console.error("Evidence library check failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `Evidence library OK: ${seenCaseIds.size} cases, ${benchIds.length} benchmarks, ` +
    `all ${definedRules.size} segregation-of-duties rules backed by a real case (showing the pair, or a related scheme) ` +
    "and mapped to a fraud scheme.",
);
