import { useState } from "react";
import {
  addableDuties,
  coreDutyLabel,
  dutyShortName,
  type SeatReading,
} from "@/lib/precog/onboarding/own-team";
import { clamp } from "@/lib/precog/number";
import { count } from "@/lib/precog/text";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { cn } from "@/lib/utils";
import { fieldCls } from "@/components/ui/field-classes";

/**
 * The short note under a row's job title: every duty the title suggested
 * that the owner has not yet kept, by name, so a tick in a column scrolled
 * out of view is never a surprise; and a warning when only part of the
 * title matched a catalog job.
 */
export function SeatNote({
  seat,
  duties = [],
}: {
  seat: SeatReading | undefined;
  /** The duties the row holds only because its job title suggested them. */
  duties?: readonly EntitlementId[];
}) {
  if (!seat) return null;
  if (!seat.title) {
    return (
      <p className="mt-1 max-w-[11rem] text-xs text-muted">Not in the catalog: tick by hand</p>
    );
  }
  return (
    <>
      {seat.partial ? (
        <p className="mt-1 max-w-[11rem] text-xs text-warn">
          {`Catalog job (partial match): ${seat.title}; check the ticks`}
        </p>
      ) : duties.length === 0 ? (
        <p className="mt-1 max-w-[11rem] text-xs text-muted">{`Catalog job: ${seat.title}`}</p>
      ) : null}
      {duties.length > 0 && (
        <p className="mt-1 max-w-[11rem] text-xs text-warn">
          {`From the job title, not counted yet: ${duties.map(dutyShortName).join(", ")}. Keep or remove each below the table.`}
        </p>
      )}
    </>
  );
}

/** One person whose job title suggested duties the owner has not yet kept or removed. */
export interface TitleTicksItem {
  rowId: string;
  who: string;
  role: string;
  duties: readonly EntitlementId[];
}

/**
 * The review before Finish: every duty a job title suggested and the owner
 * has not yet decided, column or not, by its full name, person by person,
 * each with Keep and Remove. "Keep all" sits under the duties it keeps. A
 * suggested duty counts only once kept, and Finish waits until none is left.
 */
export function TitleTicksReview({
  items,
  onShow,
  onKeep,
  onRemove,
}: {
  items: readonly TitleTicksItem[];
  onShow: (rowId: string) => void;
  onKeep: (rowId: string, duties: readonly EntitlementId[]) => void;
  onRemove: (rowId: string, duty: EntitlementId) => void;
}) {
  const waiting = items.reduce((sum, item) => sum + item.duties.length, 0);
  if (waiting === 0) return null;
  const small =
    "min-h-7 rounded-md border px-2 py-0.5 text-xs pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <section
      id="title-ticks"
      className="space-y-2 rounded-xl border border-warn/40 bg-warn/10 p-3"
      aria-labelledby="title-ticks-heading"
    >
      <h3 id="title-ticks-heading" className="text-sm font-medium">
        {`Job titles suggested ${count(waiting, "duty", "duties")} for ${count(items.length, "person", "people")}: keep or remove each`}
      </h3>
      <p className="text-xs text-muted">
        Precog counts a suggested duty only once you keep it. Keep what each person does today;
        remove the rest.
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.rowId}
            data-confirm-row={item.rowId}
            className="space-y-1.5 rounded-lg border border-border bg-panel p-2 text-xs"
          >
            <p>
              <button
                type="button"
                className="min-h-6 font-medium text-primary underline underline-offset-2"
                aria-label={`Go to ${item.who}'s row`}
                onClick={() => onShow(item.rowId)}
              >
                {item.who}
              </button>{" "}
              <span className="text-muted">{`(${item.role}) does these, from the job title:`}</span>
            </p>
            <ul className="space-y-1" aria-label={`Suggested duties for ${item.who}`}>
              {item.duties.map((duty) => {
                const label = coreDutyLabel(duty);
                return (
                  <li
                    key={duty}
                    className="flex max-w-md flex-wrap items-center justify-between gap-2"
                  >
                    <span>{label}</span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        data-keep
                        className={cn(small, "border-primary/50 bg-primary/10 text-fg")}
                        aria-label={`Keep ${label} for ${item.who}`}
                        onClick={() => onKeep(item.rowId, [duty])}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        className={cn(
                          small,
                          "border-border bg-panel text-muted hover:border-danger hover:text-danger",
                        )}
                        aria-label={`Remove ${label} from ${item.who}`}
                        onClick={() => onRemove(item.rowId, duty)}
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            {item.duties.length > 1 && (
              <button
                type="button"
                className={cn(small, "border-primary/50 bg-primary/10 font-medium text-fg")}
                onClick={() => onKeep(item.rowId, item.duties)}
              >
                {`Keep all ${item.duties.length} for ${item.who}`}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Why the finish button waits: how many suggested duties are still to keep
 * or remove, and a link to the first person they belong to.
 */
export function FinishWaitsNote({
  id,
  finishLabel,
  waiting,
  first,
  onShow,
}: {
  id: string;
  finishLabel: string;
  waiting: number;
  first: TitleTicksItem;
  onShow: (rowId: string) => void;
}) {
  return (
    <p id={id} className="text-xs text-warn" role="status">
      {`“${finishLabel}” works once you keep or remove each duty a job title suggested: ${count(waiting, "duty", "duties")} left. `}
      <button
        type="button"
        className="min-h-6 font-medium text-primary underline underline-offset-2"
        onClick={() => onShow(first.rowId)}
      >
        {`Start with ${first.who}`}
      </button>
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
  hidden,
  onAdd,
}: {
  who: string;
  duties: readonly EntitlementId[];
  hidden?: ReadonlySet<EntitlementId>;
  onAdd: (duty: EntitlementId) => void;
}) {
  const options = addableDuties(duties).filter((duty) => !hidden?.has(duty));
  const [pick, setPick] = useState<EntitlementId | "">("");
  if (options.length === 0) return null;
  const chosen = pick && options.includes(pick) ? pick : "";
  return (
    <div className="mt-1 flex max-w-[11rem] items-center gap-1">
      <select
        className={cn(fieldCls, "min-h-7 min-w-0 flex-1 px-1 py-0.5 text-xs")}
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
      {dutyShortName(duty)}
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
        className={cn(fieldCls, "min-h-7 w-16 px-1 py-0.5 text-xs")}
        aria-label={`${who}: years of service`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    </label>
  );
}
