import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { DualReleasePolicy } from "@/lib/precog/controls/dual-release";
import type { DetectedConflict } from "@/lib/precog/sod/detect";
import { partialDualReleaseCoverage } from "@/lib/precog/sod/open-findings";
import type { StaffComposition } from "@/lib/precog/types";
import { cn } from "@/lib/utils";
import {
  conflictBadge,
  conflictBridge,
  conflictFactors,
  conflictTone,
  TONE_SURFACE,
} from "./sod-conflict-view";

/**
 * One duty conflict as every card on the tab shows it: the badge and colour
 * rule, the rule's title, the pair the person holds (with the sentence that
 * joins them when the rule matched through a related duty) and why it
 * matters, with the plain factors that rank it. Each caller adds its own
 * detail below.
 */
export function ConflictSummary({
  conflict,
  staff,
  dualRelease,
  className,
  children,
}: {
  conflict: DetectedConflict;
  /** The business's staffing, for the factors it adds; left out, the card lists the rest. */
  staff?: StaffComposition;
  /** The business's dual-release policy, so a threshold-limited rule names its threshold. */
  dualRelease?: DualReleasePolicy;
  className?: string;
  children?: ReactNode;
}) {
  const tone = conflictTone(conflict);
  const bridge = conflictBridge(conflict);
  const partialThresholdUsd = dualRelease
    ? partialDualReleaseCoverage(dualRelease, [conflict]).get(conflict.ruleId)
    : undefined;
  return (
    <div className={cn("rounded-xl border px-3 py-3 text-sm", TONE_SURFACE[tone], className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone}>{conflictBadge(conflict)}</Badge>
        {conflict.dualReleaseMitigated && <Badge variant="ok">Narrowed by dual release</Badge>}
        {conflict.residualRiskAccepted && <Badge variant="warn">Risk accepted</Badge>}
      </div>
      <p className="mt-1.5 font-medium">{conflict.title}</p>
      <p className="mt-0.5 text-xs text-subtle">
        {conflictFactors(conflict, staff, partialThresholdUsd).join(" · ")}
      </p>
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
