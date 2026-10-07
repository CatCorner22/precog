import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BellDot, ChevronDown } from "lucide-react";
import { openAccessChecks } from "@/lib/precog/continuity/access-removal";
import { localDateKey } from "@/lib/precog/dates";
import { continuitySlips, decisionsDue } from "@/lib/precog/decisions/follow-through";
import { usePracticeState, useTemplate } from "@/lib/precog/practice-context";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";
import {
  buildNeedsAttentionItems,
  groupNeedsAttentionItems,
  needsAttentionTotal,
  openNeedsAttentionItem,
  type AttentionGroup,
  type AttentionInput,
  type AttentionItem,
} from "./needs-attention-menu.logic";

/**
 * Everything that waits on the team, behind one header button and grouped by
 * person: decisions past their review date, decisions undone since they were
 * marked done, people who left whose access is unchecked, the Monthly
 * review's checks not done for the month that is due (last month through the
 * 10th, then this month), and each check with an exception to resolve in
 * either open month.
 * Hidden when nothing waits. The list exists only while it is open, so the
 * tab walk's count of the Advanced menu never sees these items.
 */
export function NeedsAttentionMenu({
  onOpen,
  compactOnPhone = false,
}: {
  onOpen: (tab: string, item?: string) => void;
  /** Bell and count only on a phone; the words stay for screen readers. */
  compactOnPhone?: boolean;
}) {
  const tpl = useTemplate();
  const { profile } = usePracticeState();
  const today = useToday();
  const day = localDateKey(today);

  const input = useMemo<AttentionInput>(
    () => ({
      day,
      people: tpl.people,
      roleDuties: tpl.roleTemplates,
      overdue: decisionsDue(profile.decisions, day).overdue,
      slipped: continuitySlips(profile.decisions, tpl).map((slip) => slip.decision),
      leavers: openAccessChecks(profile.leaverAccessChecks, profile.industry, tpl.people).length,
      reviews: profile.monthlyReviews ?? [],
    }),
    [
      day,
      tpl,
      profile.decisions,
      profile.leaverAccessChecks,
      profile.industry,
      profile.monthlyReviews,
    ],
  );
  // The button's count needs no words; the items and their groups are built
  // only while the menu is open.
  const total = useMemo(() => needsAttentionTotal(input), [input]);
  const [open, setOpen] = useState(false);
  const groups = useMemo(
    () => (open ? groupNeedsAttentionItems(buildNeedsAttentionItems(input), input.people) : []),
    [open, input],
  );
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
        {compactOnPhone ? (
          <>
            <span className="sr-only sm:not-sr-only">Needs attention </span>({total})
          </>
        ) : (
          <>Needs attention ({total})</>
        )}
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
          className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
          <NeedsAttentionList
            groups={groups}
            itemRefs={itemRefs}
            onPick={(item) => {
              setOpen(false);
              openNeedsAttentionItem(item, onOpen);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The open menu's rows: each person's name over their items, then
 * "Unassigned". Every row is a menu item at least 44px tall on a touch
 * screen; `itemRefs` holds them in order for the arrow keys.
 */
export function NeedsAttentionList({
  groups,
  itemRefs,
  onPick,
}: {
  groups: readonly AttentionGroup[];
  itemRefs?: { current: (HTMLButtonElement | null)[] };
  onPick: (item: AttentionItem) => void;
}) {
  const base = useId();
  let index = 0;
  return groups.map((group, g) => {
    const headingId = `${base}-${g}`;
    return (
      <div key={group.who ?? ""} role="group" aria-labelledby={headingId}>
        <div
          id={headingId}
          role="presentation"
          className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-subtle uppercase"
        >
          {group.heading}
        </div>
        {group.items.map((item) => {
          const i = index++;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (itemRefs) itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => onPick(item)}
              className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-muted hover:bg-elevated hover:text-fg focus:bg-elevated focus:text-fg pointer-coarse:min-h-11"
            >
              {item.text}
            </button>
          );
        })}
      </div>
    );
  });
}
