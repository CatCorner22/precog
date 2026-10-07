import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { glossaryForTab, type GlossaryTerm } from "@/lib/precog/glossary";
import { tabLabel, type NavTarget } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import { Button } from "@/components/ui/button";

/**
 * The glossary, opened from "Words used here" on a page: that page's words
 * first, then every other word Precog uses. A modal dialog, so Escape and
 * the close button return to the page. PageIntro loads this file only when
 * the link is pressed, so the definitions stay out of the code every page
 * loads first.
 */
export function GlossaryDialog({ tab, onClose }: { tab: NavTarget; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { say } = usePresentation();
  const { here, other } = glossaryForTab(tab);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-bg p-0 text-fg backdrop:bg-black/70"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="relative space-y-4 p-5">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Close Words used here"
          className="absolute top-3 right-3"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
        <div className="space-y-1 pr-10">
          <h2 id={titleId} className="text-lg font-semibold">
            Words used here
          </h2>
          <p className="text-sm text-muted">
            What the words on {tabLabel(tab, say)} mean in Precog.
          </p>
        </div>
        <TermList terms={here} />
        {other.length > 0 && (
          <details className="group rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Other words in Precog ({other.length})
            </summary>
            <div className="px-3 pb-3">
              <TermList terms={other} />
            </div>
          </details>
        )}
      </div>
    </dialog>
  );
}

function TermList({ terms }: { terms: readonly GlossaryTerm[] }) {
  const { isPlain } = usePresentation();
  return (
    <dl className="space-y-3">
      {terms.map((t) => (
        <div key={t.id}>
          <dt className="text-sm font-semibold">{t.term}</dt>
          <dd className="text-sm leading-relaxed text-muted">
            {t.definition}
            {!isPlain && t.tactical && (
              <span className="mt-0.5 block text-xs text-subtle">Tactical word: {t.tactical}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
