import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldCls } from "@/components/ui/field-classes";
import { ruleBasedReason } from "@/components/precog/builder/grok-status";
import { DRAFT_NOTES_MAX, type ProcedureDraft } from "@/lib/precog/procedures/draft";
import { draftProcedureSteps } from "@/lib/precog/procedures/draft-server";
import { PROCEDURE_LIMITS } from "@/lib/precog/procedures/normalize";

/**
 * Rough notes in, numbered steps out. The owner reads the draft and chooses
 * to add it; nothing reaches the procedure until then, and the added steps
 * are marked as AI drafts until a person edits them or verifies the
 * procedure.
 */
export function DraftFromNotes({
  title,
  placeName,
  module,
  industryLabel,
  room,
  onAdd,
}: {
  title: string;
  placeName: string;
  module: string;
  industryLabel: string;
  /** How many more steps the procedure can take. */
  room: number;
  onAdd: (draft: ProcedureDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcedureDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await draftProcedureSteps({
          data: { title, placeName, module, notes, industryLabel },
        }),
      );
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No draft came back. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5 text-accent" /> Draft steps from notes
      </Button>
    );
  }

  const reason = result
    ? ruleBasedReason(result.source, result.grokStatus, result.dailyLimit)
    : null;
  return (
    <section
      aria-labelledby="draft-notes-title"
      className="space-y-2 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-3"
    >
      <h3 id="draft-notes-title" className="flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="size-3.5 text-accent" aria-hidden /> Draft steps from notes
      </h3>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Describe the task the way you would tell someone, in any order of detail. Signed in, Grok
        turns it into steps; Precog first removes anything that looks like a password or card
        number.
        <textarea
          className={`${fieldCls} w-full`}
          rows={4}
          value={notes}
          maxLength={DRAFT_NOTES_MAX}
          placeholder={
            "Need: bookkeeper sign-in\nOpen Banking and pick the checking account, then match each line to the statement. If it's off, don't click Undo, call me."
          }
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={run} disabled={loading || !notes.trim()}>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {result ? "Draft again" : "Draft the steps"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
        >
          Close
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-2 text-sm" aria-live="polite">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
            <Badge variant={result.source === "grok" ? "accent" : "default"}>
              {result.source === "grok"
                ? ["Grok", result.model].filter(Boolean).join(" · ")
                : "From your notes"}
            </Badge>
            {reason && <span>{reason}</span>}
          </div>
          {result.steps.length === 0 ? (
            <p className="text-xs text-muted">Precog found no steps in these notes.</p>
          ) : (
            <>
              {result.purpose && <p className="text-xs">{result.purpose}</p>}
              {result.prerequisites.length > 0 && (
                <p className="text-xs text-muted">
                  Needed first: {result.prerequisites.join("; ")}
                </p>
              )}
              <ol className="list-decimal space-y-0.5 pl-5">
                {result.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {result.steps.length > room && (
                <p className="text-xs text-warn">
                  Only the first {room} {room === 1 ? "step fits" : "steps fit"}; a procedure holds
                  at most {PROCEDURE_LIMITS.steps}.
                </p>
              )}
              <Button
                size="sm"
                disabled={room === 0}
                onClick={() => {
                  onAdd(result);
                  setOpen(false);
                  setResult(null);
                  setNotes("");
                }}
              >
                Add these steps
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
