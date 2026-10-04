import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ExternalLink, MoreHorizontal } from "lucide-react";
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
 * tabs past the viewport on a narrow screen are discoverable.
 */
export function TabStrip({
  activeId,
  children,
  trailing,
  onKeyDown,
  tabCount,
}: {
  activeId: string;
  children: ReactNode;
  /** Pinned at the strip's right end, outside the tablist: menus, never tabs. */
  trailing?: ReactNode;
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
        // clips with the tabs instead of widening the page on a phone. The
        // trailing padding keeps the last tab clear of the pinned control.
        className={cn(
          "relative mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6 [scrollbar-width:thin]",
          trailing && "pr-44 sm:pr-48",
        )}
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
      {trailing && (
        <div className="pointer-events-none absolute top-0 right-0 bottom-3 flex items-center bg-gradient-to-l from-bg via-bg to-transparent pr-4 pl-16 sm:pr-6">
          <div className="pointer-events-auto">{trailing}</div>
        </div>
      )}
    </div>
  );
}

/** A place on another page that the Advanced menu links to, below its views. */
export interface ShellRouteLink {
  id: string;
  label: string;
  href: string;
}

/**
 * Where a fixed-position menu goes so it hangs 4px under `trigger`, flush
 * with its right edge. A fixed element is placed against the viewport, unless
 * an ancestor has a transform, filter, backdrop-filter or similar: then that
 * ancestor's padding box is the frame. The sticky home header has
 * backdrop-blur and sits below the "Created with Grok" bar when that bar
 * shows, so window coordinates would put the menu one bar-height too low.
 * The right edge is taken from the frame's client width, which leaves out a
 * vertical scrollbar, where window.innerWidth includes it.
 */
function fixedMenuPlace(trigger: HTMLElement): { top: number; right: number } {
  const box = trigger.getBoundingClientRect();
  let frame: HTMLElement | null = null;
  for (
    let el = trigger.parentElement;
    el && el !== document.documentElement;
    el = el.parentElement
  ) {
    const css = getComputedStyle(el);
    const backdrop =
      css.backdropFilter ||
      (css as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter;
    if (
      (css.transform && css.transform !== "none") ||
      (css.filter && css.filter !== "none") ||
      (backdrop && backdrop !== "none") ||
      (css.perspective && css.perspective !== "none") ||
      /transform|filter|perspective/.test(css.willChange) ||
      /paint|layout|strict|content/.test(css.contain)
    ) {
      frame = el;
      break;
    }
  }
  let frameTop = 0;
  let frameRight = document.documentElement.clientWidth;
  if (frame) {
    const f = frame.getBoundingClientRect();
    frameTop = f.top + frame.clientTop;
    frameRight = f.left + frame.clientLeft + frame.clientWidth;
  }
  return { top: box.bottom - frameTop + 4, right: Math.max(8, frameRight - box.right) };
}

/**
 * The advanced views behind one control. Pinned at the tab strip's right end
 * as a menu, not a tab: the tab it opens then appears in the strip as the
 * active tab, so the strip always shows where the reader is. Below a separator it
 * links to places on other pages (`data-route-link`), which are not tabs.
 *
 * Keyboard: Enter, Space or ArrowDown on the button opens the menu on its
 * first item; ArrowUp, ArrowDown, Home and End move within it and never reach
 * the tabs; Escape closes it and returns focus to the button; picking a
 * view moves focus to that view's tab.
 */
export function MoreTabsMenu({
  tabs,
  activeId,
  label,
  onPick,
  links = [],
  onOpenLink,
}: {
  tabs: readonly ShellTab[];
  activeId: TabId;
  label: (tab: ShellTab) => string;
  onPick: (id: TabId) => void;
  links?: readonly ShellRouteLink[];
  onOpenLink?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The strip scrolls sideways, which would clip a menu hung below it, so the
  // menu is fixed-position, under its button. See fixedMenuPlace for why the
  // numbers are not plain window coordinates.
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const placeMenu = () => {
      if (triggerRef.current) setPlace(fixedMenuPlace(triggerRef.current));
    };
    placeMenu();
    const frame = requestAnimationFrame(() => itemRefs.current[0]?.focus({ preventScroll: true }));
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      cancelAnimationFrame(frame);
      setPlace(null);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
    // Keys pressed inside the menu belong to the menu, not to the tabs beside it.
    event.stopPropagation();
    const items = itemRefs.current.filter((el): el is HTMLElement => el !== null);
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
      {open && place && (
        <div
          role="menu"
          style={{ top: place.top, right: place.right }}
          aria-label="Advanced views"
          onKeyDown={onMenuKeyDown}
          className="fixed z-30 w-64 rounded-lg border border-border bg-surface p-1 shadow-xl"
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
          {links.length > 0 && <div role="separator" className="my-1 border-t border-border" />}
          {links.map((link, i) => (
            <a
              key={link.id}
              ref={(el) => {
                itemRefs.current[tabs.length + i] = el;
              }}
              href={link.href}
              role="menuitem"
              tabIndex={-1}
              data-route-link={link.id}
              onClick={(event) => {
                if (!onOpenLink || event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                setOpen(false);
                onOpenLink(link.id);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted hover:bg-elevated hover:text-fg focus:bg-elevated"
            >
              <ExternalLink className="size-4" aria-hidden />
              <span className="flex-1">{link.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The header's action row, folded on a phone. `inline` stays in the row at
 * every width; `leading` and `trailing` render beside it on wider screens
 * and fold behind one "More" disclosure below the `sm` breakpoint, so a
 * phone header is two rows instead of four. The disclosure is a plain
 * disclosure, not a menu: its panel holds live controls, so Tab moves
 * through them naturally and Escape closes it and returns focus to the
 * button. The server renders the wide row; a phone folds after hydration.
 */
export function HeaderActions({
  leading,
  inline,
  trailing,
}: {
  leading: ReactNode;
  inline: ReactNode;
  trailing: ReactNode;
}) {
  const [wide, setWide] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => {
      setWide(mq.matches);
      if (mq.matches) setOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (wide) {
    return (
      <>
        {leading}
        {inline}
        {trailing}
      </>
    );
  }
  return (
    <>
      {inline}
      <div ref={ref} className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls="header-more"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated/60 px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg"
        >
          <MoreHorizontal className="size-4" aria-hidden /> More
        </button>
        {open && (
          <div
            id="header-more"
            role="group"
            aria-label="More header actions"
            className="absolute top-full right-0 z-30 mt-1 flex min-w-56 flex-col items-stretch gap-2 rounded-lg border border-border bg-surface p-3 shadow-xl"
          >
            {leading}
            {trailing}
          </div>
        )}
      </div>
    </>
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
