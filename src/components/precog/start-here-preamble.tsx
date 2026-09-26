import { ArrowRight } from "lucide-react";
import { industryMeta } from "@/lib/precog/industry";
import { LeaverAccessList } from "@/components/precog/leaver-access";
import type { StartHereModel } from "./use-start-here";

export function StartHerePreamble({
  model,
  onOpenDetail,
}: {
  model: StartHereModel;
  onOpenDetail?: (tab: string) => void;
}) {
  const { overdue, slipped, isSampleTeam, profile } = model;

  return (
    <>
      {overdue.length > 0 && onOpenDetail && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {overdue.length} decision(s) past their review date —{" "}
          <button
            type="button"
            onClick={() => onOpenDetail("journal")}
            className="font-medium underline hover:text-fg"
          >
            review now
          </button>
        </div>
      )}

      {slipped.length > 0 && onOpenDetail && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          Continuity slipped on {slipped.length} item(s) you had closed as done (
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
            The names and duty assignments below come from the loaded{" "}
            {industryMeta(profile.industry).label.toLowerCase()} example. Staff settings such as
            team size affect the scoring but cannot say who does what, so the conflicts shown are
            the example&rsquo;s until you enter your own people and their duties.
          </p>
          {onOpenDetail && (
            <button
              type="button"
              onClick={() => onOpenDetail("map")}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Enter your own team
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
    </>
  );
}
