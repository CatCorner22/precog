import { Plus, X } from "lucide-react";
import { labelCls } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";

/** A chip the owner can switch on or off; `title` carries the full wording when the chip is shortened. */
export interface ChipOption {
  id: string;
  label: string;
  title?: string;
  tone?: "danger";
}

/** A labelled row of on/off chips; each chip reports its state to assistive technology. */
export function ChipPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: ChipOption[];
  selected: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.length === 0 && <span className="text-xs text-subtle">None available</span>}
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              title={o.title}
              onClick={() => onToggle(o.id)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                on
                  ? o.tone === "danger"
                    ? "border-danger/50 bg-danger/15 text-fg"
                    : "border-primary/50 bg-primary/15 text-fg"
                  : "border-border bg-elevated text-muted hover:text-fg",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SectionHeader({
  icon,
  title,
  count,
  onAdd,
  adding,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(labelCls, "flex items-center gap-1")}>
        {icon}
        {title} ({count})
      </span>
      <button
        type="button"
        onClick={onAdd}
        // Several lists share the form: the name says which one this adds to.
        aria-label={
          adding ? `Cancel adding to ${title.toLowerCase()}` : `Add to ${title.toLowerCase()}`
        }
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {adding ? <X className="size-3" /> : <Plus className="size-3" />}
        {adding ? "Cancel" : "Add"}
      </button>
    </div>
  );
}
