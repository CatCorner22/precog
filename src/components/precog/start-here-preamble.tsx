import { ArrowRight } from "lucide-react";
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
        <div className="rounded-lg border border-warn/40 bg-warn/5 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-medium text-warn">
              These gaps describe the sample team, not yours yet.
            </p>
            <button
              type="button"
              onClick={() => void enterOwnTeam()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Enter your own team
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
          <details className="mt-1 text-xs leading-relaxed text-muted">
            <summary className="cursor-pointer font-medium text-muted hover:text-fg">
              Why the gaps are the sample&rsquo;s
            </summary>
            <p className="mt-1">
              The names and duty assignments below come from the loaded {industryLabel} sample.
              Staff settings such as team size affect the scoring but cannot say who does what, so
              the conflicts shown are the sample&rsquo;s until you enter your own people and their
              duties. Setup opens for your own business; the sample stays in the business menu.
            </p>
          </details>
        </div>
      )}
    </>
  );
}
