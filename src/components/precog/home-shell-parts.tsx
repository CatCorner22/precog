import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import type { TabId } from "@/lib/precog/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A home-page tab as the strip draws it. */
export interface ShellTab {
  id: TabId;
  label: string;
  tactical: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

/**
 * Horizontal tab strip that tells the user there is more: a fade on whichever
 * edge still has hidden tabs, and the active tab scrolled into view so the
 * tabs past the viewport (12 through 15 on a laptop) are discoverable.
 */
export function TabStrip({
  activeId,
  children,
  onKeyDown,
  tabCount,
}: {
  activeId: string;
  children: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  /** Every tab, including the ones behind "Advanced"; the tab walk (scripts/e2e-tabs.mjs) checks it. */
  tabCount: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>("[data-active]");
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <div className="relative">
      <nav
        ref={ref}
        role="tablist"
        aria-label="Sections"
        data-tab-count={tabCount}
        onKeyDown={onKeyDown}
        // `relative` makes the strip the containing block of absolutely placed
        // text inside a tab (the badges' screen-reader text), so it scrolls and
        // clips with the tabs instead of widening the page on a phone.
        className="relative mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6 [scrollbar-width:thin]"
      >
        {children}
      </nav>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent transition-opacity",
          edges.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg to-transparent transition-opacity",
          edges.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

/**
 * The advanced views behind one control. Rendered inside the tab strip as a
 * menu, not a tab: the tab it opens then appears in the strip as the active
 * tab, so the strip always shows where the reader is.
 *
 * Keyboard: Enter, Space or ArrowDown on the button opens the menu on its
 * first item; ArrowUp, ArrowDown, Home and End move within it and never reach
 * the tab strip; Escape closes it and returns focus to the button; picking a
 * view moves focus to that view's tab.
 */
export function MoreTabsMenu({
  tabs,
  activeId,
  label,
  onPick,
}: {
  tabs: readonly ShellTab[];
  activeId: TabId;
  label: (tab: ShellTab) => string;
  onPick: (id: TabId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function pick(id: TabId) {
    setOpen(false);
    onPick(id);
    requestAnimationFrame(() =>
      (document.getElementById(`tab-${id}`) ?? triggerRef.current)?.focus(),
    );
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys pressed inside the menu belong to the menu, not to the tab strip around it.
    event.stopPropagation();
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    const index = items.findIndex((el) => el === document.activeElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-more-tabs
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          tabs.some((t) => t.id === activeId)
            ? "text-fg hover:bg-elevated/60"
            : "text-muted hover:bg-elevated/60 hover:text-fg",
        )}
      >
        Advanced
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Advanced views"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
          {tabs.map((t, i) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-tab-id={t.id}
                onClick={() => pick(t.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-elevated focus:bg-elevated",
                  activeId === t.id ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{label(t)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A count pill beside a tab name. Sighted readers see the number; a screen
 * reader hears what it counts ("3 critical conflicts"), since the tab's name
 * alone would not say.
 */
export function CountBadge({
  n,
  tone,
  text,
}: {
  n: number;
  tone: "warn" | "danger";
  /** The whole count in words, read instead of the bare number. */
  text: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-xs",
        tone === "danger" ? "bg-danger/20 text-danger" : "bg-warn/20 text-warn",
      )}
    >
      <span aria-hidden>{n}</span>
      <span className="sr-only">{`, ${text}`}</span>
    </span>
  );
}

export function TabLoading() {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-muted">Loading…</CardContent>
    </Card>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "danger" | "warn" | "primary";
  onClick?: () => void;
}) {
  return (
    <Card
      className={
        onClick ? "cursor-pointer transition-colors hover:border-border-strong" : undefined
      }
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4">
        <Badge variant={tone}>{label}</Badge>
        <p className="mt-3 text-2xl font-semibold tabular tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}
