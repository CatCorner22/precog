import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { needsOwnName } from "@/lib/precog/business-lifecycle";
import { INDUSTRIES, industryMeta, type IndustryId } from "@/lib/precog/industry";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Building2, Check, ChevronDown, Loader2, Plus, Trash2, Users, X } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg placeholder:text-subtle focus:border-primary/50";

/** Header control: switch between businesses in the portfolio, or add a new one. */
export function BusinessSwitcher() {
  const {
    profile,
    businesses,
    switchBusiness,
    createBusiness,
    deleteBusiness,
    switchingBusiness,
    setPracticeName,
  } = usePractice();
  const [open, setOpen] = useState(false);
  // The owner's team with the neutral name setup gave it: ask for the real one.
  const needsName = needsOwnName(profile);
  const [ownName, setOwnName] = useState("");
  function saveOwnName() {
    const next = ownName.trim();
    if (!next) return;
    setPracticeName(next);
    setOwnName("");
  }
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
    // Setup opens for the new business: the owner enters its team or loads
    // the sample. The current business is saved first.
    const result = createBusiness(industry, name);
    if (!result.ok) {
      toast.error("Could not add a business", { description: result.reason });
      return;
    }
    setName("");
    setAdding(false);
    setOpen(false);
  }

  /** From the sample: set up the owner's own business, starting in the sample's line of business. */
  function setUpOwn() {
    const result = createBusiness(profile.industry);
    if (!result.ok) {
      toast.error("Could not start setup", { description: result.reason });
      return;
    }
    setOpen(false);
  }
  const onSample = !profile.customPeople;

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex min-w-0 items-center gap-1 rounded-md text-left hover:bg-elevated/60"
        aria-expanded={open}
        aria-controls="business-switcher-panel"
        aria-label={`Precog Pioneer ${profile.practiceName}${needsName ? " (name it)" : ""}: switch business${
          businesses.length > 1 ? ` (${businesses.length} businesses)` : ""
        }`}
        title="Switch business"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight">
            Precog Pioneer
          </span>
          <span className="flex items-center gap-1 text-xs text-muted" aria-hidden>
            <span className="truncate">{profile.practiceName}</span>
            {needsName && (
              <span className="rounded-full bg-warn/15 px-1.5 text-xs text-warn">Name it</span>
            )}
            {businesses.length > 1 && (
              <span className="rounded-full bg-elevated px-1.5 text-xs text-subtle">
                {businesses.length}
              </span>
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
          id="business-switcher-panel"
          role="group"
          aria-label="Your businesses"
          className="absolute top-full left-0 z-30 mt-2 w-80 max-w-[calc(100vw-4.5rem)] rounded-xl border border-border bg-surface p-2 shadow-2xl"
        >
          {needsName && (
            <div className="mb-2 space-y-1.5 border-b border-border px-1 pb-2">
              <label className="block text-xs font-medium tracking-wide text-subtle uppercase">
                Name this business
                <input
                  className={cn(inputCls, "mt-1 normal-case")}
                  placeholder="Your business name"
                  value={ownName}
                  maxLength={80}
                  autoFocus
                  onChange={(e) => setOwnName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveOwnName()}
                />
              </label>
              <Button size="sm" className="w-full" onClick={saveOwnName} disabled={!ownName.trim()}>
                Save name
              </Button>
            </div>
          )}
          <p className="px-2 pb-1 text-xs font-medium tracking-wide text-subtle uppercase">
            Your businesses
          </p>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {businesses.map((b) => {
              const active = b.id === activeId;
              return (
                <li key={b.id} className="group/row flex items-center gap-1">
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    disabled={switchingBusiness}
                    onClick={() => {
                      if (!active)
                        void switchBusiness(b.id).then(() => toast(`Switched to ${b.name}`));
                      setOpen(false);
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                      active
                        ? "bg-primary/10 text-fg"
                        : "text-muted hover:bg-elevated hover:text-fg",
                    )}
                  >
                    <Building2 className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.name}</span>
                      <span className="block truncate text-xs text-subtle">
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
                        if (
                          !window.confirm(
                            `Remove "${b.name}" from your portfolio? This can't be undone.`,
                          )
                        )
                          return;
                        void deleteBusiness(b.id).then(() => toast(`Removed ${b.name}`));
                      }}
                      className="rounded p-1.5 text-subtle opacity-0 hover:text-danger group-hover/row:opacity-100 focus:opacity-100"
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
                  aria-label="New business name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && submitNew()}
                />
                <select
                  className={inputCls}
                  aria-label="Line of business"
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
                    <Plus className="size-3.5" /> Next: your team
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAdding(false)}
                    aria-label="Cancel adding a business"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-subtle">
                  Next you enter its team, or load the sample business. Your current business is
                  saved first.
                </p>
              </div>
            ) : (
              <>
                {onSample && (
                  <button
                    type="button"
                    onClick={setUpOwn}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-primary hover:bg-elevated"
                  >
                    <Users className="size-3.5" /> Set up my own business
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-primary hover:bg-elevated"
                >
                  <Plus className="size-3.5" /> Add a business
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
