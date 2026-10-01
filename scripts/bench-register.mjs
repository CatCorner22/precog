#!/usr/bin/env node
/** Rough register CPU check: weekly plan + coverage at scale. */
import { performance } from "node:perf_hooks";
import { getIndustryTemplate } from "../src/lib/precog/templates/index.ts";
import { buildWeeklyActions } from "../src/lib/precog/weekly-actions/build.ts";
import { coverageReport } from "../src/lib/precog/continuity/coverage.ts";

const sizes = [
  { people: 30, items: 150 },
  { people: 35, items: 200 },
  { people: 60, items: 300 },
];

const tpl = getIndustryTemplate("dental");

for (const { people, items } of sizes) {
  const team = tpl.people.slice(0, people);
  const knowledge = tpl.knowledge.slice(0, items);
  const scaled = { ...tpl, people: team, knowledge };
  const t0 = performance.now();
  coverageReport(scaled);
  buildWeeklyActions({
    tpl: scaled,
    staff: tpl.staffComposition,
    dualRelease: { enabled: false, rules: {} },
  });
  const ms = Math.round(performance.now() - t0);
  console.log(`${people} people × ${items} items: ${ms} ms`);
}
