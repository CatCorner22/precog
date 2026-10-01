import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { ChangesView } from "@/components/precog/builder/changes-view";
import { diffMaps } from "@/lib/precog/builder/diff";
import { formatDayTime } from "@/lib/precog/dates";
import type { MapVersion } from "@/lib/precog/practice-profile";
import { count } from "@/lib/precog/text";
import type { Person, ProcessNode } from "@/lib/precog/types";
import { cn } from "@/lib/utils";

/** The map's saved versions: health then and now, changes since, compare, restore or delete. */
export function VersionsPanel({
  versions,
  current,
  onRestore,
  onDelete,
  onSelectProcess,
}: {
  versions: MapVersion[];
  current: { processes: ProcessNode[]; people: Person[]; health: number };
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onSelectProcess: (id: string) => void;
}) {
  const [compareId, setCompareId] = useState<string | null>(null);
  const compare = versions.find((v) => v.id === compareId) ?? null;
  const { processes, people } = current;
  // Diffs are counted once per map change, not on every render.
  const changesSince = useMemo(
    () =>
      new Map(
        versions.map((v) => [
          v.id,
          diffMaps({ processes: v.processes, people: v.people }, { processes, people }).total,
        ]),
      ),
    [versions, processes, people],
  );
  const against = useMemo(
    () => compare && { processes: compare.processes, people: compare.people },
    [compare],
  );

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-xs">
      <p className="text-muted">
        Saved versions of your map. Compare one to see what changed, or restore it (Ctrl+Z undoes a
        restore, but not a deletion).
      </p>
      <ul className="space-y-1">
        {versions.map((v) => {
          const delta = current.health - v.healthScore;
          const changes = changesSince.get(v.id) ?? 0;
          return (
            <li
              key={v.id}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-elevated px-2 py-1.5",
                compareId === v.id ? "border-primary/50" : "border-border",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg">{v.name}</p>
                <p className="text-xs text-subtle">
                  {formatDayTime(v.createdAt)} · health {v.healthScore}
                  {delta !== 0 && (
                    <span className={delta > 0 ? "text-ok" : "text-danger"}>
                      {" "}
                      ({delta > 0 ? "+" : ""}
                      {delta} now)
                    </span>
                  )}{" "}
                  · {count(v.processes.length, "process", "processes")} · {count(changes, "change")}{" "}
                  since
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareId(compareId === v.id ? null : v.id)}
                className="text-xs text-primary hover:underline"
              >
                {compareId === v.id ? "Hide" : "Compare"}
              </button>
              <button
                type="button"
                onClick={() => onRestore(v.id)}
                className="text-xs text-primary hover:underline"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => onDelete(v.id)}
                className="text-subtle hover:text-danger"
                aria-label={`Delete version ${v.name}`}
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          );
        })}
      </ul>
      {compare && against && (
        <ChangesView
          processes={processes}
          people={people}
          onSelectProcess={onSelectProcess}
          against={against}
          label={`"${compare.name}"`}
        />
      )}
    </div>
  );
}
