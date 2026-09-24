import { useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { localDateKey } from "@/lib/precog/decisions/follow-through";
import { useToday } from "@/lib/precog/decisions/use-today";
import {
  latestReview,
  monthlyReviewTasks,
  recordReview,
  type ReviewResult,
} from "@/lib/precog/firm/reviews";
import { recordMonthlyReview } from "@/lib/precog/firm/server";

const RESULT_LABEL: Record<ReviewResult, string> = {
  done: "Done",
  exception: "Exception",
  skipped: "Skipped",
};

/** The four monthly checks, with an append-only result on the business and, when signed in, on the server. */
export function MonthlyReview() {
  const { profile, template, replaceProfile } = usePractice();
  const user = useCurrentUser();
  const today = localDateKey(useToday());
  const tasks = monthlyReviewTasks(
    today,
    template.people.filter((p) => p.active),
  );
  const records = profile.monthlyReviews ?? [];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function save(
    key: (typeof tasks)[number]["key"],
    result: ReviewResult,
    ownerName: string,
    dueOn: string,
    period: string,
  ) {
    const note = notes[key] ?? "";
    const next = recordReview(records, {
      key,
      period,
      result,
      ownerName,
      notes: note,
    });
    replaceProfile({ ...profile, monthlyReviews: next });
    if (!user || !profile.businessId) return;
    setBusy(key);
    try {
      await recordMonthlyReview({
        data: {
          businessId: profile.businessId,
          period,
          itemKey: key,
          ownerName,
          dueOn,
          result,
          notes: note,
        },
      });
    } catch {
      toast.error(
        "Saved on this business. The account log did not update; try again while signed in.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">This month’s review</h2>
      <p className="mt-1 text-sm text-muted">
        Four checks taken from the register. Record a result with an owner and a note. A later
        result is added; the earlier one stays in the log.
      </p>
      <ul className="mt-4 space-y-4">
        {tasks.map((task) => {
          const latest = latestReview(records, task.key, task.period);
          return (
            <li key={task.key} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{task.title}</h3>
                <p className="text-xs text-muted">
                  {task.period} · due {task.dueOn} · {task.suggestedOwner}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted">{task.why}</p>
              {latest && (
                <p className="mt-2 text-xs">
                  Latest: {RESULT_LABEL[latest.result]}
                  {latest.ownerName ? ` by ${latest.ownerName}` : ""} on{" "}
                  {latest.recordedAt.slice(0, 10)}
                  {latest.notes ? ` — ${latest.notes}` : ""}
                </p>
              )}
              <label className="mt-2 block text-xs text-muted">
                Note
                <input
                  className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
                  value={notes[task.key] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [task.key]: e.target.value }))}
                  aria-label={`Note for ${task.title}`}
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(RESULT_LABEL) as ReviewResult[]).map((result) => (
                  <button
                    key={result}
                    type="button"
                    disabled={busy === task.key}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated disabled:opacity-50"
                    onClick={() =>
                      void save(task.key, result, task.suggestedOwner, task.dueOn, task.period)
                    }
                  >
                    {RESULT_LABEL[result]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
