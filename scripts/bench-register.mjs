#!/usr/bin/env node
/**
 * Register CPU bench: times the coverage report and the weekly plan on
 * generated teams at 25, 50 and 100 percent of the largest business Precog
 * accepts (LIST_LIMITS in src/lib/precog/profile-entries.ts: people, register
 * items and relations), plus the dental sample and the setup cap
 * (OWN_TEAM_MAX) for scale. Every run builds a new template object, because
 * coverageReport caches its answer per template.
 *
 * Run: npm run bench. Local only; it is not part of CI.
 */
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createServer, createServerModuleRunner } from "vite";

const RUNS = 3;

// One module runner for every import, so the weekly plan reads the same
// coverage cache the bench fills. Middleware mode opens no port.
const server = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
});
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
const load = (path) => runner.import(fileURLToPath(new URL(path, import.meta.url)));

const [{ getIndustryTemplate }, { buildWeeklyActions }, { coverageReport }, limits, ownTeam] =
  await Promise.all([
    load("../src/lib/precog/templates/index.ts"),
    load("../src/lib/precog/weekly-actions/build.ts"),
    load("../src/lib/precog/continuity/coverage.ts"),
    load("../src/lib/precog/profile-entries.ts"),
    load("../src/lib/precog/onboarding/own-team.ts"),
  ]);
const { LIST_LIMITS } = limits;
const { OWN_TEAM_MAX } = ownTeam;

const sample = getIndustryTemplate("dental");
const roles = Object.keys(sample.roleTemplates);
const processIds = sample.processes.map((p) => p.id);
const LEVELS = ["expert", "proficient", "basic", "aware"];
const CRITICALITY = ["critical", "important", "nice-to-have"];
const KINDS = ["duty", "task", "knowledge"];

/** Small deterministic generator, so every run and every machine sees the same team. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A sample-shaped template with generated people, register items and relations. */
function generated({ people, items, relations }) {
  const next = random(people * 31 + items * 7 + relations);
  const team = Array.from({ length: people }, (_, i) => ({
    id: `bp${i}`,
    name: `Person ${i + 1}`,
    role: roles[i % roles.length],
    active: next() > 0.03,
    tenureYears: Math.floor(next() * 15),
  }));
  const knowledge = Array.from({ length: items }, (_, i) => ({
    id: `bk${i}`,
    name: `Register item ${i + 1}`,
    criticality: CRITICALITY[i % CRITICALITY.length],
    category: "process",
    description: "",
    kind: KINDS[i % KINDS.length],
    documented: next() > 0.6,
    linkedProcessIds: processIds.length ? [processIds[i % processIds.length]] : [],
  }));
  // Every item gets its share of holders; the people are drawn at random, so
  // some items end up single-held and some covered, as in a real register.
  const rels = [];
  const seen = new Set();
  for (let r = 0; rels.length < relations && r < relations * 2; r++) {
    const knowledgeId = knowledge[r % items].id;
    const personId = team[Math.floor(next() * people)].id;
    const key = `${personId}|${knowledgeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rels.push({ personId, knowledgeId, level: LEVELS[Math.floor(next() * LEVELS.length)] });
  }
  return { ...sample, people: team, knowledge, relations: rels };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Median milliseconds for the coverage report and for the weekly plan built on it. */
function time(make) {
  const coverage = [];
  const weekly = [];
  for (let run = 0; run < RUNS; run++) {
    const tpl = make();
    const t0 = performance.now();
    coverageReport(tpl);
    const t1 = performance.now();
    buildWeeklyActions({
      tpl,
      staff: tpl.staffComposition,
      dualRelease: { enabled: false, rules: {} },
    });
    const t2 = performance.now();
    coverage.push(t1 - t0);
    weekly.push(t2 - t1);
  }
  return { coverage: median(coverage), weekly: median(weekly) };
}

const scale = (share) => ({
  people: Math.round(LIST_LIMITS.people * share),
  items: Math.round(LIST_LIMITS.knowledge * share),
  relations: Math.round(LIST_LIMITS.relations * share),
});
const rows = [
  {
    label: "dental sample",
    people: sample.people.length,
    items: sample.knowledge.length,
    relations: sample.relations.length,
    make: () => ({ ...sample }),
  },
  // The setup screen takes at most OWN_TEAM_MAX people; 5 items and 20
  // relations per person is a full register for a team that size.
  {
    label: "setup cap (OWN_TEAM_MAX)",
    people: OWN_TEAM_MAX,
    items: OWN_TEAM_MAX * 5,
    relations: OWN_TEAM_MAX * 20,
  },
  { label: "25% of limits", ...scale(0.25) },
  { label: "50% of limits", ...scale(0.5) },
  { label: "100% of limits", ...scale(1) },
];

console.log(`[bench] median of ${RUNS} runs; a new template each run`);
console.log(
  `${"size".padEnd(26)}${"people".padStart(8)}${"items".padStart(8)}${"relations".padStart(11)}` +
    `${"coverage ms".padStart(13)}${"weekly ms".padStart(11)}`,
);
const results = [];
for (const row of rows) {
  const make = row.make ?? (() => generated(row));
  const { coverage, weekly } = time(make);
  results.push({
    ...row,
    make: undefined,
    coverageMs: +coverage.toFixed(1),
    weeklyMs: +weekly.toFixed(1),
  });
  console.log(
    `${row.label.padEnd(26)}${String(row.people).padStart(8)}${String(row.items).padStart(8)}` +
      `${String(row.relations).padStart(11)}${coverage.toFixed(1).padStart(13)}${weekly.toFixed(1).padStart(11)}`,
  );
}
console.log(JSON.stringify({ bench: "register", runs: RUNS, results }));
await runner.close();
await server.close();
