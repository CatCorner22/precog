import { ChangesView } from "@/components/precog/builder/changes-view";

import { useState } from "react";

import type { ProcessNode } from "@/lib/precog/types";

import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { Person } from "@/lib/precog/types";

import { diffMaps } from "@/lib/precog/builder/diff";

import type { MapVersion } from "@/lib/precog/practice-profile";

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

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-xs">
      <p className="text-muted">
        Saved snapshots of your map. Compare to see what changed, or restore (undoable).
      </p>
      <ul className="space-y-1">
        {versions.map((v) => {
          const delta = current.health - v.healthScore;
          const d = diffMaps({ processes: v.processes, people: v.people }, current);
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
                  {new Date(v.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · health {v.healthScore}
                  {delta !== 0 && (
                    <span className={delta > 0 ? "text-ok" : "text-danger"}>
                      {" "}
                      ({delta > 0 ? "+" : ""}
                      {delta} now)
                    </span>
                  )}{" "}
                  · {v.processes.length} proc · {d.total} change{d.total === 1 ? "" : "s"} since
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
                aria-label={`Delete ${v.name}`}
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          );
        })}
      </ul>
      {compare && (
        <ChangesView
          processes={current.processes}
          people={current.people}
          onSelectProcess={onSelectProcess}
          against={{ processes: compare.processes, people: compare.people }}
          label={`"${compare.name}"`}
        />
      )}
    </div>
  );
}
