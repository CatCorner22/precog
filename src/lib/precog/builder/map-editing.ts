import type { ProcessNode } from "../types";

type Link = { source: string; target: string };

/** Index visible nodes once; geometry changes do not change edge membership. */
export function edgesWithinNodes<T extends Link>(
  edges: readonly T[],
  nodes: readonly { id: string }[],
): T[] {
  const ids = new Set(nodes.map((node) => node.id));
  return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
}

/** One bulk deletion is one immutable edit and one undo entry. */
export function removeProcessDependencies(
  processes: ProcessNode[],
  links: readonly Link[],
): ProcessNode[] {
  const removed = new Map<string, Set<string>>();
  for (const { source, target } of links) {
    const sources = removed.get(target) ?? new Set<string>();
    sources.add(source);
    removed.set(target, sources);
  }
  let changed = false;
  const next = processes.map((process) => {
    const sources = removed.get(process.id);
    if (!sources || !process.dependencies.some((id) => sources.has(id))) return process;
    changed = true;
    return { ...process, dependencies: process.dependencies.filter((id) => !sources.has(id)) };
  });
  return changed ? next : processes;
}

/** Validate semantic edits too, not just canvas gestures. Rework loops remain legal. */
export function connectProcessDependency(
  processes: ProcessNode[],
  source: string,
  target: string,
): ProcessNode[] {
  if (source === target || !processes.some((p) => p.id === source)) return processes;
  const destination = processes.find((p) => p.id === target);
  if (!destination || destination.dependencies.includes(source)) return processes;
  return processes.map((p) =>
    p.id === target ? { ...p, dependencies: [...p.dependencies, source] } : p,
  );
}
