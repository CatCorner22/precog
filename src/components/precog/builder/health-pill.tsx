import { HEALTH_SCALE } from "@/lib/precog/scoring/bands";

import { cn } from "@/lib/utils";

import { type HealthDelta } from "@/lib/precog/builder/what-if";
import { Activity, Gauge } from "lucide-react";

export function HealthPill({
  score,
  band,
  sessionDelta,
}: {
  score: number;
  band: string;
  sessionDelta: number;
}) {
  const tone =
    score >= HEALTH_SCALE.adequate
      ? "text-ok border-ok/40 bg-ok/10"
      : score >= HEALTH_SCALE.weak
        ? "text-warn border-warn/40 bg-warn/10"
        : "text-danger border-danger/40 bg-danger/10";
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-semibold tabular",
          tone,
        )}
      >
        <Gauge className="size-3" />
        {score}
      </span>
      <span className="text-muted">Map health · {band}</span>
      {sessionDelta !== 0 && (
        <span className={cn("font-medium tabular", sessionDelta > 0 ? "text-ok" : "text-danger")}>
          {sessionDelta > 0 ? "+" : ""}
          {sessionDelta} this session
        </span>
      )}
    </div>
  );
}

/** Compact "+4" / "−2" badge for what-if previews. */
export function DeltaBadge({ delta, title }: { delta: HealthDelta | null; title?: string }) {
  if (!delta || delta.delta === 0) return null;
  const up = delta.delta > 0;
  return (
    <span
      title={
        title ??
        (delta.driver
          ? `Health ${delta.before} → ${delta.after} · ${delta.driver.label} ${delta.driver.delta > 0 ? "+" : ""}${delta.driver.delta}`
          : `Health ${delta.before} → ${delta.after}`)
      }
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-xs font-semibold tabular",
        up ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger",
      )}
    >
      <Activity className="size-2.5" />
      {up ? "+" : ""}
      {delta.delta}
    </span>
  );
}
