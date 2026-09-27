import { useId, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One person in a ranked list (Workload, Bus factor): name and role, a
 * one-line summary, and a 0–100 index drawn as a bar. The row expands to
 * show `children`, and tells assistive technology whether it is open.
 */
export function RankedRow({
  name,
  role,
  summary,
  value,
  valueLabel,
  color,
  expanded,
  onToggle,
  children,
}: {
  name: string;
  role: string;
  summary: ReactNode;
  /** The index, 0–100. */
  value: number;
  /** What the index is, read before the number by a screen reader ("Impact index"). */
  valueLabel: string;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const detailId = useId();
  return (
    <li className="rounded-md border border-border bg-elevated">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? detailId : undefined}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-subtle transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <span className="font-medium text-fg">{name}</span>
            <span className="text-subtle"> · {role}</span>
          </span>
          <span className="block text-xs text-subtle">{summary}</span>
        </span>
        <span className="flex w-20 shrink-0 items-center gap-1.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${value}%`, background: color }}
            />
          </span>
          <span className="w-6 text-right tabular text-subtle">
            <span className="sr-only">{valueLabel} </span>
            {value}
          </span>
        </span>
      </button>
      {expanded && (
        <div id={detailId} className="space-y-1.5 border-t border-border px-2 py-1.5 text-xs">
          {children}
        </div>
      )}
    </li>
  );
}

/** The caption above a ranked list's index column, with the index's inputs on hover. */
export function IndexColumnCaption({ label, basis }: { label: string; basis: string }) {
  return (
    <p className="flex justify-end text-xs text-subtle">
      <span title={basis} className="cursor-help underline decoration-dotted underline-offset-2">
        {label}
      </span>
    </p>
  );
}
