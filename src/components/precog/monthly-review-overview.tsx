import { ArrowRight, Check, Circle, CircleAlert, CircleDashed } from "lucide-react";
import {
  latestReview,
  type ReviewRecord,
  type monthlyReviewTasks,
} from "@/lib/precog/firm/reviews";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { checkItemId } from "./monthly-check-id";
import { revealMonthlyItem } from "./monthly-area.logic";

type ReviewTask = ReturnType<typeof monthlyReviewTasks>[number];

const STATUS = {
  unrecorded: { label: "To record", icon: Circle, color: "text-muted" },
  done: { label: "Done", icon: Check, color: "text-ok" },
  exception: { label: "Problem found", icon: CircleAlert, color: "text-warn" },
  skipped: { label: "Skipped", icon: CircleDashed, color: "text-muted" },
};

export function MonthlyReviewOverview({
  tasks,
  records,
}: {
  tasks: readonly ReviewTask[];
  records: readonly ReviewRecord[];
}) {
  const checks = tasks.map((task) => ({
    ...task,
    status: latestReview(records, task.key, task.period)?.result ?? ("unrecorded" as const),
  }));
  const recorded = checks.filter((check) => check.status !== "unrecorded").length;
  const next =
    checks.find((check) => check.status === "exception") ??
    checks.find((check) => check.status === "unrecorded") ??
    checks.find((check) => check.status === "skipped");
  const open = (task: ReviewTask) =>
    revealMonthlyItem(checkItemId(task.period, task.key), document);

  if (!checks.length) return <p className="mt-4 text-sm text-muted">No checks for this month.</p>;

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <p className="font-medium tabular-nums">
          {recorded} of {checks.length} recorded
        </p>
        <p className="text-xs text-muted">Recorded results are not independent verification.</p>
      </div>
      <progress
        aria-label="Checks with a recorded result"
        value={recorded}
        max={checks.length}
        className="block h-1.5 w-full overflow-hidden rounded-full bg-border [&::-webkit-progress-bar]:bg-border [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
      />
      <nav
        aria-label="Review check navigation"
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {checks.map((check) => {
          const { label, icon: Icon, color } = STATUS[check.status];
          return (
            <button
              key={check.key}
              type="button"
              onClick={() => open(check)}
              data-check-status={check.status}
              className="min-w-0 rounded-lg border border-border bg-bg/40 p-3 text-left transition-colors hover:border-border-strong hover:bg-elevated pointer-coarse:min-h-11"
            >
              <span className={cn("mb-1 flex items-center gap-1.5 text-xs font-medium", color)}>
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {label}
              </span>
              <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                {check.title}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
        <div className="min-w-0 flex-1 basis-48">
          <h3 className="text-sm font-semibold">
            {!next
              ? "All checks have a Done result"
              : next.status === "exception"
                ? "Follow up on a problem"
                : next.status === "skipped"
                  ? "Revisit a skipped check"
                  : "Record your next check"}
          </h3>
          <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">
            {next ? next.title : "Your results stay below. Reopen a check to record a correction."}
          </p>
        </div>
        {next && (
          <Button variant="secondary" onClick={() => open(next)}>
            Open check <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
