import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { needsOwnName, teamSource } from "@/lib/precog/business-lifecycle";
import { INDUSTRIES, industryMeta, type IndustryId } from "@/lib/precog/industry";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { inputCls } from "@/components/ui/field-classes";
import { businessSummaryKey, type BusinessSummary } from "@/lib/precog/practice-profile";
import { DEFAULT_BUSINESS_ID, MAX_BUSINESS_NAME } from "@/lib/precog/business-id";
import { removeBusinessPrompt } from "./business-switcher-text";
import { OPEN_BUSINESS_SETTINGS_EVENT } from "@/lib/precog/business-settings-event";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getFirm } from "@/lib/precog/firm/server";
import type { FirmRole } from "@/lib/precog/firm/store";

// Loaded on open, so the settings editor stays out of the code the header
// loads on every page.
const BusinessSettingsDialog = lazy(() =>
  import("./business-settings-dialog").then((m) => ({ default: m.BusinessSettingsDialog })),
);

/** Header control: switch between businesses, open Business settings, or add a business. */
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const activeId = profile.businessId ?? DEFAULT_BUSINESS_ID;
  const own = businesses.filter((b) => !b.shared);
  const firmClients = businesses.filter((b) => b.shared);
  const { user } = useCurrentUserState();
  // Only the firm owner deletes a firm's client, a member's own included, so
  // the trash button on a firm-client row needs the role; read once, and only
  // when such a row shows.
  const [firmRole, setFirmRole] = useState<FirmRole | null>(null);
  const roleRead = useRef(false);
  const anyFirmClient = businesses.some((b) => b.firmClient || b.shared);
  useEffect(() => {
    if (!user || !anyFirmClient || roleRead.current) return;
    roleRead.current = true;
    void getFirm()
      .then((res) => setFirmRole(res.firm?.role ?? null))
      .catch(() => undefined);
  }, [user, anyFirmClient]);

  // Opening moves focus into the panel (the name field has its own autofocus).
  useEffect(() => {
    if (!open || needsName) return;
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open, needsName]);

  // A panel elsewhere (for example a known-known figure) asks for Business settings.
  useEffect(() => {
    function openSettings() {
      setOpen(false);
      setSettingsOpen(true);
    }
    window.addEventListener(OPEN_BUSINESS_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_BUSINESS_SETTINGS_EVENT, openSettings);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function submitNew() {
    // Setup opens for the new business: the owner enters its team or loads
    // the sample. The current business is saved first.
    const result = await createBusiness(industry, name);
    if (!result.ok) {
      toast.error("Could not add a business", { description: result.reason });
      return;
    }
    setName("");
    setAdding(false);
    setOpen(false);
  }

  /** From the sample: set up the owner's own business, starting in the sample's line of business. */
  async function setUpOwn() {
    const result = await createBusiness(profile.industry);
    if (!result.ok) {
      toast.error("Could not start setup", { description: result.reason });
      return;
    }
    setOpen(false);
  }
  const onSample = teamSource(profile) === "sample";

  function openBusiness(b: BusinessSummary) {
    setOpen(false);
    void switchBusiness(b.id, b.ownerUserId).then(
      (result) =>
        result.ok
          ? toast(`Switched to ${b.name}`)
          : toast.error(`Could not open ${b.name}`, { description: result.reason }),
      (error: unknown) =>
        toast.error(`Could not open ${b.name}`, { description: describeError(error) }),
    );
  }

  function removeBusiness(b: BusinessSummary) {
    if (!window.confirm(removeBusinessPrompt(b))) return;
    void deleteBusiness(b.id, b.ownerUserId).then(
      () => toast(b.shared ? `Deleted ${b.name} for your firm` : `Removed ${b.name}`),
      (error: unknown) =>
        toast.error(`Could not remove ${b.name}`, { description: describeError(error) }),
    );
  }

  function row(b: BusinessSummary) {
    const active =
      businessSummaryKey(b, user?.id) ===
      businessSummaryKey({ id: activeId, ownerUserId: profile.ownerUserId }, user?.id);
    return (
      <li key={businessSummaryKey(b, user?.id)} className="group/row flex items-center gap-1">
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          disabled={switchingBusiness}
          onClick={() => (active ? setOpen(false) : openBusiness(b))}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
            active ? "bg-primary/10 text-fg" : "text-muted hover:bg-elevated hover:text-fg",
          )}
        >
          <Building2 className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{b.name}</span>
            <span className="block truncate text-xs text-subtle">
              {industryMeta(b.industry).label}
              {b.healthScore !== null ? ` · map ${b.healthScore}% complete` : ""}
            </span>
          </span>
          {active && <Check className="size-3.5 shrink-0 text-primary" />}
        </button>
        {!active && ((!b.shared && !b.firmClient) || firmRole === "owner") && (
          <button
            type="button"
            disabled={switchingBusiness}
            onClick={() => removeBusiness(b)}
            className="rounded p-1.5 text-subtle opacity-0 group-hover/row:opacity-100 hover:text-danger focus:opacity-100 disabled:opacity-40 pointer-coarse:opacity-100"
            aria-label={b.shared ? `Delete ${b.name} for your firm` : `Remove ${b.name}`}
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </li>
    );
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex min-w-0 items-center gap-1 rounded-md text-left hover:bg-elevated/60"
        aria-expanded={open}
        aria-controls="business-switcher-panel"
        aria-label={`Precog ${profile.practiceName}${needsName ? " (name it)" : ""}: switch business${
          businesses.length > 1 ? ` (${businesses.length} businesses)` : ""
        }`}
        title="Switch business"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight">Precog</span>
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
          ref={panel}
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
                  maxLength={MAX_BUSINESS_NAME}
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
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">{own.map(row)}</ul>
          {firmClients.length > 0 && (
            <>
              <p className="mt-2 px-2 pb-1 text-xs font-medium tracking-wide text-subtle uppercase">
                Firm clients
              </p>
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">{firmClients.map(row)}</ul>
            </>
          )}

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
                  onKeyDown={(e) => e.key === "Enter" && void submitNew()}
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
                  <Button size="sm" className="flex-1" onClick={() => void submitNew()}>
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
                  Next you enter its team, or load the sample business. Precog saves your current
                  business first.
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-fg hover:bg-elevated"
                >
                  <Settings2 className="size-3.5" /> Business settings
                </button>
                {onSample && (
                  <button
                    type="button"
                    onClick={() => void setUpOwn()}
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
      {settingsOpen && (
        <Suspense fallback={null}>
          <BusinessSettingsDialog
            onClose={() => {
              setSettingsOpen(false);
              trigger.current?.focus();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Try again in a moment.";
}
