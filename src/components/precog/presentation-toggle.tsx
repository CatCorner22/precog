import { usePresentation, type PresentationMode } from "@/lib/precog/presentation";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: PresentationMode; label: string; title: string }[] = [
  {
    mode: "plain",
    label: "Plain",
    title: "Plain business language. Same findings, same numbers.",
  },
  {
    mode: "tactical",
    label: "Tactical",
    title: "Threat-operations naming and styling. Same findings, same numbers.",
  },
];

/**
 * Switches wording only.
 *
 * Worth being explicit about, because a display toggle that silently changed
 * what was measured would make the whole application untrustworthy: both modes
 * run the same engines over the same data and differ solely in what the screen
 * calls things.
 */
export function PresentationToggle({ className }: { className?: string }) {
  const { mode, setMode } = usePresentation();

  return (
    <div
      role="group"
      aria-label="Wording"
      className={cn(
        "inline-flex items-center rounded-lg border border-border bg-elevated/60 p-0.5",
        className,
      )}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          title={opt.title}
          aria-pressed={mode === opt.mode}
          onClick={() => setMode(opt.mode)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            mode === opt.mode
              ? "bg-surface text-fg shadow-sm"
              : "text-subtle hover:text-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
