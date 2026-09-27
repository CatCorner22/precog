import type { ReactNode } from "react";

/** A range slider with its label and current value on one line, and an optional note below. */
export function LabelledRange({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  note,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  note?: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex justify-between gap-2">
        <span className="text-muted">{label}</span>
        <span className="tabular font-medium">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
      {note && <span className="mt-1 block text-xs text-subtle">{note}</span>}
    </label>
  );
}
