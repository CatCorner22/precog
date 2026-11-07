import { ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";
import { usePracticeActions } from "@/lib/precog/practice-context";
import type { NavFn } from "@/lib/precog/navigation";
import type { StartHereModel } from "@/lib/precog/start-here/model";

/**
 * The top of Home: on the sample team, the note that the gaps are the
 * sample's. Decisions to review and leavers to check are in the header's
 * "Needs attention" menu, on every tab.
 */
export function StartHerePreamble({
  model,
}: {
  model: StartHereModel["preamble"];
  /** Unused since the decision and leaver notices moved to "Needs attention"; kept for the caller. */
  onOpenDetail?: NavFn;
}) {
  const { isSampleTeam, industryLabel } = model;
  const { createBusiness } = usePracticeActions();

  /** Opens setup for the owner's own business, as the business menu's "Set up my own business" does. */
  async function enterOwnTeam() {
    const result = await createBusiness(model.industryId);
    if (!result.ok) toast.error("Could not start setup", { description: result.reason });
  }

  return (
    <>
      {isSampleTeam && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="flex items-start gap-2 text-sm font-medium text-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>These gaps describe the sample team, not yours yet.</span>
            </p>
            <button
              type="button"
              onClick={() => void enterOwnTeam()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Enter your own team
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
          <details className="mt-1 text-xs leading-relaxed text-muted">
            <summary className="min-h-11 w-fit cursor-pointer content-center rounded-md font-medium text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Why the gaps are the sample&rsquo;s
            </summary>
            <p className="mt-1">
              Names and duties below come from the loaded {industryLabel} sample. Staff settings
              such as team size affect scores but cannot show who does what. These conflicts remain
              the sample&rsquo;s until you enter your own people and duties. Setup opens your own
              business. The sample stays in the business menu.
            </p>
          </details>
        </div>
      )}
    </>
  );
}
