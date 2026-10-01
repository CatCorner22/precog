/**
 * The process the side panel describes: the selected one, else the first on
 * the map. Undefined when nothing is selected or the map has no processes
 * left, as right after the owner deletes the last one and before the
 * selection is cleared.
 */
export function shownProcess<T extends { id: string }>(
  processes: readonly T[],
  processId: string | null | undefined,
): T | undefined {
  if (!processId) return undefined;
  return processes.find((p) => p.id === processId) ?? processes[0];
}
