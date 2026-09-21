import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { INDUSTRIES, industryMeta, type IndustryId } from "@/lib/precog/industry";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Building2, Check, ChevronDown, Loader2, Plus, Trash2, X } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg placeholder:text-subtle focus:border-primary/50 focus:outline-none";

/** Header control: switch between businesses in the portfolio, or add a new one. */
export function BusinessSwitcher() {
  const { profile, businesses, switchBusiness, createBusiness, deleteBusiness, switchingBusiness } =
    usePractice();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<IndustryId>("general");
  const ref = useRef<HTMLDivElement>(null);
  const activeId = profile.businessId ?? "biz_default";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function submitNew() {
    createBusiness(industry, name);
    toast.success(`Added ${name.trim() || industryMeta(industry).demoName}`, {
      description: "You're now working in the new business. Switch back any time.",
    });
    setName("");
    setAdding(false);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex min-w-0 items-center gap-1 rounded-md text-left hover:bg-elevated/60"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch business"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight">Precog Pioneer</span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <span className="truncate">{profile.practiceName}</span>
            {businesses.length > 1 && (
              <span className="rounded-full bg-elevated px-1.5 text-[10px] text-subtle">{businesses.length}</span>
            )}
            {switchingBusiness ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
            )}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 z-30 mt-2 w-80 rounded-xl border border-border bg-surface p-2 shadow-2xl"
        >
          <p className="px-2 pb-1 text-[10px] font-medium tracking-wide text-subtle uppercase">
            Your businesses
          </p>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {businesses.map((b) => {
              const active = b.id === activeId;
              return (
                <li key={b.id} className="group/row flex items-center gap-1">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    disabled={switchingBusiness}
                    onClick={() => {
                      if (!active) void switchBusiness(b.id).then(() => toast(`Switched to ${b.name}`));
                      setOpen(false);
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                      active ? "bg-primary/10 text-fg" : "text-muted hover:bg-elevated hover:text-fg",
                    )}
                  >
                    <Building2 className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.name}</span>
                      <span className="block truncate text-[10px] text-subtle">
                        {industryMeta(b.industry).label}
                        {b.healthScore !== null ? ` · health ${b.healthScore}` : ""}
                      </span>
                    </span>
                    {active && <Check className="size-3.5 shrink-0 text-primary" />}
                  </button>
                  {!active && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Remove "${b.name}" from your portfolio? This can't be undone.`)) return;
                        void deleteBusiness(b.id).then(() => toast(`Removed ${b.name}`));
                      }}
                      className="rounded p-1 text-subtle opacity-0 hover:text-danger group-hover/row:opacity-100 focus:opacity-100"
                      aria-label={`Remove ${b.name}`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-2 border-t border-border pt-2">
            {adding ? (
              <div className="space-y-1.5 px-1">
                <input
                  className={inputCls}
                  placeholder="Business name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && submitNew()}
                />
                <select
                  className={inputCls}
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value as IndustryId)}
                >
                  {INDUSTRIES.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1" onClick={submitNew}>
                    <Plus className="size-3.5" /> Create
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAdding(false)} aria-label="Cancel">
                    <X className="size-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-subtle">
                  Starts from the industry template. Your current business is saved first.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-primary hover:bg-elevated"
              >
                <Plus className="size-3.5" /> Add a business
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
