import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One labelled figure: a small label, the value, and what the value rests on.
 * Every stat tile on the scenario, variables, residual and threat screens uses
 * this, so a change to how a figure shows its basis is made once.
 */
export function FigureTile({
  label,
  value,
  detail,
  hint,
  size = "md",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** A second line under the value, such as a range. */
  detail?: ReactNode;
  /** What the figure is based on. */
  hint?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-elevated p-3", className)}>
      <p className="text-xs tracking-wide text-subtle uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-semibold tabular tracking-tight",
          size === "sm" ? "text-base" : size === "md" ? "text-lg" : "text-xl",
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** A small uppercase heading over a two-column grid of fields. */
export function FieldSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
