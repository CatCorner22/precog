import { useId } from "react";
import { usePresentation, type PresentationMode } from "@/lib/precog/presentation";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: PresentationMode; label: string; title: string }[] = [
  {
    mode: "plain",
    label: "Plain",
    title: "Everyday words. Same gaps, same numbers.",
  },
  {
    mode: "tactical",
    label: "Tactical",
    title: "The words an accountant uses. Same gaps, same numbers.",
  },
];

/**
 * Switches wording only.
 *
 * Worth being explicit about, because a display toggle that silently changed
 * what was measured would make the whole application untrustworthy: both modes
 * run the same engines over the same data and differ solely in what the screen
 * calls things. The line under the buttons says so on screen, not only on
 * hover, because a toggle that renames tabs is otherwise a puzzle.
 */
const TOGGLE_NOTE = "Changes the words, never the numbers.";

export function PresentationToggle({ className }: { className?: string }) {
  const { mode, setMode } = usePresentation();
  const noteId = useId();

  return (
    <div className={cn("inline-flex flex-col items-start gap-0.5", className)}>
      <div
        role="group"
        aria-label="Wording"
        aria-describedby={noteId}
        className="inline-flex items-center rounded-lg border border-border bg-elevated/60 p-0.5"
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
              mode === opt.mode ? "bg-surface text-fg shadow-sm" : "text-subtle hover:text-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p id={noteId} className="text-[11px] leading-tight text-subtle">
        {TOGGLE_NOTE}
      </p>
    </div>
  );
}
