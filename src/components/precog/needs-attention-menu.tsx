import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BellDot, ChevronDown } from "lucide-react";
import { openAccessChecks } from "@/lib/precog/continuity/access-removal";
import { localDateKey } from "@/lib/precog/dates";
import { continuitySlips, decisionsDue } from "@/lib/precog/decisions/follow-through";
import { openMonthlyChecks } from "@/lib/precog/firm/reviews";
import { usePracticeState, useTemplate } from "@/lib/precog/practice-context";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";
import { buildNeedsAttentionItems, openNeedsAttentionItem } from "./needs-attention-menu.logic";

/**
 * Everything that waits on the owner, behind one header button: decisions
 * past their review date, decisions undone since they were marked done,
 * people who left whose access is unchecked, and this month's open checks
 * (from the 5th, as the reminders count them).
 * Hidden when nothing waits. The list exists only while it is open, so the
 * tab walk's count of the Advanced menu never sees these items.
 */
export function NeedsAttentionMenu({ onOpen }: { onOpen: (tab: string, item?: string) => void }) {
  const tpl = useTemplate();
  const { profile } = usePracticeState();
  const today = useToday();
  const day = localDateKey(today);

  const items = useMemo(() => {
    const overdue = decisionsDue(profile.decisions, day).overdue.length;
    const slipped = continuitySlips(profile.decisions, tpl).length;
    const leavers = openAccessChecks(
      profile.leaverAccessChecks,
      profile.industry,
      tpl.people,
    ).length;
    // From the 5th, as the reminders count them (MONTHLY_REVIEW_GRACE_DAY).
    const monthly = openMonthlyChecks(
      day,
      tpl.people,
      tpl.roleTemplates,
      profile.monthlyReviews ?? [],
    );
    return buildNeedsAttentionItems({ overdue, slipped, leavers, monthly });
  }, [
    day,
    tpl,
    profile.decisions,
    profile.leaverAccessChecks,
    profile.industry,
    profile.monthlyReviews,
  ]);

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
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const total = items.reduce((n, item) => n + item.n, 0);
  if (total === 0) return null;

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    const index = buttons.findIndex((el) => el === document.activeElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    buttons[next]?.focus();
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-needs-attention
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn"
      >
        <BellDot className="size-3.5" aria-hidden />
        Needs attention ({total})
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Needs attention"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                openNeedsAttentionItem(item, onOpen);
              }}
              className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-muted hover:bg-elevated hover:text-fg focus:bg-elevated focus:text-fg"
            >
              {item.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
