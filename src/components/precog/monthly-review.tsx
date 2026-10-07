import { useEffect, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useToday } from "@/lib/use-today";
import {
  appendReview,
  EVIDENCE_RECORD_NOTE,
  latestReview,
  monthlyReviewTasks,
  openPeriods,
  periodMonthName,
  recordReview,
  RESULT_LABEL,
  reviewDueText,
  reviewIndependenceMessage,
  reviewTrimNotice,
  type ReviewResult,
} from "@/lib/precog/firm/reviews";
import { recordMonthlyReview } from "@/lib/precog/firm/server";
import { getQuickBooksStatus } from "@/lib/precog/integrations/qbo/server";
import { getControlExecutionLog } from "@/lib/precog/controls/executions/server";
import type { ExecutionStatus } from "@/lib/precog/controls/executions/model";
import { evidenceLogLine, monthlyRunIds, readMonthlyEvidence } from "./monthly-review-evidence";
import { monthlyWorkpaperFacts, type WorkpaperFact } from "@/lib/precog/firm/workpaper";
import { clientErrorStatus } from "@/lib/request-errors";
import { formatDay, formatMonth, localDateKey } from "@/lib/precog/dates";
import { HowThisWorks } from "./page-intro";

/** A note draft's and a save's key: the month and the check, so switching months keeps each apart. */
function draftKey(period: string, key: string): string {
  return `${period}:${key}`;
}

/** The monthly checks, with an append-only result on the business and, when signed in, on the server. */
export function MonthlyReview() {
  const { profile, template, setMonthlyReviews } = usePractice();
  const user = useCurrentUser();
  const today = localDateKey(useToday());
  // Last month stays open until its due day, the 10th; until then the owner
  // picks the month to record, last month first.
  const periods = openPeriods(today);
  const [chosen, setChosen] = useState<string | null>(null);
  const shownPeriod = chosen && periods.includes(chosen) ? chosen : periods[0];
  const tasks = monthlyReviewTasks(today, template.people, template.roleTemplates, shownPeriod);
  const records = profile.monthlyReviews ?? [];
  // Note drafts and the save under way, each by `draftKey(period, check)`.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [facts, setFacts] = useState<WorkpaperFact[] | null>(null);
  // The evidence log's state of each monthly run this month, read when signed
  // in and again after a result is recorded; null until read or on failure.
  // `read` names the account, business and month it was read for, so another
  // business's states never print while its own read is under way.
  const [evidence, setEvidence] = useState<{
    read: string;
    statuses: Map<string, ExecutionStatus>;
  } | null>(null);
  const [evidenceRead, setEvidenceRead] = useState(0);
  const period = tasks[0]?.period ?? null;
  // The month's run ids as one string, so the effect below keys on a value.
  const itemKeys = tasks.map((t) => t.key);
  const runIds = period ? monthlyRunIds(period, itemKeys).join(" ") : "";
  // The effects key on the account id, never on `user`: the session hook
  // builds a new user object on every render, so an effect keyed on it would
  // run again after each answer it set, and keep calling the server.
  const userId = user?.id ?? null;
  // The shared preview account (auth off) is refused by the evidence log, as
  // the Control evidence panel says; the monthly review does not ask.
  const evidenceAccountId = user && !user.isDevFallback ? user.id : null;
  const businessId = profile.businessId ?? null;
  const evidenceFor = `${evidenceAccountId} ${businessId} ${period}`;
  const evidenceShown = evidence?.read === evidenceFor ? evidence.statuses : null;

  useEffect(() => {
    if (!userId || !businessId) {
      setFacts(monthlyWorkpaperFacts(null));
      return;
    }
    let cancel = false;
    void getQuickBooksStatus({ data: { businessId } })
      .then((status) => {
        if (!cancel) setFacts(monthlyWorkpaperFacts(status.drift));
      })
      .catch(() => {
        if (!cancel) setFacts(monthlyWorkpaperFacts(null));
      });
    return () => {
      cancel = true;
    };
  }, [userId, businessId]);

  useEffect(() => {
    if (!evidenceAccountId || !businessId || !period || !runIds) {
      setEvidence(null);
      return;
    }
    let cancel = false;
    void readMonthlyEvidence(
      (cursor) =>
        getControlExecutionLog({
          data: { businessId, expectedAccountId: evidenceAccountId, period, cursor },
        }),
      runIds.split(" "),
      () => cancel,
    )
      .then((statuses) => {
        if (!cancel && statuses) setEvidence({ read: evidenceFor, statuses });
      })
      .catch(() => {
        if (!cancel) setEvidence(null);
      });
    return () => {
      cancel = true;
    };
  }, [evidenceAccountId, businessId, period, runIds, evidenceFor, evidenceRead]);

  async function save(
    key: (typeof tasks)[number]["key"],
    result: ReviewResult,
    ownerName: string,
    dueOn: string,
    period: string,
  ) {
    const draft = draftKey(period, key);
    const note = notes[draft] ?? "";
    const input = { key, period, result, ownerName, notes: note };
    const trim = appendReview(records, input);
    setMonthlyReviews((current) => recordReview(current, input));
    if (trim.removed > 0) toast.message(reviewTrimNotice(trim));
    setNotes((current) => ({ ...current, [draft]: "" }));
    if (!user || !profile.businessId) return;
    setBusy(draft);
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
          today: localDateKey(new Date()),
        },
      }).then((res) => {
        setEvidenceRead((n) => n + 1);
        const skipped = `Skipped for ${formatMonth(period)} on this business.`;
        if (res.evidenceSkippedReason === "superseded") {
          toast.success("Saved on this business.", {
            description:
              "A later result for this check and month replaced this one, so the control evidence log follows that result.",
          });
          return;
        }
        if (res.evidenceBridged) {
          if (res.evidenceStatus === "withdrawn") {
            toast.success(skipped, {
              description:
                "Precog marked the check withdrawn as skipped in the control evidence log.",
            });
            return;
          }
          toast.success(
            res.evidenceStatus === "corrected"
              ? "Recorded the correction in the control evidence log."
              : "Saved on this business and recorded in the control evidence log.",
          );
          return;
        }
        // A Skipped check with no entry to withdraw, or none this deployment can write.
        if (
          result === "skipped" &&
          (res.evidenceSkippedReason === null ||
            res.evidenceSkippedReason === "bridge_disabled" ||
            res.evidenceSkippedReason === "migration_pending" ||
            res.evidenceSkippedReason === "already_recorded")
        ) {
          toast.success(skipped);
          return;
        }
        if (res.evidenceSkippedReason === "bridge_disabled") {
          toast.success("Saved on this business.", {
            description:
              "Precog does not add monthly notes to the evidence log on this deployment.",
          });
          return;
        }
        if (res.evidenceSkippedReason === "migration_pending") {
          toast.success("Saved on this business.", {
            description:
              "The evidence log is not ready on this deployment yet — your monthly note is still saved.",
          });
          return;
        }
        if (res.evidenceSkippedReason === "already_recorded") {
          toast.success("Saved on this business.", {
            description: "The evidence log already holds this result for this check and month.",
          });
          return;
        }
        // Anything else is a failure of ours or the evidence log's reason for refusing the entry.
        toast.warning("Saved on this business, but not in the evidence log.", {
          description:
            res.evidenceSkippedReason === "bridge_failed"
              ? "Precog could not add the entry. Press the result again later."
              : (res.evidenceSkippedReason ?? undefined),
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
      <h2 className="text-lg font-semibold">Monthly review</h2>
      <p className="mt-1 text-sm text-muted">
        The checks below come from the register; record each result with an owner and a note.
      </p>
      <HowThisWorks className="mt-3">
        <p>
          The monthly log keeps every result. When you are signed in, each Done or Exception for a
          check and month also goes into the control evidence log as a preparer entry dated the day
          you record it, and a changed result as a correction (a firm reviewer still records review
          separately). Through the 10th, you can still record last month. Two facts from QuickBooks,
          then the checks. Duty ticks on the map are starting duties, not system access. Lock the
          report to send this page. Recording “Done” does not establish independent verification.
        </p>
        <p className="text-xs">{EVIDENCE_RECORD_NOTE}</p>
      </HowThisWorks>
      {periods.length > 1 && (
        <div role="group" aria-label="Month to record" className="mt-3 flex flex-wrap gap-2">
          {periods.map((p, index) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === shownPeriod}
              data-period={p}
              className={
                p === shownPeriod
                  ? "rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium"
                  : "rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
              }
              onClick={() => setChosen(p)}
            >
              {index === 0 ? `${periodMonthName(p)} (due ${reviewDueText(p)})` : periodMonthName(p)}
            </button>
          ))}
        </div>
      )}
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
          const logLine = evidenceLogLine(evidenceShown, task.period, task.key);
          const draft = draftKey(task.period, task.key);
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
              {logLine && <p className="mt-1 text-xs text-muted">{logLine}</p>}
              <label className="mt-2 block text-xs text-muted">
                Note
                <input
                  className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
                  value={notes[draft] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [draft]: e.target.value }))}
                  aria-label={`Note for ${task.title}`}
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(RESULT_LABEL) as ReviewResult[]).map((result) => (
                  <button
                    key={result}
                    type="button"
                    disabled={busy === draft}
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
