import { useEffect, useState } from "react";
import { readExactAmount } from "./read-exact-amount";

/** Preserve an unfinished edit until blur/Enter; never convert an empty field to zero. */
export function ExactAmount({
  label,
  value,
  min,
  limit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  limit: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(String(value));
    setError("");
  }, [value]);
  function commit() {
    const read = readExactAmount(draft, min, limit);
    if ("error" in read) {
      setError(read.error);
      return;
    }
    setError("");
    setDraft(String(read.value));
    onChange(read.value);
  }
  return (
    <span className="w-28 shrink-0">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={Boolean(error)}
        min={min}
        step="0.01"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-full rounded border border-border bg-bg px-2 py-1 text-right text-xs tabular"
      />
      {error && (
        <span className="mt-1 block text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
