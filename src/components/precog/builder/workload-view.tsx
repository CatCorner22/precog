import { casesForSodRules } from "@/lib/precog/evidence";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { LOAD_BANDS, type PersonWorkload } from "@/lib/precog/builder/what-if";
import { ChevronRight } from "lucide-react";

export function WorkloadView({
  rows,
  processCount,
  onSelectProcess,
  onReassign,
}: {
  rows: PersonWorkload[];
  processCount: number;
  onSelectProcess: (id: string) => void;
  onReassign: (fromPersonId: string, processId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(rows[0]?.person.id ?? null);
  const overloaded = rows.filter((r) => r.load >= LOAD_BANDS.overburdened).length;
  const idle = rows.filter((r) => !r.ownedProcesses.length).length;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <p className="text-xs text-muted">
        Who carries the risk. {overloaded ? `${overloaded} overburdened · ` : ""}
        {idle ? `${idle} with no processes · ` : ""}
        {processCount} processes across {rows.length} people.
      </p>
      <ul className="space-y-1">
        {rows.map((r) => {
          const expanded = open === r.person.id;
          const loadColor =
            r.load >= LOAD_BANDS.overburdened
              ? "var(--color-danger)"
              : r.load >= LOAD_BANDS.elevated
                ? "var(--color-warn)"
                : "var(--color-ok)";
          return (
            <li key={r.person.id} className="rounded-md border border-border bg-elevated">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.person.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
              >
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 text-subtle transition-transform",
                    expanded && "rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <span className="font-medium text-fg">{r.person.name}</span>
                    <span className="text-subtle"> · {r.person.role}</span>
                  </span>
                  <span className="block text-xs text-subtle">
                    {r.ownedProcesses.length} proc · {r.entitlementCount} duties
                    {r.criticalConflicts ? ` · ${r.criticalConflicts} critical SoD` : ""}
                  </span>
                </span>
                <span className="flex w-20 shrink-0 items-center gap-1.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${r.load}%`, background: loadColor }}
                    />
                  </span>
                  <span className="w-6 text-right tabular text-subtle">{r.load}</span>
                </span>
              </button>
              {expanded && (
                <div className="space-y-1.5 border-t border-border px-2 py-1.5 text-xs">
                  {r.flags.length > 0 && (
                    <ul className="flex flex-wrap gap-1">
                      {r.flags.map((f) => (
                        <li
                          key={f}
                          className="rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-xs text-fg"
                        >
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.ownedProcesses.length > 0 ? (
                    <ul className="space-y-0.5">
                      {r.ownedProcesses.map((p) => (
                        <li key={p.id} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectProcess(p.id)}
                            className="min-w-0 flex-1 truncate text-left text-fg hover:underline"
                          >
                            {p.name}
                          </button>
                          {r.load >= LOAD_BANDS.overburdened && (
                            <button
                              type="button"
                              onClick={() => onReassign(r.person.id, p.id)}
                              className="shrink-0 text-xs text-primary hover:underline"
                              title="Move to the next best owner"
                            >
                              Reassign
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-subtle">Owns no processes.</p>
                  )}
                  {r.conflicts.length > 0 && (
                    <ul className="space-y-0.5 text-subtle">
                      {r.conflicts.slice(0, 2).map((c) => {
                        // The count is the library's, not a rate: how many
                        // prosecuted cases involve this same pairing of duties.
                        const n = casesForSodRules([c.ruleId]).length;
                        return (
                          <li key={c.ruleId}>
                            Can both {c.labelA.toLowerCase()} and {c.labelB.toLowerCase()}
                            {n > 0 ? ` — ${n} prosecuted ${n === 1 ? "case" : "cases"}` : ""}
                          </li>
                        );
                      })}
                      {r.conflicts.length > 2 && <li>+{r.conflicts.length - 2} more</li>}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
