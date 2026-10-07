import { useState } from "react";
import {
  addableDuties,
  coreDutyLabel,
  dutyShortName,
  GRID_DUTY_HEADING,
  type SeatReading,
} from "@/lib/precog/onboarding/own-team";
import { clamp } from "@/lib/precog/number";
import { count } from "@/lib/precog/text";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { cn } from "@/lib/utils";
import { fieldCls } from "@/components/ui/field-classes";

/**
 * The short note under a row's job title: every duty the title ticked, by
 * name, so a tick in a column scrolled out of view is never a surprise; and a
 * warning when only part of the title matched a catalog job.
 */
export function SeatNote({
  seat,
  duties = [],
}: {
  seat: SeatReading | undefined;
  /** The duties the row still holds because its job title ticked them. */
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
        <p className="mt-1 max-w-[11rem] text-xs text-muted">
          {`From the job title: ${duties.map(dutyShortName).join(", ")} — untick any this person does not do`}
        </p>
      )}
    </>
  );
}

/** One person whose duties a job title ticked, for the review before Finish. */
export interface TitleTicksItem {
  rowId: string;
  who: string;
  role: string;
  duties: readonly EntitlementId[];
}

/**
 * The review before Finish: how many duties job titles ticked, for whom, and
 * a link to each person's row, so nobody keeps a duty the owner never named.
 */
export function TitleTicksReview({
  items,
  onShow,
}: {
  items: readonly TitleTicksItem[];
  onShow: (rowId: string) => void;
}) {
  const ticked = items.reduce((sum, item) => sum + item.duties.length, 0);
  if (ticked === 0) return null;
  return (
    <section
      className="space-y-2 rounded-xl border border-warn/40 bg-warn/10 p-3"
      aria-labelledby="title-ticks-heading"
    >
      <h3 id="title-ticks-heading" className="text-sm font-medium">
        {`Precog ticked ${count(ticked, "duty", "duties")} from job titles for ${count(items.length, "person", "people")}: check them`}
      </h3>
      <ul className="space-y-1 text-xs text-muted">
        {items.map((item) => (
          <li key={item.rowId}>
            <button
              type="button"
              className="min-h-6 font-medium text-primary underline underline-offset-2"
              aria-label={`Go to ${item.who}'s row`}
              onClick={() => onShow(item.rowId)}
            >
              {item.who}
            </button>{" "}
            {`(${item.role}): ${item.duties.map(dutyShortName).join(", ")}`}
          </li>
        ))}
      </ul>
    </section>
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
        className={cn(fieldCls, "min-h-7 w-16 px-1 py-0.5 text-xs")}
        aria-label={`${who}: years of service`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    </label>
  );
}
