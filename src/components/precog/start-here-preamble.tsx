import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { LeaverAccessList } from "@/components/precog/leaver-access";
import { usePracticeActions } from "@/lib/precog/practice-context";
import type { NavFn } from "@/lib/precog/navigation";
import type { StartHereModel } from "@/lib/precog/start-here/model";
import { count, verb } from "@/lib/precog/text";

export function StartHerePreamble({
  model,
  onOpenDetail,
}: {
  model: StartHereModel["preamble"];
  onOpenDetail: NavFn;
}) {
  const { overdue, slipped, isSampleTeam, industryLabel } = model;
  const { createBusiness } = usePracticeActions();

  /** Opens setup for the owner's own business, as the business menu's "Set up my own business" does. */
  function enterOwnTeam() {
    const result = createBusiness(model.industryId);
    if (!result.ok) toast.error("Could not start setup", { description: result.reason });
  }

  return (
    <>
      {overdue.length > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {count(overdue.length, "decision")} past {verb(overdue.length, "its", "their")} review
          date —{" "}
          <button
            type="button"
            onClick={() => onOpenDetail("journal")}
            className="font-medium underline hover:text-fg"
          >
            review now
          </button>
        </div>
      )}

      {slipped.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Continuity slipped on {count(slipped.length, "item")} you had closed as done (
          {slipped.map((s) => s.decision.subject).join(", ")}) —{" "}
          <button
            type="button"
            onClick={() => onOpenDetail("journal")}
            className="font-medium underline hover:text-fg"
          >
            reopen
          </button>
        </div>
      )}

      <LeaverAccessList />

      {isSampleTeam && (
        <div className="rounded-lg border border-warn/40 bg-warn/5 p-4">
          <p className="text-sm font-medium text-warn">
            These findings describe the sample team, not yours yet.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            The names and duty assignments below come from the loaded {industryLabel} example. Staff
            settings such as team size affect the scoring but cannot say who does what, so the
            conflicts shown are the example&rsquo;s until you enter your own people and their
            duties. Setup opens for your own business; the sample stays in the business menu.
          </p>
          <button
            type="button"
            onClick={enterOwnTeam}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Enter your own team
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
