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
  OTHER_PROBLEM_KEY,
  openPeriods,
  otherProblemItemKey,
  otherProblemLine,
  otherProblems,
  otherProblemSaveProblem,
  periodMonthName,
  recordReview,
  resolvedNote,
  reviewDueText,
  reviewIndependenceLabel,
  reviewIndependenceMessage,
  reviewSaveProblem,
  reviewTrimNotice,
  savedResultLine,
  type ReviewRecord,
  type ReviewResult,
} from "@/lib/precog/firm/reviews";
import { recordMonthlyReview } from "@/lib/precog/firm/server";
import { getQuickBooksStatus } from "@/lib/precog/integrations/qbo/server";
import { getControlExecutionLog } from "@/lib/precog/controls/executions/server";
import type { ExecutionStatus } from "@/lib/precog/controls/executions/model";
import {
  evidenceLogLine,
  monthlyRunIds,
  readMonthlyEvidence,
  SOMEONE_ELSE,
  type WhoPick,
} from "./monthly-review-evidence";
import { monthlyWorkpaperFacts, type WorkpaperFact } from "@/lib/precog/firm/workpaper";
import { clientErrorStatus } from "@/lib/request-errors";
import { formatDay, formatMonth, localDateKey } from "@/lib/precog/dates";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "./page-intro";
import { checkItemId } from "./monthly-check-id";

/** A note draft's and a save's key: the month and the check, so switching months keeps each apart. */
function draftKey(period: string, key: string): string {
  return `${period}:${key}`;
}

/**
 * The words on a result button. The screen alone says what Exception means;
 * the report prints `RESULT_LABEL`.
 */
const RESULT_BUTTON: Record<ReviewResult, string> = {
  done: "Done",
  exception: "Exception (found a problem)",
  skipped: "Skipped",
};

/**
 * The monthly checks, with an append-only result on the business and, when
 * signed in, on the server. `focusPeriod` is the month of a check opened from
 * Needs attention; when that month is open, it is the month on screen.
 */
export function MonthlyReview({ focusPeriod = null }: { focusPeriod?: string | null } = {}) {
  const { profile, template, setMonthlyReviews } = usePractice();
  const user = useCurrentUser();
  const today = localDateKey(useToday());
  // Last month stays open until its due day, the 10th; until then the owner
  // picks the month to record, last month first.
  const periods = openPeriods(today);
  const [chosen, setChosen] = useState<string | null>(focusPeriod);
  // A newly opened check shows its month in this same render, so the check is
  // on the page by the time Monthly review scrolls to it.
  const [focusSeen, setFocusSeen] = useState(focusPeriod);
  if (focusPeriod !== focusSeen) {
    setFocusSeen(focusPeriod);
    if (focusPeriod) setChosen(focusPeriod);
  }
  const shownPeriod = chosen && periods.includes(chosen) ? chosen : periods[0];
  const tasks = monthlyReviewTasks(today, template.people, template.roleTemplates, shownPeriod);
  const records = profile.monthlyReviews ?? [];
  // Note drafts and the save under way, each by `draftKey(period, check)`.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Who did each check, by `draftKey`. Every check starts empty and waits for
  // its own choice: a pick carried over from another check could credit a
  // check to someone the owner never chose.
  const [picks, setPicks] = useState<Record<string, WhoPick>>({});
  // Why a press of a result was refused, by `draftKey`.
  const [problems, setProblems] = useState<Record<string, string>>({});
  const team = [
    ...new Set(template.people.filter((p) => p.active !== false).map((p) => p.name.trim())),
  ].filter(Boolean);
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
  // A typed note no result has saved yet, which closing the page would lose.
  const unsaved = Object.values(notes).some((note) => note.trim() !== "");

  useEffect(() => {
    if (!unsaved || typeof window === "undefined") return;
    const warn = (event: Event) => {
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  /**
   * The pick shown for a check: its own, else empty. A name no longer on the
   * active team (someone left, or another business is open) is never saved
   * silently: the check falls back to empty.
   */
  function pickFor(draft: string): WhoPick {
    const valid = (pick: WhoPick | null | undefined): pick is WhoPick =>
      Boolean(pick && (pick.choice === SOMEONE_ELSE || team.includes(pick.choice)));
    const own = picks[draft];
    return valid(own) ? own : { choice: "", other: "" };
  }

  function setPick(draft: string, pick: WhoPick) {
    setPicks((current) => ({ ...current, [draft]: pick }));
    setProblems((current) => ({ ...current, [draft]: "" }));
  }

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
    dueOn: string,
    period: string,
    noteOverride?: string,
  ) {
    const draft = draftKey(period, key);
    const note = noteOverride ?? notes[draft] ?? "";
    // The person picked for this check, never the suggested one.
    const pick = pickFor(draft);
    const ownerName = (pick.choice === SOMEONE_ELSE ? pick.other : pick.choice).trim();
    const input = { key, period, result, ownerName, notes: note };
    const problem = reviewSaveProblem(input);
    if (problem) {
      setProblems((current) => ({ ...current, [draft]: problem }));
      return;
    }
    setProblems((current) => ({ ...current, [draft]: "" }));
    setPicks((current) => ({ ...current, [draft]: pick }));
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

  /**
   * Saves another problem of `period` as an Exception on the business. It is
   * not a check, so it never goes to the monthly review log, where the
   * firm's client table counts checks, nor to the control evidence log.
   */
  function recordProblem(period: string) {
    const draft = draftKey(period, OTHER_PROBLEM_KEY);
    const pick = pickFor(draft);
    const ownerName = (pick.choice === SOMEONE_ELSE ? pick.other : pick.choice).trim();
    const note = notes[draft] ?? "";
    const problem = otherProblemSaveProblem({ ownerName, notes: note });
    if (problem) {
      setProblems((current) => ({ ...current, [draft]: problem }));
      return;
    }
    const input = {
      key: OTHER_PROBLEM_KEY,
      period,
      result: "exception" as const,
      ownerName,
      notes: note,
    };
    saveOnBusiness(input);
    // The next problem waits for its own choice of who found it.
    setPicks((current) => ({ ...current, [draft]: { choice: "", other: "" } }));
    setNotes((current) => ({ ...current, [draft]: "" }));
  }

  /** Saves Done for another problem, naming the problem it resolves. */
  function resolveProblem(period: string, found: ReviewRecord) {
    const draft = draftKey(period, otherProblemItemKey(found.recordedAt));
    const pick = pickFor(draft);
    const ownerName = (pick.choice === SOMEONE_ELSE ? pick.other : pick.choice).trim();
    if (!ownerName) {
      setProblems((current) => ({ ...current, [draft]: "Choose who resolved it." }));
      return;
    }
    saveOnBusiness({
      key: OTHER_PROBLEM_KEY,
      period,
      result: "done",
      ownerName,
      notes: resolvedNote("", found.notes),
      resolves: found.recordedAt,
    });
  }

  function saveOnBusiness(input: Omit<ReviewRecord, "recordedAt">) {
    const trim = appendReview(records, input);
    setMonthlyReviews((current) => recordReview(current, input));
    if (trim.removed > 0) toast.message(reviewTrimNotice(trim));
    toast.success("Saved on this business.", {
      description:
        "Another problem is not a check: it does not change how many checks are done, and it does not go into the control evidence log.",
    });
  }

  /** A "Who did this check" picker for `draft`: a person to choose, never filled in for you. */
  function whoPicker(draft: string, label: string, name: string) {
    const pick = pickFor(draft);
    return (
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block text-xs text-muted">
          {label}
          <select
            className="mt-1 block rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
            value={pick.choice}
            onChange={(e) => setPick(draft, { ...pick, choice: e.target.value })}
            aria-label={name}
          >
            <option value="">Choose a person</option>
            {team.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
            <option value={SOMEONE_ELSE}>Someone else</option>
          </select>
        </label>
        {pick.choice === SOMEONE_ELSE && (
          <label className="block text-xs text-muted">
            Their name
            <input
              className="mt-1 block rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
              value={pick.other}
              maxLength={80}
              onChange={(e) => setPick(draft, { ...pick, other: e.target.value })}
              aria-label={`Name for ${name}`}
            />
          </label>
        )}
      </div>
    );
  }

  // Each independence status the month's checks carry, explained once above
  // the list instead of under every check.
  const independenceLegend = [...new Set(tasks.map((task) => task.reviewerIndependence))];
  const problemDraft = shownPeriod ? draftKey(shownPeriod, OTHER_PROBLEM_KEY) : "";
  const found = shownPeriod ? otherProblems(records, shownPeriod) : [];

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Monthly review</h2>
      <p className="mt-1 text-sm text-muted">
        Do each check below. Choose who did it, then press Done, or Exception if you found a problem
        and say what you found.
      </p>
      <HowThisWorks className="mt-3">
        <p>
          Precog keeps every result you save, with who did the check and the day. Last month stays
          open until the 10th, so you can still record it. Pressing Done says the check was done; it
          does not prove that someone separate checked it.
        </p>
        <p>
          When you are signed in, each Done or Exception also goes into the control evidence log as
          a preparer entry dated the day you record it. A changed result goes in as a correction. A
          firm reviewer still records their review separately. Duty ticks on the map are starting
          duties, not system access. Lock the report to send this page.
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
                  ? "rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium pointer-coarse:min-h-11"
                  : "rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated pointer-coarse:min-h-11"
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
      {independenceLegend.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted" aria-label="Reviewer independence">
          {independenceLegend.map((status) => {
            const label = reviewIndependenceLabel(status);
            const message = reviewIndependenceMessage(status);
            // The self-review message already opens with its label.
            const rest = message.startsWith(`${label}:`)
              ? message.slice(label.length + 1)
              : message;
            return (
              <li key={status}>
                <span className="font-medium text-fg">{label}:</span>
                {rest.startsWith(" ") ? rest : ` ${rest}`}
              </li>
            );
          })}
        </ul>
      )}
      <ul className="mt-4 space-y-4">
        {tasks.map((task) => {
          const latest = latestReview(records, task.key, task.period);
          const logLine = evidenceLogLine(evidenceShown, task.period, task.key);
          const draft = draftKey(task.period, task.key);
          const pick = pickFor(draft);
          const typed = notes[draft] ?? "";
          const problem = problems[draft];
          return (
            <li
              key={task.key}
              id={checkItemId(task.period, task.key)}
              tabIndex={-1}
              // Needs attention focuses the check it opens; the outline shows which one.
              className="scroll-mt-4 rounded-lg border border-border p-3 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{task.title}</h3>
                <p className="text-xs text-muted">
                  {task.period} · due {formatDay(task.dueOn)} · Suggested: {task.suggestedOwner}
                </p>
              </div>
              <p className="mt-1 text-sm" data-covers={task.key}>
                {task.covers}
              </p>
              <p className="mt-1 text-sm text-muted">{task.why}</p>
              <p
                className={cn(
                  "mt-2 text-xs",
                  task.reviewerIndependence === "self_review" ? "text-warn" : "text-muted",
                )}
                data-review-independence={task.reviewerIndependence}
              >
                {reviewIndependenceLabel(task.reviewerIndependence)}
              </p>
              {latest && (
                <p className="mt-2 text-xs font-medium" data-saved-result={latest.result}>
                  {savedResultLine(latest, today)}
                </p>
              )}
              {logLine && <p className="mt-1 text-xs text-muted">{logLine}</p>}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="block text-xs text-muted">
                  Who did this check
                  <select
                    className="mt-1 block rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
                    value={pick.choice}
                    onChange={(e) => setPick(draft, { ...pick, choice: e.target.value })}
                    aria-label={`Who did ${task.title}`}
                  >
                    <option value="">Choose a person</option>
                    {team.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={SOMEONE_ELSE}>Someone else</option>
                  </select>
                </label>
                {pick.choice === SOMEONE_ELSE && (
                  <label className="block text-xs text-muted">
                    Their name
                    <input
                      className="mt-1 block rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
                      value={pick.other}
                      maxLength={80}
                      onChange={(e) => setPick(draft, { ...pick, other: e.target.value })}
                      aria-label={`Name of who did ${task.title}`}
                    />
                  </label>
                )}
              </div>
              <label className="mt-2 block text-xs text-muted">
                Note
                <input
                  className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
                  value={typed}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNotes((n) => ({ ...n, [draft]: value }));
                    setProblems((current) => ({ ...current, [draft]: "" }));
                  }}
                  aria-label={`Note for ${task.title}`}
                />
              </label>
              {typed.trim() !== "" && (
                <p className="mt-1 text-xs text-muted">Not saved yet: press a result</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(RESULT_BUTTON) as ReviewResult[]).map((result) => {
                  const pressed = latest?.result === result;
                  return (
                    <button
                      key={result}
                      type="button"
                      aria-pressed={pressed}
                      disabled={busy === draft}
                      className={
                        pressed
                          ? "rounded-md border border-primary bg-primary px-2 py-1 text-xs font-medium text-primary-fg disabled:opacity-50 pointer-coarse:min-h-11"
                          : "rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated disabled:opacity-50 pointer-coarse:min-h-11"
                      }
                      onClick={() => void save(task.key, result, task.dueOn, task.period)}
                    >
                      {RESULT_BUTTON[result]}
                    </button>
                  );
                })}
                {latest?.result === "exception" && (
                  <button
                    type="button"
                    disabled={busy === draft}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated disabled:opacity-50 pointer-coarse:min-h-11"
                    onClick={() =>
                      void save(
                        task.key,
                        "done",
                        task.dueOn,
                        task.period,
                        resolvedNote(typed, latest.notes),
                      )
                    }
                  >
                    Mark resolved
                  </button>
                )}
              </div>
              {latest?.result === "exception" && (
                <p className="mt-1 text-xs text-muted">
                  Once it is sorted out, press Mark resolved: Precog saves Done with what fixed it.
                </p>
              )}
              {problem && (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  {problem}
                </p>
              )}
            </li>
          );
        })}
        {shownPeriod && (
          <li
            id={checkItemId(shownPeriod, OTHER_PROBLEM_KEY)}
            tabIndex={-1}
            className="scroll-mt-4 rounded-lg border border-dashed border-border p-3 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
          >
            <h3 className="font-medium">Record another problem this month</h3>
            <p className="mt-1 text-sm">
              A problem none of the checks above covers, for example a donation check that never
              reached the bank. It is not a check, so it does not change how many checks are done,
              and it does not go into the control evidence log.
            </p>
            {found.length > 0 && (
              <ul className="mt-2 space-y-2">
                {found.map(({ problem: entry, resolved }) => {
                  const draft = draftKey(shownPeriod, otherProblemItemKey(entry.recordedAt));
                  const refused = problems[draft];
                  return (
                    <li
                      key={entry.recordedAt}
                      id={checkItemId(shownPeriod, otherProblemItemKey(entry.recordedAt))}
                      tabIndex={-1}
                      className="scroll-mt-4 rounded-md border border-border p-2 text-xs focus:outline-2 focus:outline-offset-2 focus:outline-primary"
                    >
                      <p
                        className="font-medium"
                        data-saved-problem={resolved ? "done" : "exception"}
                      >
                        {otherProblemLine(entry, today)}
                      </p>
                      {resolved ? (
                        <p className="mt-1 text-muted">{savedResultLine(resolved, today)}</p>
                      ) : (
                        <>
                          {whoPicker(draft, "Who resolved it", `Who resolved: ${entry.notes}`)}
                          <button
                            type="button"
                            className="mt-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated pointer-coarse:min-h-11"
                            onClick={() => resolveProblem(shownPeriod, entry)}
                          >
                            Mark resolved
                          </button>
                          {refused && (
                            <p role="alert" className="mt-1 font-medium text-danger">
                              {refused}
                            </p>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {whoPicker(problemDraft, "Who found it", "Who found another problem")}
            <label className="mt-2 block text-xs text-muted">
              What the problem is
              <input
                className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-fg"
                value={notes[problemDraft] ?? ""}
                maxLength={500}
                onChange={(e) => {
                  const value = e.target.value;
                  setNotes((n) => ({ ...n, [problemDraft]: value }));
                  setProblems((current) => ({ ...current, [problemDraft]: "" }));
                }}
                aria-label="Note for another problem"
              />
            </label>
            <button
              type="button"
              className="mt-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated pointer-coarse:min-h-11"
              onClick={() => recordProblem(shownPeriod)}
            >
              Record the problem
            </button>
            {problems[problemDraft] && (
              <p role="alert" className="mt-1 text-xs font-medium text-danger">
                {problems[problemDraft]}
              </p>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}
