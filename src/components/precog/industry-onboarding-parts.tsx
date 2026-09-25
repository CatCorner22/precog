import { useState } from "react";
import { addableDuties, coreDutyLabel, type SeatReading } from "@/lib/precog/onboarding/own-team";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { cn } from "@/lib/utils";
import { fieldCls as inputCls } from "@/components/precog/builder/form-shared";

/** The short note under a row's role: which catalog seat ticked its duties. */
export function SeatNote({ seat }: { seat: SeatReading | undefined }) {
  if (!seat) return null;
  if (!seat.title) {
    return (
      <p className="mt-1 max-w-[11rem] text-xs text-muted">Not in the catalog: tick by hand</p>
    );
  }
  return (
    <p className={cn("mt-1 max-w-[11rem] text-xs", seat.partial ? "text-warn" : "text-muted")}>
      {seat.partial ? `Partly read as ${seat.title}: check the ticks` : `Read as ${seat.title}`}
    </p>
  );
}

/**
 * Adds a duty that is not a grid column to one row: pick it, then press Add.
 * A select alone would add a duty on every arrow key in some browsers.
 */
export function AddDutyControl({
  who,
  duties,
  onAdd,
}: {
  who: string;
  duties: readonly EntitlementId[];
  onAdd: (duty: EntitlementId) => void;
}) {
  const options = addableDuties(duties);
  const [pick, setPick] = useState<EntitlementId | "">("");
  if (options.length === 0) return null;
  const chosen = pick && options.includes(pick) ? pick : "";
  return (
    <div className="mt-1 flex max-w-[11rem] items-center gap-1">
      <select
        className={cn(inputCls, "min-h-7 min-w-0 flex-1 px-1 py-0.5 text-xs")}
        aria-label={`Other duty for ${who}`}
        data-add-duty
        value={chosen}
        onChange={(e) => setPick(e.target.value as EntitlementId | "")}
      >
        <option value="">Add a duty…</option>
        {options.map((duty) => (
          <option key={duty} value={duty}>
            {coreDutyLabel(duty)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="min-h-7 rounded-md border border-border bg-panel px-2 py-0.5 text-xs text-muted hover:border-border-strong hover:text-fg disabled:opacity-50"
        aria-label={`Add the chosen duty to ${who}`}
        disabled={!chosen}
        onClick={() => {
          if (!chosen) return;
          onAdd(chosen);
          setPick("");
        }}
      >
        Add
      </button>
    </div>
  );
}
