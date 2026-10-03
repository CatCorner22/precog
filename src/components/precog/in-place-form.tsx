import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useTabName } from "@/lib/precog/presentation";
import { Button } from "@/components/ui/button";

/**
 * "We already do something here": records a control the owner already has
 * against a duty gap (for example "The CFO reviews each bank reconciliation").
 * It lands in the decisions log with a review date, lowers the linked
 * findings' scores a little, and never closes the gap: the pair of duties is
 * still held by one person.
 */
export function InPlaceForm({ onRecord }: { onRecord: (text: string) => void }) {
  const tabName = useTabName();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        <ShieldCheck className="size-3.5" />
        We already do something here
      </Button>
    );
  }
  const trimmed = text.trim();
  return (
    <form
      className="mt-2 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onRecord(trimmed);
        setText("");
        setOpen(false);
      }}
    >
      <label className="block text-xs text-muted">
        What does someone else do that would catch a problem here?
        <input
          className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
          placeholder="For example: The CFO reviews each bank reconciliation and its statement"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
      </label>
      <p className="text-xs text-subtle">
        It goes in your {tabName("journal")} with a review date in 90 days. It lowers the scores a
        little but does not close the duty conflict: one person still holds both duties.
      </p>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={!trimmed}>
          Record it
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
