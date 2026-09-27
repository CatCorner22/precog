import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { DetectedConflict } from "@/lib/precog/sod/detect";
import { cn } from "@/lib/utils";
import { conflictBadge, conflictBridge, conflictTone, TONE_SURFACE } from "./sod-conflict-view";

/**
 * One duty conflict as every card on the tab shows it: the badge and colour
 * rule, the rule's title, the pair the person holds (with the sentence that
 * joins them when the rule matched through a related duty) and why it
 * matters. Each caller adds its own detail below.
 */
export function ConflictSummary({
  conflict,
  className,
  children,
}: {
  conflict: DetectedConflict;
  className?: string;
  children?: ReactNode;
}) {
  const tone = conflictTone(conflict);
  const bridge = conflictBridge(conflict);
  return (
    <div className={cn("rounded-xl border px-3 py-3 text-sm", TONE_SURFACE[tone], className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone}>{conflictBadge(conflict)}</Badge>
        <span
          className="text-xs text-subtle tabular"
          title="This app's ranking index from 12 to 100, by severity, duty weight and staffing; not a probability."
        >
          Rank {conflict.score} of 100
        </span>
        {conflict.dualReleaseMitigated && <Badge variant="ok">Narrowed by dual release</Badge>}
        {conflict.residualRiskAccepted && <Badge variant="warn">Risk accepted</Badge>}
      </div>
      <p className="mt-1.5 font-medium">{conflict.title}</p>
      <p className="mt-1 text-xs text-muted">
        <span className="text-fg">{conflict.labelA}</span>
        {" × "}
        <span className="text-fg">{conflict.labelB}</span>
      </p>
      {bridge && <p className="mt-1 text-xs text-muted">{bridge}</p>}
      <p className="mt-1 text-xs text-muted">{conflict.why}</p>
      {children}
    </div>
  );
}
