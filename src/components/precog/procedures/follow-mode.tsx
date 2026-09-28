import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, ClipboardCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shownSteps } from "@/lib/precog/procedures/lifecycle";
import type { Procedure } from "@/lib/precog/procedures/types";
import { StoredPicture } from "./step-pictures";

/**
 * One step at a time, in large text, for the person doing the task: the
 * step, its caution and pictures, and who to ask when stuck. At the end it
 * offers to record the run as proof that someone other than the usual
 * person can do it. Escape closes it; nothing is saved by following.
 */
export function FollowMode({
  procedure,
  businessId,
  askName,
  onClose,
  onRecordRun,
}: {
  procedure: Procedure;
  businessId: string;
  /** Who to ask when stuck: the person who does it today, or null when nobody is named. */
  askName: string | null;
  onClose: () => void;
  onRecordRun: () => void;
}) {
  // The same steps, in the same numbering, as the procedure view, print and export.
  const steps = shownSteps(procedure);
  const dialog = useRef<HTMLDialogElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const finished = index >= steps.length;
  const step = steps[index];

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  // Keep the keyboard on the main button as the steps change.
  useEffect(() => next.current?.focus(), [index]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="follow-title"
      className="m-auto flex max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-bg p-0 text-fg backdrop:bg-black/70"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 id="follow-title" className="text-base font-semibold">
            {procedure.title}
          </h2>
          <p className="text-xs text-muted">
            {finished ? `All ${steps.length} steps done` : `Step ${index + 1} of ${steps.length}`}
          </p>
        </div>
        <Button size="sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div
        className="h-1 bg-border"
        role="progressbar"
        aria-label="Steps done"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={Math.min(index, steps.length)}
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${(Math.min(index, steps.length) / Math.max(1, steps.length)) * 100}%` }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5" aria-live="polite">
        {finished ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto size-10 text-ok" aria-hidden />
            <p className="text-lg font-medium">You have done every step.</p>
            <p className="text-sm text-muted">
              If someone other than the usual person just followed it, record the run. It shows the
              procedure works for a stand-in.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {step.text.trim() && <p className="text-xl leading-relaxed sm:text-2xl">{step.text}</p>}
            {step.caution && (
              <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-base text-warn">
                Caution: {step.caution}
              </p>
            )}
            {step.requiresPhoto && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Camera className="size-4" aria-hidden /> Take a photo as you do this step.
              </p>
            )}
            {step.imageIds && step.imageIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {step.imageIds.map((id, j) => (
                  <StoredPicture
                    key={id}
                    businessId={businessId}
                    imageId={id}
                    alt={`Picture ${j + 1} for step ${index + 1}`}
                    className="max-h-72 w-auto max-w-full"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border p-4">
        {!finished && (
          <p className="text-xs text-muted">
            Stuck? Stop and ask {askName ?? "the owner"} before going on.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          {finished ? (
            <>
              <Button ref={next} className="ml-auto" onClick={onRecordRun}>
                <ClipboardCheck className="size-4" /> Record this run
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </>
          ) : (
            <Button ref={next} className="ml-auto" onClick={() => setIndex((i) => i + 1)}>
              {index === steps.length - 1 ? "Done, finish" : "Done, next step"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
