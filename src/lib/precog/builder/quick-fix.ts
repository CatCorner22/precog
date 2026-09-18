/**
 * One-click fixes for map validation issues — pick the most plausible owner or control.
 */
import { getActiveTemplate } from "../active-template";
import { ENTITLEMENTS } from "../sod/conflict-rules";
import type { ControlItem, Person, ProcessNode } from "../types";

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
}

function overlap(a: string[], b: string[]): number {
  const set = new Set(b);
  return a.filter((t) => set.has(t)).length;
}

/** Best-guess owner: role entitlements touch this process, else most-related role, else least-loaded person. */
export function suggestOwnerForProcess(
  process: ProcessNode,
  processes: ProcessNode[],
  people: Person[],
): Person | null {
  const active = people.filter((p) => p.active);
  if (!active.length) return null;
  const { roleTemplates } = getActiveTemplate();

  const scored = active.map((p) => {
    const ents = (p.entitlements?.length ? p.entitlements : roleTemplates[p.role] ?? []) as string[];
    let score = 0;
    for (const eid of ents) {
      const e = ENTITLEMENTS.find((x) => x.id === eid);
      if (!e) continue;
      if (e.processIds.includes(process.id)) score += 10;
      score += overlap(tokens(e.label), tokens(`${process.name} ${process.description}`)) * 2;
    }
    score += overlap(tokens(p.role), tokens(process.name)) * 3;
    // Prefer people who already own upstream/downstream neighbours.
    for (const dep of process.dependencies) {
      const d = processes.find((x) => x.id === dep);
      if (d?.ownerPersonIds?.includes(p.id)) score += 2;
    }
    const load = processes.filter((x) => x.ownerPersonIds?.includes(p.id)).length;
    return { p, score, load };
  });

  scored.sort((a, b) => b.score - a.score || a.load - b.load);
  return scored[0]?.p ?? null;
}

/** Best-guess control: matches risk kinds and process name; prefers controls not yet on the process. */
export function suggestControlForProcess(
  process: ProcessNode,
  controls: ControlItem[],
): ControlItem | null {
  const available = controls.filter((c) => !process.controlIds.includes(c.id));
  if (!available.length) return null;
  const procTokens = tokens(
    `${process.name} ${process.description} ${(process.risks ?? []).map((r) => r.title).join(" ")}`,
  );
  const hasFraud = (process.risks ?? []).some((r) => r.kind === "fraud");

  const scored = available.map((c) => {
    let score = overlap(tokens(`${c.name} ${c.description}`), procTokens) * 3;
    if (hasFraud && (c.duties.includes("authorization") || c.duties.includes("reconciliation")))
      score += 2;
    if (!c.segregated) score += 1; // surfacing a gap is more useful than a green tick
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].c : available[0];
}
