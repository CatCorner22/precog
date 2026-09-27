import { useState } from "react";

import { labelCls } from "@/components/ui/field-classes";
import { IndexBasis } from "@/components/precog/index-basis";
import { IndexColumnCaption, RankedRow } from "@/components/precog/builder/ranked-row";
import { busFactor, type DepartureImpact } from "@/lib/precog/builder/departure";
import { RISK_SCALE } from "@/lib/precog/scoring/bands";
import { count } from "@/lib/precog/text";
import { cn } from "@/lib/utils";

/**
 * Bus factor: for each person, what breaks if they left tomorrow, ranked by
 * the departure impact index, with a one-click stand-in for each process
 * that would lose its only owner.
 */
export function DeparturePanel({
  impacts,
  onSelectProcess,
  onAddStandIn,
}: {
  impacts: DepartureImpact[];
  onSelectProcess: (id: string) => void;
  onAddStandIn: (processId: string, leavingPersonId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(impacts[0]?.person.id ?? null);
  const bus = busFactor(impacts);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-xs">
      <p className="text-muted">
        If one person left tomorrow, what breaks?{" "}
        <span className="font-medium text-fg">
          {bus} of {impacts.length}
        </span>{" "}
        people would leave a process or critical knowledge with nobody.
      </p>
      <IndexColumnCaption label="Impact index" basis={IMPACT_BASIS} />
      <ul className="space-y-1">
        {impacts.map((d) => {
          const expanded = open === d.person.id;
          return (
            <RankedRow
              key={d.person.id}
              name={d.person.name}
              role={d.person.role}
              summary={`${count(d.orphanedProcesses.length, "process", "processes")} left with no owner · ${count(d.orphanedKnowledge.length, "knowledge item")} · health ${signed(d.healthDelta)}`}
              value={d.impact}
              valueLabel="Impact index"
              color={impactColor(d.impact)}
              expanded={expanded}
              onToggle={() => setOpen(expanded ? null : d.person.id)}
            >
              {d.orphanedProcesses.length > 0 && (
                <div>
                  <p className={labelCls}>Would lose their only owner</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {d.orphanedProcesses.map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectProcess(p.id)}
                          className="min-w-0 flex-1 truncate text-left text-fg hover:underline"
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddStandIn(p.id, d.person.id)}
                          className="shrink-0 text-xs text-primary hover:underline"
                          title="Add a second owner who can step in"
                        >
                          Add stand-in
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.orphanedKnowledge.length > 0 && (
                <div>
                  <p className={labelCls}>Knowledge with no other strong holder</p>
                  <ul className="mt-0.5 flex flex-wrap gap-1">
                    {d.orphanedKnowledge.map((k) => (
                      <li
                        key={k.id}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-xs",
                          k.criticality === "critical"
                            ? "border-danger/40 bg-danger/10 text-fg"
                            : "border-warn/30 bg-warn/10 text-fg",
                        )}
                      >
                        {k.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="list-disc space-y-0.5 pl-4 text-muted">
                {d.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </RankedRow>
          );
        })}
      </ul>
      <IndexBasis />
    </div>
  );
}

/** Departure impact is a higher-is-worse index, banded on the shared risk scale. */
function impactColor(value: number): string {
  if (value >= RISK_SCALE.actNow) return "var(--color-danger)";
  if (value >= RISK_SCALE.mitigate) return "var(--color-warn)";
  return "var(--color-ok)";
}

function signed(n: number): string {
  return n === 0 ? "±0" : n > 0 ? `+${n}` : String(n);
}

const IMPACT_BASIS =
  "Impact index, 0–100: this app's weighting of how far map health falls without this person, the processes left with no owner, the knowledge nobody else holds (critical items count double), and their years here. It orders attention; it is not a measurement.";
