import type { ProcessNode } from "@/lib/precog/types";

import { cn } from "@/lib/utils";

import { Loader2 } from "lucide-react";

import type { MapReview } from "@/lib/precog/builder/review";

import { RotateCw } from "lucide-react";

import { labelCls } from "@/components/precog/builder/form-shared";
const GRADE_TONE: Record<MapReview["grade"], string> = {
  A: "bg-ok/15 text-ok border-ok/40",
  B: "bg-primary/15 text-primary border-primary/40",
  C: "bg-warn/15 text-warn border-warn/40",
  F: "bg-danger/25 text-danger border-danger/60",
};

export function ReviewPanel({
  review,
  loading,
  onRefresh,
  onSelectProcess,
  processes,
}: {
  review: MapReview | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectProcess: (id: string) => void;
  processes: ProcessNode[];
}) {
  if (loading && !review) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-panel p-3 text-xs text-muted">
        <Loader2 className="size-3.5 animate-spin" /> Reviewing your value stream…
      </div>
    );
  }
  if (!review) return null;
  const focus = review.focusProcessIds
    .map((id) => processes.find((p) => p.id === id))
    .filter((p): p is ProcessNode => Boolean(p));

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-panel p-2.5 text-xs">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border text-base font-bold",
            GRADE_TONE[review.grade],
          )}
        >
          {review.grade}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-fg">{review.headline}</p>
          <p className="mt-0.5 text-xs text-subtle">
            {review.source === "grok"
              ? `Reviewed by ${review.model ?? "Grok"}`
              : "Rule-based review"}
            {" · "}
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1 text-primary hover:underline"
              disabled={loading}
            >
              <RotateCw className={cn("size-3", loading && "animate-spin")} /> Re-run
            </button>
          </p>
        </div>
      </div>
      {review.sections.map((s) => (
        <div key={s.heading}>
          <p className={labelCls}>{s.heading}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
            {s.points.map((pt) => (
              <li key={pt} className="text-fg/90">
                {pt}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-2">
        <p className="text-xs font-medium tracking-wide text-accent uppercase">Next move</p>
        <p className="mt-0.5 text-fg">{review.nextMove}</p>
      </div>
      {focus.length > 0 && (
        <div>
          <p className={labelCls}>Open first</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {focus.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectProcess(p.id)}
                className="rounded-md border border-border bg-elevated px-2 py-0.5 text-xs text-fg hover:border-primary/40"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
