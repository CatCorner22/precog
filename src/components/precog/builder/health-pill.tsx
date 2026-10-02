import { Activity, Gauge } from "lucide-react";

import type { HealthDelta } from "@/lib/precog/builder/what-if";
import { healthTone } from "@/lib/precog/scoring/bands";
import { cn } from "@/lib/utils";

/** The builder's map completeness pill: score, band and this session's change. */
export function HealthPill({
  score,
  band,
  sessionDelta,
}: {
  score: number;
  band: string;
  sessionDelta: number;
}) {
  const tone = PILL_TONE[healthTone(score)];
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-semibold tabular",
          tone,
        )}
      >
        <Gauge className="size-3" />
        {score}%
      </span>
      <span className="text-muted">Map completeness · {band}</span>
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
export function DeltaBadge({ delta }: { delta: HealthDelta | null }) {
  if (!delta || delta.delta === 0) return null;
  const up = delta.delta > 0;
  return (
    <span
      title={
        delta.driver
          ? `Health ${delta.before} → ${delta.after} · ${delta.driver.label} ${delta.driver.delta > 0 ? "+" : ""}${delta.driver.delta}`
          : `Health ${delta.before} → ${delta.after}`
      }
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-xs font-semibold tabular",
        up ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger",
      )}
    >
      <Activity className="size-2.5" aria-hidden />
      <span className="sr-only">Map completeness change </span>
      {up ? "+" : ""}
      {delta.delta}
    </span>
  );
}

const PILL_TONE = {
  ok: "text-ok border-ok/40 bg-ok/10",
  primary: "text-primary border-primary/40 bg-primary/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  danger: "text-danger border-danger/40 bg-danger/10",
} as const;
