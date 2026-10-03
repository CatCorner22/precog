#!/usr/bin/env node
/**
 * Checks that "If someone is out" on Who knows what lists everything the
 * three screens it replaced listed, for every active person in each of the
 * 8 sample businesses:
 *
 * - the old "If someone is out tomorrow" card (absenceImpact): register items
 *   that stop and processes left with no owner;
 * - the old "Absence stress test" on Duty assignments (analyzeAbsenceImpact):
 *   duties that stop and duties left with one holder;
 * - the old "Bus factor" panel in the map builder (rankDepartureRisk):
 *   processes that lose their only owner and knowledge with no other strong
 *   holder.
 *
 * The merged card shows, for one ticked person, the register items with no
 * one else (absenceImpact), then personOutDetail's duties and processes. The
 * script prints every old item the merged card leaves out and exits non-zero
 * when there is one.
 *
 * Run: node scripts/check-absence-union.mjs. Local only; it is not part of CI.
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
  { absenceImpact },
  { analyzeAbsenceImpact },
  { rankDepartureRisk },
  { buildAssignments },
  { personOutDetail },
] = await Promise.all([
  load("../src/lib/precog/industry.ts"),
  load("../src/lib/precog/practice-profile.ts"),
  load("../src/lib/precog/active-template.ts"),
  load("../src/lib/precog/continuity/absence-impact.ts"),
  load("../src/lib/precog/sod/coverage-analysis.ts"),
  load("../src/lib/precog/builder/departure.ts"),
  load("../src/lib/precog/sod/detect.ts"),
  load("../src/lib/precog/continuity/out-impact.ts"),
]);

let missing = 0;
let people = 0;
let listed = 0;

for (const { id: industry, label } of INDUSTRIES) {
  const profile = defaultProfile(industry);
  const tpl = resolveTemplate(profile);
  const assignments = buildAssignments(tpl);
  const departures = new Map(
    rankDepartureRisk(tpl, tpl.processes, tpl.people, profile.staff).map((d) => [d.person.id, d]),
  );
  const processName = new Map(tpl.processes.map((p) => [p.id, p.name]));

  for (const person of tpl.people.filter((p) => p.active)) {
    people += 1;
    const register = absenceImpact(tpl, [person.id]);
    const detail = personOutDetail(tpl, assignments, person.id);
    const merged = {
      register: new Set((register?.stops ?? []).map((s) => s.item.id)),
      duties: new Set(
        [...detail.dutiesStop, ...detail.dutiesOneHolder].map((d) => d.entitlementId),
      ),
      processes: new Set(detail.processes.map((p) => p.name)),
    };
    listed += merged.register.size + merged.duties.size + merged.processes.size;

    const duty = analyzeAbsenceImpact(assignments, person.id);
    const departure = departures.get(person.id);
    const old = {
      register: [
        ...(register?.stops ?? []).map((s) => ["If someone is out tomorrow", s.item.id]),
        ...(departure?.orphanedKnowledge ?? []).map((k) => ["Bus factor", k.id]),
      ],
      duties: [
        ...(duty?.newlyUnassigned ?? []).map((d) => ["Absence stress test", d.entitlementId]),
        ...(duty?.newlySinglePoint ?? []).map((d) => ["Absence stress test", d.entitlementId]),
      ],
      processes: [
        ...(register?.orphanedProcesses ?? []).map((name) => ["If someone is out tomorrow", name]),
        ...(departure?.orphanedProcesses ?? []).map((p) => [
          "Bus factor",
          processName.get(p.id) ?? p.name,
        ]),
      ],
    };

    for (const kind of ["register", "duties", "processes"]) {
      for (const [source, id] of old[kind]) {
        if (merged[kind].has(id)) continue;
        missing += 1;
        console.log(`${label} · ${person.name}: ${kind} item "${id}" from ${source} is missing`);
      }
    }
  }
}

await server.close();
console.log(
  JSON.stringify({ ok: missing === 0, samples: INDUSTRIES.length, people, listed, missing }),
);
if (missing > 0) process.exitCode = 1;
