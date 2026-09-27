import { useState } from "react";

import { IndexBasis } from "@/components/precog/index-basis";
import { IndexColumnCaption, RankedRow } from "@/components/precog/builder/ranked-row";
import { LOAD_BANDS, type PersonWorkload } from "@/lib/precog/builder/workload";
import { casesForSodRules } from "@/lib/precog/evidence";
import { count } from "@/lib/precog/text";

/** Workload: who carries the processes, duties and conflicts, ranked by the load index. */
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
      <IndexColumnCaption label="Load index" basis={LOAD_BASIS} />
      <ul className="space-y-1">
        {rows.map((r) => {
          const expanded = open === r.person.id;
          return (
            <RankedRow
              key={r.person.id}
              name={r.person.name}
              role={r.person.role}
              summary={`${count(r.ownedProcesses.length, "process", "processes")} · ${count(r.entitlementCount, "duty", "duties")}${
                r.criticalConflicts
                  ? ` · ${count(r.criticalConflicts, "critical duty conflict")}`
                  : ""
              }`}
              value={r.load}
              valueLabel="Load index"
              color={loadColor(r.load)}
              expanded={expanded}
              onToggle={() => setOpen(expanded ? null : r.person.id)}
            >
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
                        {n > 0 ? ` — ${count(n, "prosecuted case")}` : ""}
                      </li>
                    );
                  })}
                  {r.conflicts.length > 2 && <li>+{r.conflicts.length - 2} more</li>}
                </ul>
              )}
            </RankedRow>
          );
        })}
      </ul>
      <IndexBasis />
    </div>
  );
}

function loadColor(load: number): string {
  if (load >= LOAD_BANDS.overburdened) return "var(--color-danger)";
  if (load >= LOAD_BANDS.elevated) return "var(--color-warn)";
  return "var(--color-ok)";
}

const LOAD_BASIS =
  "Load index, 0–100: this app's weighting of each person's share of process ownership, their number of duties, critical duty conflicts, knowledge only they hold, and hot processes they own. It orders attention; it is not a measurement.";
