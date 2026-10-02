#!/usr/bin/env node
/**
 * For the owner: which items the old action lists show that Home's one
 * "Do these first" list (doNextList, src/lib/precog/actions/do-next.ts) does
 * not cover. For each of the 8 sample businesses it reads this week's actions
 * (buildWeeklyActions, as the weekly plan builds it) and the threat deck
 * (buildThreatAssessment, as /threat builds it), so the owner can approve each
 * dropped item before the report or the share list switches to doNextList.
 *
 * The three lists name their items differently: Home's list holds controls
 * (for example "split-one-duty-out"), the weekly actions hold "bank-rec",
 * "dual-control" and "sod-<rule>", and the threat deck holds "sod-<rule>",
 * control gaps, scenarios and knowledge items. So each item is compared by
 * what it answers, not by its id:
 *
 * - A "sod-<rule>" item is covered when a control on Home's list answers that
 *   duty-conflict rule (it covers one of the rule's two duties, the same test
 *   rankFirstSteps uses).
 * - "bank-rec" and "dual-control" are covered when Home's list holds one of the
 *   controls the weekly builder cites for them (weekly-actions/build.ts).
 * - Every other item (knowledge, scenarios, control gaps, leave, the register,
 *   the map) is not about duty conflicts, which is all Home's list ranks, so it
 *   is listed on its own for the owner to place.
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
  { CONTROL_DUTIES },
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
  load("../src/lib/precog/coach/first-steps.ts"),
]);

/** The controls the weekly builder cites for its two fixed actions (weekly-actions/build.ts). */
const WEEKLY_CONTROLS = {
  "bank-rec": ["owner-opens-bank-statement", "independent-bank-reconciliation"],
  "dual-control": ["dual-release-above-threshold", "new-payee-second-approval"],
};

const today = localDateKey(new Date());
let dropped = 0;
let other = 0;

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
  const controls = doNext.filter((item) => item.kind === "step").map((item) => item.id);

  // The duties behind each rule, from every detected conflict (the weekly
  // split actions also count conflicts that dual release covers in part).
  const ruleDuties = new Map();
  for (const c of sod.conflicts) {
    if (!ruleDuties.has(c.ruleId)) ruleDuties.set(c.ruleId, [c.entitlementA, c.entitlementB]);
  }
  /** The controls on Home's list that answer one item, or null when the item is not about duty conflicts. */
  function answeredBy(id) {
    if (WEEKLY_CONTROLS[id]) return controls.filter((c) => WEEKLY_CONTROLS[id].includes(c));
    if (!id.startsWith("sod-")) return null;
    const duties = ruleDuties.get(id.slice("sod-".length)) ?? [];
    return controls.filter((c) => duties.some((d) => (CONTROL_DUTIES[c] ?? []).includes(d)));
  }

  const items = [
    ...weekly.map((a) => ({ from: "weekly actions", id: a.id, title: a.title })),
    ...threat.targetDeck.map((t) => ({ from: "threat deck", id: t.id, title: t.label })),
  ].map((item) => ({ ...item, by: answeredBy(item.id) }));
  const covered = items.filter((item) => item.by && item.by.length > 0);
  const missing = items.filter((item) => item.by && item.by.length === 0);
  const elsewhere = items.filter((item) => !item.by);
  dropped += missing.length;
  other += elsewhere.length;

  console.log(`\n${label} (${industry})`);
  console.log(`  Do these first: ${doNext.map((item) => item.id).join(", ") || "(empty)"}`);
  console.log(`  Duty-conflict items Home covers (${covered.length}):`);
  for (const item of covered)
    console.log(`    = [${item.from}] ${item.id}, answered by ${item.by.join(", ")}`);
  console.log(`  Duty-conflict items Home drops (${missing.length}):`);
  if (missing.length === 0) console.log("    None.");
  for (const item of missing) console.log(`    - [${item.from}] ${item.id}: ${item.title}`);
  console.log(`  Other items, not about duty conflicts (${elsewhere.length}):`);
  for (const item of elsewhere) console.log(`    ~ [${item.from}] ${item.id}: ${item.title}`);
}

console.log(
  `\nAcross the 8 samples: ${dropped} duty-conflict items Home's list drops, and ${other} other items for the owner to place.`,
);
await runner.close();
await server.close();
