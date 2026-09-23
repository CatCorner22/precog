import { DeltaBadge } from "@/components/precog/builder/health-pill";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import { Wand2 } from "lucide-react";

import { type HealthDelta } from "@/lib/precog/builder/what-if";

import { type MapValidationIssue } from "@/lib/precog/process-graph";

function isQuickFixable(i: MapValidationIssue) {
  return Boolean(
    i.processId &&
    (i.id.startsWith("owner-") || i.id.startsWith("fraud-nocontrol-") || i.id.startsWith("dep-")),
  );
}

export function ValidationPanel({
  issues,
  onSelectProcess,
  onCleanLayout,
  onQuickFix,
  onFixAll,
  previewFix,
}: {
  issues: MapValidationIssue[];
  onSelectProcess: (id: string) => void;
  onCleanLayout: () => void;
  onQuickFix: (issueId: string, processId: string) => boolean;
  onFixAll: () => void;
  previewFix: (issueId: string, processId: string) => HealthDelta | null;
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  const infos = issues.filter((i) => i.severity === "info");
  const fixable = issues.filter(isQuickFixable).length;

  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-ok/30 bg-ok/5 p-2.5 text-xs text-ok">
        Map looks healthy — no broken dependencies, missing owners, or stale references.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {errors.length} error(s), {warns.length} warning(s), {infos.length} info
        </p>
        {fixable > 1 && (
          <Button size="sm" variant="secondary" onClick={onFixAll}>
            <Wand2 className="size-3.5" /> Fix {fixable} quick wins
          </Button>
        )}
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {[...errors, ...warns, ...infos].map((i) => (
          <li
            key={i.id}
            className={cn(
              "flex items-stretch gap-1 rounded-md border text-xs",
              i.severity === "error"
                ? "border-danger/40 bg-danger/10 text-fg"
                : i.severity === "warn"
                  ? "border-warn/40 bg-warn/10 text-fg"
                  : "border-border bg-elevated text-muted",
            )}
          >
            <button
              type="button"
              onClick={() => i.processId && onSelectProcess(i.processId)}
              disabled={!i.processId}
              className={cn("min-w-0 flex-1 px-2 py-1 text-left", i.processId && "hover:underline")}
            >
              {i.message}
            </button>
            {isQuickFixable(i) && (
              <button
                type="button"
                onClick={() => onQuickFix(i.id, i.processId!)}
                title="Apply suggested fix"
                className="inline-flex shrink-0 items-center gap-1 border-l border-current/20 px-2 text-primary hover:bg-primary/10"
              >
                <Wand2 className="size-3" /> Fix
                <DeltaBadge delta={previewFix(i.id, i.processId!)} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {infos.some((i) => i.id.startsWith("layout-")) && (
        <Button size="sm" variant="secondary" onClick={onCleanLayout}>
          Clean stale layout positions
        </Button>
      )}
    </div>
  );
}
