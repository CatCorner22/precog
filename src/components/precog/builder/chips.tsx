import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { labelCls } from "@/components/precog/builder/form-shared";

export function ChipPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { id: string; label: string; tone?: "danger" }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.length === 0 && <span className="text-[11px] text-subtle">None available</span>}
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
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
        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        {adding ? <X className="size-3" /> : <Plus className="size-3" />}
        {adding ? "Cancel" : "Add"}
      </button>
    </div>
  );
}
