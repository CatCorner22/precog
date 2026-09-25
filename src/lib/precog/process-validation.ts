import type { Person, ProcessNode } from "./types";
import { processDocumentationState } from "./process-record";

/** What is wrong with a process map: broken references, cycles, gaps the engines cannot read past. */
export interface MapValidationIssue {
  id: string;
  severity: "error" | "warn" | "info";
  message: string;
  processId?: string;
}

function detectDependencyCycle(processes: ProcessNode[]): string[] | null {
  const ids = new Set(processes.map((p) => p.id));
  const deps = new Map<string, string[]>();
  for (const p of processes) {
    deps.set(
      p.id,
      p.dependencies.filter((d) => ids.has(d)),
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cyclePath: string[] | null = null;

  function dfs(id: string, path: string[]): boolean {
    if (visiting.has(id)) {
      const idx = path.indexOf(id);
      cyclePath = [...path.slice(idx), id];
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of deps.get(id) ?? []) {
      if (dfs(dep, [...path, id])) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const p of processes) {
    if (dfs(p.id, [])) return cyclePath;
  }
  return null;
}

export function validateProcessMap(
  processes: ProcessNode[],
  people: Person[],
  controlIds: Set<string>,
  mapLayout: Record<string, { x: number; y: number }> = {},
): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const ids = new Set(processes.map((p) => p.id));
  const personIds = new Set(people.map((p) => p.id));
  const activeIds = new Set(people.filter((p) => p.active).map((p) => p.id));

  const cycle = detectDependencyCycle(processes);
  if (cycle?.length) {
    issues.push({
      id: "cycle",
      severity: "error",
      message: `Dependency cycle detected: ${cycle.map((id) => processes.find((p) => p.id === id)?.name ?? id).join(" → ")}`,
    });
  }

  for (const p of processes) {
    for (const dep of p.dependencies) {
      if (!ids.has(dep)) {
        issues.push({
          id: `dep-${p.id}-${dep}`,
          severity: "error",
          message: `"${p.name}" depends on missing process "${dep}"`,
          processId: p.id,
        });
      }
    }
    for (const cid of p.controlIds) {
      if (!controlIds.has(cid)) {
        issues.push({
          id: `ctrl-${p.id}-${cid}`,
          severity: "warn",
          message: `"${p.name}" references unknown control "${cid}"`,
          processId: p.id,
        });
      }
    }
    if (!(p.ownerPersonIds ?? []).length) {
      issues.push({
        id: `owner-${p.id}`,
        severity: "warn",
        message: `"${p.name}" has no owner assigned`,
        processId: p.id,
      });
    } else {
      for (const oid of p.ownerPersonIds ?? []) {
        if (!personIds.has(oid)) {
          issues.push({
            id: `owner-ref-${p.id}-${oid}`,
            severity: "error",
            message: `"${p.name}" owner "${oid}" is not on the team`,
            processId: p.id,
          });
        }
      }
      const owners = (p.ownerPersonIds ?? []).filter((oid) => personIds.has(oid));
      if (owners.length > 0 && !owners.some((oid) => activeIds.has(oid))) {
        const names = owners.map((oid) => people.find((x) => x.id === oid)?.name ?? oid);
        issues.push({
          id: `owner-left-${p.id}`,
          severity: "warn",
          message: `"${p.name}" has no owner left on the team — ${names.join(", ")} ${owners.length === 1 ? "has" : "have"} left; name a new owner`,
          processId: p.id,
        });
      }
    }
    if (p.controlIds.length === 0 && (p.risks ?? []).some((r) => r.kind === "fraud")) {
      issues.push({
        id: `fraud-nocontrol-${p.id}`,
        severity: "warn",
        message: `"${p.name}" has fraud risks but no controls mapped`,
        processId: p.id,
      });
    }
    // Documentation is scored in its own health dimension, so this stays "info"
    // and does not double-count against integrity. One issue per process keeps
    // the Validate panel readable on an unedited template.
    const docState = processDocumentationState(p);
    const missing: string[] = [];
    if (docState === "none") missing.push("no written procedure a stand-in could follow");
    else if (docState === "unlocated")
      missing.push("procedure exists but nobody recorded where it lives");
    if (!p.cadence) missing.push("no cadence, so the continuity view cannot say when it stops");
    if (missing.length) {
      issues.push({
        id: `record-${p.id}`,
        severity: "info",
        message: `"${p.name}": ${missing.join("; ")}`,
        processId: p.id,
      });
    }
  }

  for (const key of Object.keys(mapLayout)) {
    if (!ids.has(key)) {
      issues.push({
        id: `layout-${key}`,
        severity: "info",
        message: `Saved layout position for removed process "${key}"`,
      });
    }
  }

  return issues;
}
