import { useState } from "react";
import {
  addableDuties,
  coreDutyLabel,
  GRID_DUTY_HEADING,
  type SeatReading,
} from "@/lib/precog/onboarding/own-team";
import { clamp } from "@/lib/precog/number";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { cn } from "@/lib/utils";
import { fieldCls as inputCls } from "@/components/precog/builder/form-shared";

/** The short note under a row's job title: which catalog job ticked its duties. */
export function SeatNote({ seat }: { seat: SeatReading | undefined }) {
  if (!seat) return null;
  if (!seat.title) {
    return (
      <p className="mt-1 max-w-[11rem] text-xs text-muted">Not in the catalog: tick by hand</p>
    );
  }
  return (
    <p className={cn("mt-1 max-w-[11rem] text-xs", seat.partial ? "text-warn" : "text-muted")}>
      {seat.partial
        ? `Catalog job (partial match): ${seat.title}; check the ticks`
        : `Catalog job: ${seat.title}`}
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

/**
 * A duty column's short heading. The full duty wording shows beneath it on
 * hover, on keyboard focus and on a tap, so it is not only in a tooltip that
 * keyboard and touch users never see.
 */
export function DutyHeading({ duty }: { duty: EntitlementId }) {
  const full = coreDutyLabel(duty);
  const id = `duty-heading-${duty}`;
  return (
    <span
      tabIndex={0}
      aria-describedby={id}
      className="group relative inline-block cursor-help rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
    >
      {GRID_DUTY_HEADING[duty] ?? full}
      <span
        id={id}
        role="tooltip"
        className="invisible absolute top-full left-1/2 z-40 mt-1 w-40 -translate-x-1/2 rounded-md border border-border bg-panel p-2 text-left text-xs font-normal text-fg shadow-lg group-hover:visible group-focus:visible"
      >
        {full}
      </span>
    </span>
  );
}

/**
 * Years of service for one row, typed by hand; a pasted roster fills it from
 * hire dates. The value is kept as typed and saved when the field is left,
 * so "2.5" can be typed one character at a time.
 */
export function YearsHereInput({
  who,
  years,
  onCommit,
}: {
  who: string;
  years: number | undefined;
  onCommit: (years: number | undefined) => void;
}) {
  const [text, setText] = useState(years === undefined ? "" : String(years));
  function commit() {
    const value = text.trim() === "" ? undefined : Number(text);
    if (value === undefined) {
      if (years !== undefined) onCommit(undefined);
      return;
    }
    if (!Number.isFinite(value)) {
      setText(years === undefined ? "" : String(years));
      return;
    }
    const clamped = clamp(value, 0, 60);
    if (clamped !== years) onCommit(clamped);
    else setText(String(clamped));
  }
  return (
    <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
      Years here
      <input
        type="number"
        min={0}
        max={60}
        step={0.5}
        inputMode="decimal"
        className={cn(inputCls, "min-h-7 w-16 px-1 py-0.5 text-xs")}
        aria-label={`${who}: years of service`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    </label>
  );
}
