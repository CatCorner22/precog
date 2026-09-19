import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { runStressTests, type StressKind, type StressResult } from "@/lib/precog/builder/stress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight, Siren, ShieldOff, UserMinus, Users, Clock } from "lucide-react";

const KIND_META: Record<StressKind, { label: string; icon: typeof Siren }> = {
  person: { label: "Key person", icon: UserMinus },
  control: { label: "Control fails", icon: ShieldOff },
  evidence_lapse: { label: "Reviews lapse", icon: Clock },
  team_shrink: { label: "Team shrinks", icon: Users },
};

function sevTone(s: number) {
  if (s >= 60) return "danger" as const;
  if (s >= 30) return "warn" as const;
  return "ok" as const;
}

/** Dashboard card: what happens to the scores if something breaks. */
export function StressTestsCard({ onOpenBuilder }: { onOpenBuilder: () => void }) {
  const { profile, templateRevision } = usePractice();
  const tpl = useTemplate();
  const [filter, setFilter] = useState<StressKind | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  const results = useMemo(
    () => runStressTests({ staff: profile.staff, tests: profile.controlTests ?? [], layout: profile.mapLayout ?? {} }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, tpl.processes, tpl.people, templateRevision],
  );
  const shown = (filter === "all" ? results : results.filter((r) => r.kind === filter)).slice(0, 8);
  const worst = results[0];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Siren className="size-4 text-danger" />
          Stress tests
        </CardTitle>
        <CardDescription>
          What the scores look like if something breaks — nothing here changes your map. Worst first.
          {worst && (
            <>
              {" "}
              Biggest exposure: <span className="font-medium text-fg">{worst.label}</span> ({worst.healthDelta} health).
            </>
          )}
        </CardDescription>
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${results.length})`} />
          {(Object.keys(KIND_META) as StressKind[]).map((k) => {
            const n = results.filter((r) => r.kind === k).length;
            return n ? <Chip key={k} active={filter === k} onClick={() => setFilter(k)} label={`${KIND_META[k].label} (${n})`} /> : null;
          })}
        </div>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <p className="text-sm text-muted">
            Assign owners and controls to your processes and the stress tests will have something to break.{" "}
            <button type="button" onClick={onOpenBuilder} className="text-primary hover:underline">
              Open the builder
            </button>
          </p>
        ) : (
          <ul className="space-y-1">
            {shown.map((r) => {
              const Icon = KIND_META[r.kind].icon;
              const expanded = open === r.id;
              return (
                <li key={r.id} className="rounded-md border border-border bg-elevated">
                  <button type="button" onClick={() => setOpen(expanded ? null : r.id)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs">
                    <ChevronRight className={cn("size-3 shrink-0 text-subtle transition-transform", expanded && "rotate-90")} />
                    <Icon className="size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">{r.label}</span>
                      <span className="block truncate text-[10px] text-subtle">{r.detail}</span>
                    </span>
                    <Delta before={r.before.health} after={r.after.health} label="health" />
                    <Badge variant={sevTone(r.severity)}>{r.severity}</Badge>
                  </button>
                  {expanded && (
                    <div className="grid gap-2 border-t border-border px-2.5 py-2 text-[11px] sm:grid-cols-4">
                      <Stat label="Health" before={r.before.health} after={r.after.health} />
                      <Stat label="Hot processes" before={r.before.hot} after={r.after.hot} invert />
                      <Stat label="Unowned" before={r.before.unowned} after={r.after.unowned} invert />
                      <Stat label="Operating" before={r.before.operating} after={r.after.operating} />
                      <p className="text-muted sm:col-span-4">
                        Affects: {r.affectedProcesses.slice(0, 6).join(", ")}
                        {r.affectedProcesses.length > 6 ? ` +${r.affectedProcesses.length - 6}` : ""}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Delta({ before, after, label }: { before: number; after: number; label: string }) {
  const d = after - before;
  return (
    <span className={cn("hidden w-24 shrink-0 text-right text-[11px] tabular sm:inline", d < 0 ? "text-danger" : d > 0 ? "text-ok" : "text-subtle")} title={`${label} ${before} → ${after}`}>
      {before} → {after}
    </span>
  );
}

function Stat({ label, before, after, invert }: { label: string; before: number | null; after: number | null; invert?: boolean }) {
  const d = before !== null && after !== null ? after - before : null;
  const bad = d !== null && (invert ? d > 0 : d < 0);
  return (
    <div className="rounded border border-border bg-panel px-2 py-1.5">
      <p className="text-[10px] tracking-wide text-subtle uppercase">{label}</p>
      <p className="tabular">
        <span className="text-muted">{before ?? "—"}</span> <span className="text-subtle">→</span>{" "}
        <span className={cn("font-semibold", bad ? "text-danger" : "text-fg")}>{after ?? "—"}</span>
      </p>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-md border px-2 py-0.5 text-[11px]", active ? "border-primary/50 bg-primary/15 text-fg" : "border-border bg-elevated text-muted hover:text-fg")}>
      {label}
    </button>
  );
}

export type { StressResult };
