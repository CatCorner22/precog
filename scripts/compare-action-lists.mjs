#!/usr/bin/env node
/**
 * For the owner: which items the old action lists show that Home's one
 * "Do these first" list (doNextList, src/lib/precog/actions/do-next.ts) does
 * not. For each of the 8 sample businesses it prints the item ids present in
 * this week's actions (buildWeeklyActions, as the weekly plan builds it) or in
 * the threat deck (buildThreatAssessment, as /threat builds it) but absent
 * from doNextList, so the owner can approve each dropped item before the
 * report or the share list switches to doNextList.
 *
 * Run: node scripts/compare-action-lists.mjs. Local only; it is not part of CI.
 */
import { fileURLToPath } from "node:url";
import { createServer, createServerModuleRunner } from "vite";

// A module runner reads the TypeScript sources directly. Middleware mode opens no port.
const server = await createServer({
  configFile: false,
  resolve: { tsconfigPaths: true },
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
});
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
const load = (path) => runner.import(fileURLToPath(new URL(path, import.meta.url)));

const [
  { INDUSTRIES },
  { defaultProfile },
  { resolveTemplate },
  { buildWeeklyActions },
  { buildProcessMapGraph },
  { confirmedScenarioIds, residualScope },
  { trackRegisterFreshness },
  { mapAssessed },
  { localDateKey },
  { buildThreatAssessment },
  { detectSodConflicts, sodDetectionOptions },
  { openFindings, partialDualReleaseCoverage },
  { doNextList },
] = await Promise.all([
  load("../src/lib/precog/industry.ts"),
  load("../src/lib/precog/practice-profile.ts"),
  load("../src/lib/precog/active-template.ts"),
  load("../src/lib/precog/weekly-actions/build.ts"),
  load("../src/lib/precog/process-graph.ts"),
  load("../src/lib/precog/scoring/scope.ts"),
  load("../src/lib/precog/continuity/register-state.ts"),
  load("../src/lib/precog/builder/map-state.ts"),
  load("../src/lib/precog/dates.ts"),
  load("../src/lib/precog/threat-scoring.ts"),
  load("../src/lib/precog/sod/detect.ts"),
  load("../src/lib/precog/sod/open-findings.ts"),
  load("../src/lib/precog/actions/do-next.ts"),
]);

const today = localDateKey(new Date());
let dropped = 0;

for (const { id: industry, label } of INDUSTRIES) {
  const profile = defaultProfile(industry);
  const tpl = resolveTemplate(profile);

  // This week's actions, with the inputs the weekly plan passes.
  const { snapshots } = buildProcessMapGraph(tpl, profile.staff, {}, residualScope(profile));
  const weekly = buildWeeklyActions({
    tpl,
    staff: profile.staff,
    dualRelease: profile.dualRelease,
    mapSnapshots: snapshots,
    today,
    trackFreshness: trackRegisterFreshness(profile, tpl),
    mapAssessed: mapAssessed(profile),
    decisions: profile.decisions,
    plannedAbsences: profile.plannedAbsences,
    procedures: profile.procedures,
    integrationDriftSummary: profile.integrationDriftSummary,
    accessReconciliation: profile.accessReconciliation,
  });

  // The threat deck, with the inputs /threat passes.
  const threat = buildThreatAssessment({
    tpl,
    practiceName: profile.practiceName,
    staff: profile.staff,
    riskVariables: profile.riskVariables,
    dualRelease: profile.dualRelease,
    confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
  });

  // Home's list.
  const sod = detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease));
  const open = openFindings(
    sod.conflicts,
    partialDualReleaseCoverage(profile.dualRelease, sod.conflicts),
  );
  const doNext = doNextList({
    open,
    integrationDriftSummary: profile.integrationDriftSummary,
    accessReconciliation: profile.accessReconciliation,
  });
  const kept = new Set(doNext.map((item) => item.id));

  const missing = [
    ...weekly.map((a) => ({ from: "weekly actions", id: a.id, title: a.title })),
    ...threat.targetDeck.map((t) => ({ from: "threat deck", id: t.id, title: t.label })),
  ].filter((item) => !kept.has(item.id));
  dropped += missing.length;

  console.log(`\n${label} (${industry})`);
  console.log(`  Do these first: ${doNext.map((item) => item.id).join(", ") || "(empty)"}`);
  if (missing.length === 0) console.log("  Nothing dropped.");
  for (const item of missing) console.log(`  - [${item.from}] ${item.id}: ${item.title}`);
}

console.log(`\n${dropped} items across the 8 samples are not on Home's list.`);
await runner.close();
await server.close();
