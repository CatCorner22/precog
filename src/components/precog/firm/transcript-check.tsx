import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  compareTranscripts,
  MAX_TRANSCRIPT_CHARS,
  type TranscriptDifference,
} from "@/lib/precog/transcript-check";

const PAGE_SIZE = 50;
const LABELS = {
  negation: "Negation",
  amount: "Amount or number",
  date: "Date",
  name: "Capitalized name",
} as const;

export function TranscriptCheck() {
  const id = useId();
  const [transcript, setTranscript] = useState("");
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<TranscriptDifference[] | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  function reset() {
    setResult(null);
    setError("");
    setPage(0);
  }
  function compare() {
    reset();
    if (!transcript.trim() || !reference.trim()) {
      setError("Paste both texts before comparing.");
      return;
    }
    try {
      setResult(compareTranscripts(transcript, reference));
    } catch (error) {
      setError(error instanceof Error ? error.message : "These texts could not be compared.");
    }
  }
  return (
    <section
      aria-label="Interview transcript check"
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-lg font-semibold">Interview transcript check</h2>
      <p className="mt-2 text-sm">
        This check compares wording. It never judges whether anyone told the truth.
      </p>
      <p className="mt-2 text-sm text-muted">
        Browser only. Nothing is uploaded or saved. There is no engagement-note save for this
        comparison. Closing this tool clears its contents.
      </p>
      <p className="mt-2 text-sm text-muted">
        Each text is limited to {MAX_TRANSCRIPT_CHARS.toLocaleString("en-US")} characters. Very
        different texts may need smaller excerpts. Slash dates use month/day/year unless the year
        comes first; capitalized words are name candidates, not verified identities.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          compare();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { label: "Transcript", value: transcript, change: setTranscript },
              { label: "Reference text", value: reference, change: setReference },
            ] as const
          ).map(({ label, value, change }, index) => (
            <div key={label}>
              <label htmlFor={`${id}-${index}`} className="block text-sm font-medium">
                {label}
              </label>
              <textarea
                id={`${id}-${index}`}
                autoComplete="off"
                spellCheck={false}
                rows={4}
                className="mt-1 w-full rounded-md border border-border bg-bg p-2 text-sm"
                value={value}
                onChange={(event) => {
                  change(event.target.value);
                  reset();
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="submit">Compare wording</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setTranscript("");
              setReference("");
              reset();
            }}
          >
            Clear texts
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      )}
      {result !== null && (
        <>
          <p role="status" className="mt-4 text-sm font-medium">
            {result.length
              ? `${result.length} wording differences to review.`
              : "No differences found in negations, amounts, dates or capitalized names."}
          </p>
          <p className="mt-1 text-xs text-muted">
            One-based lines and columns (UTF-16). Offsets are zero-based, end-exclusive. Empty spans
            mark insertion points; excerpts keep the original wording.
          </p>
          <ol start={page * PAGE_SIZE + 1} className="mt-3 space-y-3">
            {result.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item, index) => (
              <li
                key={page * PAGE_SIZE + index}
                className="rounded-md border border-border p-3"
                aria-label={`${LABELS[item.kind]} difference`}
              >
                <h3 className="text-sm font-semibold">{LABELS[item.kind]}</h3>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {(["transcript", "reference"] as const).map((side) => (
                    <div key={side} className="min-w-0">
                      <p className="text-xs text-muted">
                        {side === "transcript" ? "Transcript" : "Reference"}: line {item[side].line}
                        , column {item[side].column}; offsets {item[side].start}–{item[side].end}
                        {item[side].start === item[side].end ? " (insertion point)" : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                        {item[side].snippet || "(empty text)"}
                      </p>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {result.length > PAGE_SIZE && (
            <nav aria-label="Difference pages" className="mt-3 flex items-center gap-3 text-sm">
              <Button
                type="button"
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous differences
              </Button>
              <span>
                Page {page + 1} of {Math.ceil(result.length / PAGE_SIZE)}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={(page + 1) * PAGE_SIZE >= result.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next differences
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
