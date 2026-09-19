/**
 * Stress tests — how the business scores if something breaks. Pure what-if:
 * every scenario computes on a copy via `withTemplateOverrides` and leaves the
 * live map untouched.
 */
import { getActiveTemplate, getBaseTemplate, withTemplateOverrides } from "../active-template";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap, type MapHealthReport } from "../process-graph";
import { getAppetite } from "../appetite";
import { summarizeEffectiveness } from "./effectiveness";
import type { ControlTestRecord } from "./test-plan";
import type { ControlItem, Person, ProcessNode, StaffComposition } from "../types";

export type StressKind = "person" | "control" | "evidence_lapse" | "team_shrink";

export interface StressResult {
  kind: StressKind;
  id: string;
  label: string;
  detail: string;
  before: { health: number; hot: number; operating: number | null; unowned: number };
  after: { health: number; hot: number; operating: number | null; unowned: number };
  healthDelta: number;
  /** 0–100: how bad this scenario is for the business. */
  severity: number;
  affectedProcesses: string[];
}

function scoreNow(
  processes: ProcessNode[],
  people: Person[] | null,
  staff: StaffComposition,
  controls: ControlItem[],
  tests: ControlTestRecord[],
  layout: Record<string, { x: number; y: number }>,
) {
  return withTemplateOverrides({ processes, people }, (tpl) => {
    const { snapshots } = buildProcessMapGraph(staff);
    const issues = validateProcessMap(processes, tpl.people, new Set(controls.map((c) => c.id)), layout);
    const health = computeMapHealth(snapshots, issues, { customized: true });
    const eff = summarizeEffectiveness(controls, processes, Date.now(), tests);
    return {
      health,
      hot: snapshots.filter((s) => s.heat >= getAppetite().hotHeat).length,
      operating: eff.avgOperating,
      unowned: snapshots.filter((s) => !s.owners.length).length,
    };
  });
}

function pack(kind: StressKind, id: string, label: string, detail: string, before: ReturnType<typeof scoreNow>, after: ReturnType<typeof scoreNow>, affected: string[]): StressResult {
  const healthDelta = after.health.score - before.health.score;
  const opDrop = before.operating !== null && after.operating !== null ? before.operating - after.operating : 0;
  const severity = Math.min(
    100,
    Math.round(Math.max(0, -healthDelta) * 2.5 + (after.hot - before.hot) * 8 + (after.unowned - before.unowned) * 6 + opDrop * 0.5),
  );
  return {
    kind,
    id,
    label,
    detail,
    before: { health: before.health.score, hot: before.hot, operating: before.operating, unowned: before.unowned },
    after: { health: after.health.score, hot: after.hot, operating: after.operating, unowned: after.unowned },
    healthDelta,
    severity,
    affectedProcesses: affected,
  };
}

export interface StressInput {
  staff: StaffComposition;
  tests: ControlTestRecord[];
  layout: Record<string, { x: number; y: number }>;
}

/** Every stress scenario, worst first. */
export function runStressTests(input: StressInput): StressResult[] {
  const tpl = getActiveTemplate();
  const processes = tpl.processes;
  const people = tpl.people;
  const controls = tpl.controls;
  const before = scoreNow(processes, people, input.staff, controls, input.tests, input.layout);
  const out: StressResult[] = [];

  // Key person leaves
  for (const person of people.filter((p) => p.active)) {
    const nextPeople = people.filter((p) => p.id !== person.id);
    const nextProcesses = processes.map((p) => ({ ...p, ownerPersonIds: (p.ownerPersonIds ?? []).filter((id) => id !== person.id) }));
    const affected = processes.filter((p) => (p.ownerPersonIds ?? []).includes(person.id)).map((p) => p.name);
    if (!affected.length) continue;
    const after = scoreNow(nextProcesses, nextPeople, input.staff, controls, input.tests, input.layout);
    out.push(pack("person", `person-${person.id}`, `${person.name} leaves`, `${person.role} · owns ${affected.length} process(es)`, before, after, affected));
  }

  // A control fails (removed from every process)
  for (const control of controls) {
    const affected = processes.filter((p) => p.controlIds.includes(control.id)).map((p) => p.name);
    if (!affected.length) continue;
    const nextProcesses = processes.map((p) => ({ ...p, controlIds: p.controlIds.filter((id) => id !== control.id) }));
    const after = scoreNow(nextProcesses, people, input.staff, controls, input.tests, input.layout);
    out.push(pack("control", `control-${control.id}`, `"${control.name}" stops operating`, `Covers ${affected.length} process(es)`, before, after, affected));
  }

  // Evidence lapses: nothing reviewed for two full cycles
  const anyEvidence = processes.some((p) => (p.evidence ?? []).length);
  if (anyEvidence) {
    const nextProcesses = processes.map((p) => ({
      ...p,
      evidence: (p.evidence ?? []).map((e) => ({
        ...e,
        lastDoneAt: e.lastDoneAt ? new Date(new Date(e.lastDoneAt).getTime() - 400 * 86_400_000).toISOString() : e.lastDoneAt,
      })),
    }));
    const after = scoreNow(nextProcesses, people, input.staff, controls, [], input.layout);
    out.push(
      pack(
        "evidence_lapse",
        "evidence-lapse",
        "Reviews stop for a year",
        "Every evidence item overdue; recorded tests treated as stale",
        before,
        after,
        processes.filter((p) => (p.evidence ?? []).length).map((p) => p.name),
      ),
    );
  }

  // Team shrinks: the two shortest-tenure people leave together
  const byTenure = [...people.filter((p) => p.active)].sort((a, b) => a.tenureYears - b.tenureYears).slice(0, 2);
  if (byTenure.length === 2 && people.length > 3) {
    const ids = new Set(byTenure.map((p) => p.id));
    const nextPeople = people.filter((p) => !ids.has(p.id));
    const nextProcesses = processes.map((p) => ({ ...p, ownerPersonIds: (p.ownerPersonIds ?? []).filter((id) => !ids.has(id)) }));
    const affected = processes.filter((p) => (p.ownerPersonIds ?? []).some((id) => ids.has(id))).map((p) => p.name);
    const after = scoreNow(nextProcesses, nextPeople, input.staff, controls, input.tests, input.layout);
    out.push(pack("team_shrink", "team-shrink", `${byTenure.map((p) => p.name.split(" ")[0]).join(" and ")} both leave`, "Two newest hires exit in the same quarter", before, after, affected));
  }

  return out.sort((a, b) => b.severity - a.severity || a.healthDelta - b.healthDelta);
}

/** Health of the untouched industry template with its demo staff — the benchmark line. */
export function templateBaselineHealth(): MapHealthReport {
  const base = getBaseTemplate();
  return withTemplateOverrides({ processes: null, people: null }, (tpl) => {
    const { snapshots } = buildProcessMapGraph(base.staffComposition);
    const issues = validateProcessMap(tpl.processes, tpl.people, new Set(tpl.controls.map((c) => c.id)), {});
    return computeMapHealth(snapshots, issues, { customized: false });
  });
}
