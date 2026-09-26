/**
 * Small pieces the continuity planner's cards share: the Journal status of a
 * step, a labelled line of names, and the chips for items already stopped.
 */
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContinuityCommitment } from "@/lib/precog/decisions/follow-through";
import { CRITICALITY_LABEL } from "@/lib/precog/continuity/planner-copy";
import { formatDay } from "@/lib/precog/dates";
import type { KnowledgeItem } from "@/lib/precog/types";
import { cn } from "@/lib/utils";

/**
 * "In the Journal · review by Oct 26, 2026" once a step is logged, otherwise
 * the button that logs it. `inline` sits after a sentence in a numbered list.
 */
export function JournalStepStatus({
  commitment,
  onLog,
  inline = false,
}: {
  commitment: Pick<ContinuityCommitment, "reviewBy"> | undefined;
  onLog: () => void;
  inline?: boolean;
}) {
  if (commitment) {
    return (
      <span className={cn("text-xs text-subtle", inline ? "ml-2" : "block")}>
        In the Journal
        {commitment.reviewBy ? ` · review by ${formatDay(commitment.reviewBy)}` : ""}
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn("text-xs", inline ? "ml-1 h-6 px-1.5" : "h-7 px-2")}
      onClick={onLog}
    >
      <BookOpen className="size-3.5" /> Log as decision
    </Button>
  );
}

export function PeopleLine({ label, people }: { label: string; people: string[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={people.length ? "" : "text-muted"}>
        {people.length ? people.join(", ") : "nobody"}
      </span>
    </div>
  );
}

/** Register items nobody can run alone: stopped whoever is in, listed apart from what the absence stops. */
export function AlreadyStopped({
  items,
  onSelect,
}: {
  items: KnowledgeItem[];
  onSelect: (knowledgeId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        Already stopped · nobody can run {items.length === 1 ? "it" : "these"} alone
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated/60"
              onClick={() => onSelect(item.id)}
            >
              {item.name} · {CRITICALITY_LABEL[item.criticality]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A register item's name as a button that opens it in the selected-item card,
 * so rows and list entries are reachable by keyboard.
 */
export function ItemButton({
  item,
  selected,
  onSelect,
}: {
  item: Pick<KnowledgeItem, "id" | "name">;
  /** Set where the list shows which item is selected; announced as pressed. */
  selected?: boolean;
  onSelect: (knowledgeId: string) => void;
}) {
  return (
    <button
      type="button"
      className="text-left font-medium hover:underline"
      aria-pressed={selected}
      onClick={() => onSelect(item.id)}
    >
      {item.name}
    </button>
  );
}
