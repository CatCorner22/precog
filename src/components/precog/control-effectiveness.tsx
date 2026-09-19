import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { summarizeEffectiveness, type ControlEffectiveness } from "@/lib/precog/builder/effectiveness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight, ShieldCheck } from "lucide-react";

function tone(score: number | null) {
  if (score === null) return "var(--color-border-strong)";
  if (score >= 80) return "var(--color-ok)";
  if (score >= 60) return "var(--color-primary)";
  if (score >= 40) return "var(--color-warn)";
  return "var(--color-danger)";
}

const BAND_VARIANT: Record<ControlEffectiveness["band"], "ok" | "primary" | "warn" | "danger"> = {
  strong: "ok",
  adequate: "primary",
  weak: "warn",
  failing: "danger",
};

/** Dashboard card: every control scored on design and operating effectiveness. */
export function ControlEffectivenessCard({
  onOpenProcess,
  onOpenBuilder,
}: {
  onOpenProcess: (processId: string) => void;
  onOpenBuilder: () => void;
}) {
  const { profile, templateRevision } = usePractice();
  const tpl = useTemplate();
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const summary = useMemo(
    () => summarizeEffectiveness(tpl.controls, tpl.processes),
    [tpl.controls, tpl.processes, templateRevision, profile.updatedAt],
  );
  const rows = showAll ? summary.controls : summary.controls.slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" />
              Control effectiveness
            </CardTitle>
            <CardDescription>
              Design asks &ldquo;is it built right?&rdquo; Operating asks &ldquo;does it actually run?&rdquo; —
              proven by evidence.
            </CardDescription>
          </div>
          <div className="flex gap-2 text-center">
            <Mini label="Design" value={summary.avgDesign} />
            <Mini label="Operating" value={summary.avgOperating} />
            <Mini label="Overall" value={summary.avgOverall} strong />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {summary.avgOperating === null && (
          <p className="rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[11px] text-muted">
            Operating effectiveness is unknown until controls have evidence. Add a review to a
            process in the builder and mark it done — the score fills in.
          </p>
        )}
        <ul className="space-y-1">
          {rows.map((r) => {
            const expanded = open === r.control.id;
            return (
              <li key={r.control.id} className="rounded-md border border-border bg-elevated">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : r.control.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs"
                >
                  <ChevronRight className={cn("size-3 shrink-0 text-subtle transition-transform", expanded && "rotate-90")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{r.control.name}</span>
                    <span className="block text-[10px] text-subtle">
                      {r.coveredProcesses.length} process(es)
                      {r.evidence.length ? ` · ${r.evidenceCurrent}/${r.evidence.length} evidence current` : " · no evidence"}
                    </span>
                  </span>
                  <Bar label="D" value={r.design} />
                  <Bar label="O" value={r.operating} />
                  <span className="w-8 text-right text-sm font-semibold tabular" style={{ color: tone(r.overall) }}>
                    {r.overall}
                  </span>
                  <Badge variant={BAND_VARIANT[r.band]} className="hidden sm:inline-flex">
                    {r.band}
                  </Badge>
                </button>
                {expanded && (
                  <div className="space-y-1.5 border-t border-border px-2.5 py-2 text-[11px]">
                    <p className="text-muted">{r.control.description}</p>
                    {r.notes.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-fg/90">
                        {r.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {r.coveredProcesses.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.coveredProcesses.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onOpenProcess(p.id)}
                            className="rounded-md border border-border bg-panel px-2 py-0.5 text-fg hover:border-primary/40"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={onOpenBuilder}>
                        Map this control to a process
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {summary.controls.length > 6 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-primary hover:underline">
            {showAll ? "Show fewer" : `Show all ${summary.controls.length} controls`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-2.5 py-1.5">
      <p className="text-[9px] font-medium tracking-wide text-subtle uppercase">{label}</p>
      <p className={cn("tabular", strong ? "text-lg font-semibold" : "text-base font-medium")} style={{ color: tone(value) }}>
        {value === null ? "—" : value}
      </p>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="hidden w-16 shrink-0 items-center gap-1 sm:flex" title={`${label === "D" ? "Design" : "Operating"}: ${value ?? "unknown"}`}>
      <span className="text-[9px] text-subtle">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
        <span className="block h-full rounded-full" style={{ width: `${value ?? 0}%`, background: tone(value) }} />
      </span>
    </span>
  );
}
