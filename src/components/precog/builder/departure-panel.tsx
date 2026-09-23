import { RISK_SCALE } from "@/lib/precog/scoring/bands";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { ChevronRight } from "lucide-react";

import { busFactor, type DepartureImpact } from "@/lib/precog/builder/departure";

import { labelCls } from "@/components/precog/builder/form-shared";
export function DeparturePanel({
  impacts,
  onSelectProcess,
  onAddBackup,
}: {
  impacts: DepartureImpact[];
  onSelectProcess: (id: string) => void;
  onAddBackup: (processId: string, excludePersonId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(impacts[0]?.person.id ?? null);
  const bus = busFactor(impacts);
  const impactColor = (v: number) =>
    v >= RISK_SCALE.actNow
      ? "var(--color-danger)"
      : v >= RISK_SCALE.mitigate
        ? "var(--color-warn)"
        : "var(--color-ok)";

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-xs">
      <p className="text-muted">
        If one person left tomorrow, what breaks?{" "}
        <span className="font-medium text-fg">
          {bus} of {impacts.length}
        </span>{" "}
        people would orphan a process or critical knowledge.
      </p>
      <ul className="space-y-1">
        {impacts.map((d) => {
          const expanded = open === d.person.id;
          return (
            <li key={d.person.id} className="rounded-md border border-border bg-elevated">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : d.person.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
              >
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 text-subtle transition-transform",
                    expanded && "rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <span className="font-medium text-fg">{d.person.name}</span>
                    <span className="text-subtle"> · {d.person.role}</span>
                  </span>
                  <span className="block text-xs text-subtle">
                    {d.orphanedProcesses.length} process(es) orphaned · {d.orphanedKnowledge.length}{" "}
                    knowledge · health{" "}
                    {d.healthDelta === 0
                      ? "±0"
                      : d.healthDelta > 0
                        ? `+${d.healthDelta}`
                        : d.healthDelta}
                  </span>
                </span>
                <span className="flex w-20 shrink-0 items-center gap-1.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${d.impact}%`, background: impactColor(d.impact) }}
                    />
                  </span>
                  <span className="w-6 text-right tabular text-subtle">{d.impact}</span>
                </span>
              </button>
              {expanded && (
                <div className="space-y-1.5 border-t border-border px-2 py-1.5">
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
                              onClick={() => onAddBackup(p.id, d.person.id)}
                              className="shrink-0 text-xs text-primary hover:underline"
                            >
                              Add backup
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
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
