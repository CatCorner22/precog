import type { ProcessNode } from "../types";

export const MAP_RECORD_LIMIT = 500;
export type MapLevel = "domain" | "process" | "step";
export type FlowKind = "sequence" | "handoff" | "rework";
export interface MapRecord extends ProcessNode {
  nodeLevel?: MapLevel;
  parentProcessId?: string;
  mapOrder?: number;
  flowLinks?: { targetId: string; kind: FlowKind }[];
  assessmentStatus?: "suggested" | "confirmed";
}
export const levelOf = (p: ProcessNode): MapLevel => (p as MapRecord).nodeLevel ?? "process";

export function indexHierarchy(records: readonly MapRecord[]) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const children = new Map<string, MapRecord[]>();
  for (const record of records) {
    const key = record.parentProcessId ?? "";
    const list = children.get(key) ?? [];
    list.push(record);
    children.set(key, list);
  }
  for (const list of children.values()) list.sort((a, b) => (a.mapOrder ?? a.stage ?? 0) - (b.mapOrder ?? b.stage ?? 0) || a.name.localeCompare(b.name));
  return { byId, children };
}

export function validateHierarchy(records: readonly MapRecord[]): string[] {
  const errors: string[] = [];
  if (records.length > MAP_RECORD_LIMIT) errors.push(`Maximum ${MAP_RECORD_LIMIT} records; nothing may be silently truncated.`);
  const { byId } = indexHierarchy(records);
  if (byId.size !== records.length) errors.push("Duplicate record identifiers.");
  for (const record of records) {
    const parent = record.parentProcessId ? byId.get(record.parentProcessId) : undefined;
    if (record.parentProcessId && !parent) errors.push(`Missing parent for ${record.name}.`);
    if (levelOf(record) === "domain" && parent) errors.push("Domains must be top-level groups.");
    if (levelOf(record) === "process" && parent && levelOf(parent) !== "domain") errors.push("A process may belong only to a domain.");
    if (levelOf(record) === "step" && (!parent || levelOf(parent) !== "process")) errors.push("A step must belong to a process.");
    const seen = new Set([record.id]);
    let cursor = parent;
    while (cursor) {
      if (seen.has(cursor.id)) { errors.push(`Containment cycle involving ${record.name}.`); break; }
      seen.add(cursor.id);
      cursor = cursor.parentProcessId ? byId.get(cursor.parentProcessId) : undefined;
    }
    for (const target of record.dependencies) if (!byId.has(target) || target === record.id) errors.push(`Invalid dependency for ${record.name}.`);
    for (const link of record.flowLinks ?? []) {
      if (!byId.has(link.targetId) || link.targetId === record.id) errors.push(`Invalid flow link for ${record.name}.`);
    }
  }
  return [...new Set(errors)];
}

export function descendantIds(records: readonly MapRecord[], id: string): Set<string> {
  const { children } = indexHierarchy(records);
  const found = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (next.id === id || found.has(next.id)) continue;
    found.add(next.id);
    stack.push(...(children.get(next.id) ?? []));
  }
  return found;
}

export function outline(records: readonly MapRecord[], collapsed: ReadonlySet<string> = new Set()) {
  const { children } = indexHierarchy(records);
  const seen = new Set<string>();
  const rows: { record: MapRecord; depth: number; hasChildren: boolean }[] = [];
  const visit = (record: MapRecord, depth: number) => {
    if (seen.has(record.id)) return;
    seen.add(record.id);
    const nested = children.get(record.id) ?? [];
    rows.push({ record, depth, hasChildren: nested.length > 0 });
    if (collapsed.has(record.id)) {
      for (const id of descendantIds(records, record.id)) seen.add(id);
    } else for (const child of nested) visit(child, depth + 1);
  };
  for (const root of children.get("") ?? []) visit(root, 0);
  // Corrupted/orphan records remain visible for repair instead of disappearing.
  for (const record of records) if (!seen.has(record.id)) visit(record, 0);
  return rows;
}

export function removeSubtree(records: readonly MapRecord[], id: string): MapRecord[] {
  const removed = descendantIds(records, id);
  removed.add(id);
  return records.filter((p) => !removed.has(p.id)).map((p) => ({
    ...p,
    dependencies: p.dependencies.filter((target) => !removed.has(target)),
    flowLinks: p.flowLinks?.filter((link) => !removed.has(link.targetId)),
  }));
}

export function moveSibling(records: readonly MapRecord[], id: string, direction: -1 | 1): MapRecord[] {
  const { byId, children } = indexHierarchy(records);
  const record = byId.get(id);
  if (!record) return [...records];
  const siblings = [...(children.get(record.parentProcessId ?? "") ?? [])];
  const index = siblings.findIndex((p) => p.id === id);
  const other = index + direction;
  if (other < 0 || other >= siblings.length) return [...records];
  [siblings[index], siblings[other]] = [siblings[other], siblings[index]];
  const order = new Map(siblings.map((p, i) => [p.id, i]));
  return records.map((p) => order.has(p.id) ? { ...p, mapOrder: order.get(p.id) } : p);
}

export function uniqueSummary(records: readonly MapRecord[], id: string) {
  const included = descendantIds(records, id);
  included.add(id);
  const controls = new Set<string>(), risks = new Set<string>(), scenarios = new Set<string>();
  for (const record of records) {
    if (!included.has(record.id)) continue;
    for (const control of record.controlIds) controls.add(control);
    for (const risk of record.risks ?? []) {
      risks.add(risk.id);
      if (risk.linkedScenarioId) scenarios.add(risk.linkedScenarioId);
    }
  }
  return { records: included.size, controls: controls.size, risks: risks.size, scenarios: scenarios.size };
}
