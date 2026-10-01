import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useToday } from "@/lib/use-today";
import {
  latestReview,
  monthlyReviewTasks,
  recordReview,
  RESULT_LABEL,
  reviewIndependenceMessage,
  type ReviewResult,
} from "@/lib/precog/firm/reviews";
import { recordMonthlyReview } from "@/lib/precog/firm/server";
import { getQuickBooksStatus } from "@/lib/precog/integrations/qbo/server";
import { monthlyWorkpaperFacts, type WorkpaperFact } from "@/lib/precog/firm/workpaper";
import { clientErrorStatus } from "@/lib/request-errors";
import { formatDay, localDateKey } from "@/lib/precog/dates";

/** The four monthly checks, with an append-only result on the business and, when signed in, on the server. */
export function MonthlyReview() {
  const { profile, template, setMonthlyReviews } = usePractice();
  const user = useCurrentUser();
  const today = localDateKey(useToday());
  const tasks = monthlyReviewTasks(today, template.people, template.roleTemplates);
  const records = profile.monthlyReviews ?? [];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [facts, setFacts] = useState<WorkpaperFact[] | null>(null);

  useEffect(() => {
    if (!user || !profile.businessId) {
      setFacts(monthlyWorkpaperFacts(null));
      return;
    }
    let cancel = false;
    void getQuickBooksStatus({ data: { businessId: profile.businessId } })
      .then((status) => {
        if (!cancel) setFacts(monthlyWorkpaperFacts(status.drift));
      })
      .catch(() => {
        if (!cancel) setFacts(monthlyWorkpaperFacts(null));
      });
    return () => {
      cancel = true;
    };
  }, [user, profile.businessId]);

  async function save(
    key: (typeof tasks)[number]["key"],
    result: ReviewResult,
    ownerName: string,
    dueOn: string,
    period: string,
  ) {
    const note = notes[key] ?? "";
    setMonthlyReviews((current) =>
      recordReview(current, { key, period, result, ownerName, notes: note }),
    );
    setNotes((current) => ({ ...current, [key]: "" }));
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
      }).then((res) => {
        if (result === "skipped") {
          toast.success("Skipped for this month on this business.");
          return;
        }
        if (res.evidenceBridged) {
          toast.success("Saved on this business and recorded in the control evidence log.");
          return;
        }
        toast.success("Saved on this business.", {
          description:
            res.evidenceSkippedReason === "migration_pending"
              ? "The evidence log is not ready on this deployment yet — your monthly note is still saved."
              : "The account evidence log did not update; try again when signed in.",
        });
      });
    } catch (error) {
      toast.error(
        "Precog saved this on the business but could not update the monthly review log in your account. Check your connection and press the result again.",
        // A refusal (not the owner, a bad value) carries the server's reason.
        error instanceof Error && clientErrorStatus(error) !== null
          ? { description: error.message }
          : undefined,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">This month’s file</h2>
      <p className="mt-1 text-sm text-muted">
        Four checks taken from the register. Record a result with an owner and a note. Precog adds a
        later result; the earlier one stays in the log. When you are signed in, Done and Exception
        also create a preparer entry in the{" "}
        <Link to="/firm" className="underline underline-offset-2">
          control evidence log
        </Link>{" "}
        (a firm reviewer still records review separately). Two facts from QuickBooks, then the four
        checks. Duty ticks on the map are starting duties, not system access. Lock the report to
        send this page. Recording “Done” does not establish independent verification.
      </p>
      {facts && (
        <ul className="mt-4 space-y-2">
          {facts.map((fact) => (
            <li key={fact.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{fact.label}</p>
              <p className="mt-1 text-muted">{fact.detail}</p>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-4 space-y-4">
        {tasks.map((task) => {
          const latest = latestReview(records, task.key, task.period);
          return (
            <li key={task.key} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{task.title}</h3>
                <p className="text-xs text-muted">
                  {task.period} · due {formatDay(task.dueOn)} · {task.suggestedOwner}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted">{task.why}</p>
              <p className="mt-2 text-xs" data-review-independence={task.reviewerIndependence}>
                {reviewIndependenceMessage(task.reviewerIndependence)}
              </p>
              {latest && (
                <p className="mt-2 text-xs">
                  Reported result: {RESULT_LABEL[latest.result]}
                  {latest.ownerName ? ` by ${latest.ownerName}` : ""} on{" "}
                  {formatDay(latest.recordedAt)}
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
