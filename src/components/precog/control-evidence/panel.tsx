import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { usePractice } from "@/lib/precog/practice-context";
import { useToday } from "@/lib/use-today";
import { localDateKey, formatDay, formatMonth } from "@/lib/precog/dates";
import { REVIEW_ITEMS } from "@/lib/precog/firm/reviews";
import {
  getControlExecutionLog,
  recordControlExecution,
} from "@/lib/precog/controls/executions/server";
import {
  ACTION_LABELS,
  emptyLogMessage,
  METHOD_LABELS,
  reviewParticipationConflict,
  STATUS_LABELS,
  type ControlExecution,
  type ExecutionCommand,
} from "@/lib/precog/controls/executions/model";
import { clientErrorStatus } from "@/lib/request-errors";
import { withExecutionHttpStatus } from "@/lib/precog/controls/executions/client";
import { ExecutionForm, Field, buttonClass, fieldClass } from "./forms";

export function ControlEvidencePanel() {
  const user = useCurrentUser();
  const { profile, ready, switchingBusiness } = usePractice();
  const today = localDateKey(useToday());
  return (
    <section
      aria-label="Control evidence log"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-lg font-semibold">Control evidence log</h2>
      <p className="mt-1 text-sm text-muted">
        Record the work, evidence references and review for a stated period. A recorded result is
        not an audit opinion, a guarantee or a risk-score reduction. Results recorded in{" "}
        <Link to="/firm" className="underline underline-offset-2">
          This month’s review
        </Link>{" "}
        create matching preparer entries here when you are signed in.
      </p>
      <p className="mt-2 text-xs text-muted">
        To get a check reviewed, create a firm and invite a reviewer under People at the firm. One
        account can record work, but cannot independently approve its own entries. A reviewer must
        examine the referenced records, not just this log.
      </p>
      {!user || user.isDevFallback || !ready || !profile.businessId || switchingBusiness ? (
        <p className="mt-3 text-sm">
          Sign in and open a saved business to use the control evidence log. Results you mark in
          This month’s review stay a separate record.
        </p>
      ) : (
        <ExecutionWorkspace
          key={`${user.id}:${profile.businessId}`}
          accountId={user.id}
          accountName={user.displayName || user.primaryEmail || "Account user"}
          businessId={profile.businessId}
          today={today}
        />
      )}
    </section>
  );
}
function ExecutionWorkspace({
  accountId,
  accountName,
  businessId,
  today,
}: {
  accountId: string;
  accountName: string;
  businessId: string;
  today: string;
}) {
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [positions, setPositions] = useState<(string | null)[]>([null]);
  const cursor = positions.at(-1) ?? null;
  const [data, setData] = useState<{
    entries: ControlExecution[];
    more: boolean;
    nextCursor: string | null;
    canReview: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError("");
    void withExecutionHttpStatus((fetch) =>
      getControlExecutionLog({
        data: { businessId, expectedAccountId: accountId, period, cursor },
        fetch,
      }),
    )
      .then((result) => {
        if (!ignore) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setData(null);
          setLoading(false);
          setError(
            clientErrorStatus(err)
              ? err.message
              : "Precog could not load the control evidence log. Check your connection and try again.",
          );
        }
      });
    return () => {
      ignore = true;
    };
  }, [accountId, businessId, period, cursor, refresh]);
  const save = useCallback(
    async (command: ExecutionCommand) => {
      try {
        await withExecutionHttpStatus((fetch) =>
          recordControlExecution({
            data: { businessId, expectedAccountId: accountId, command },
            fetch,
          }),
        );
        if (!active.current) return false;
        setNotice("Precog recorded this in the control evidence log.");
        setRefresh((n) => n + 1);
        return true;
      } catch (err) {
        if (!active.current) return false;
        throw new Error(
          clientErrorStatus(err)
            ? (err as Error).message
            : "Precog could not confirm that your account recorded this. Your draft is still here. Try the same action again, or reload the log before you edit it.",
        );
      }
    },
    [accountId, businessId],
  );
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Evidence period">
          <input
            type="month"
            className={fieldClass}
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setData(null);
              setNotice("");
              setPositions([null]);
            }}
          />
        </Field>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setPositions([null]);
            setData(null);
            setRefresh((n) => n + 1);
          }}
        >
          Reload log
        </button>
      </div>
      <p role="status" className="text-sm">
        {loading ? "Loading the control evidence log…" : notice}
      </p>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {data && !error && (
        <>
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer font-medium">Record a check with evidence</summary>
            <ExecutionForm
              key={period}
              storageKey={`${businessId}:new:${period}`}
              today={today}
              period={period}
              accountName={accountName}
              onSave={save}
            />
          </details>
          {!data.entries.length && !loading && (
            <p className="text-sm text-muted">{emptyLogMessage(period)}</p>
          )}
          {!loading &&
            data.entries.map((run) => {
              const ownWork = reviewParticipationConflict(run, {
                id: accountId,
                name: accountName,
              });
              const needsReview =
                run.status === "awaiting_review" || run.status === "awaiting_retest";
              const title =
                REVIEW_ITEMS.find((i) => i.key === run.controlKey)?.title ?? run.controlKey;
              return (
                <article
                  key={run.id}
                  className="rounded-lg border border-border p-3"
                  aria-label={`${title} for ${formatMonth(run.period)}`}
                >
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm font-medium">{STATUS_LABELS[run.status]}</p>
                  <p className="mt-1 text-xs text-muted">
                    {run.period} · saved business revision {run.sourceBusinessRevision} · log
                    revision {run.revision}. Review conclusions concern only the recorded scope and
                    evidence; references do not establish document authenticity.
                  </p>
                  <ExecutionHistory run={run} />
                  {needsReview && (!data.canReview || ownWork) ? (
                    <p className="mt-3 text-sm">
                      A different authorized reviewer must record the conclusion. Anyone who
                      recorded or reportedly performed work or a correction cannot independently
                      review this check.
                    </p>
                  ) : (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        {run.status === "needs_correction"
                          ? "Record a correction"
                          : run.status === "reviewed"
                            ? "Reopen this conclusion"
                            : "Review this check"}
                      </summary>
                      <ExecutionForm
                        key={run.revision}
                        storageKey={`${businessId}:${run.id}:${run.revision}`}
                        today={today}
                        period={period}
                        accountName={accountName}
                        run={run}
                        onSave={save}
                      />
                    </details>
                  )}
                </article>
              );
            })}
          <p className="text-xs text-muted">
            Live log. Reload from the first page to see newly added checks. Each result concerns its
            recorded scope, not the entire business or every control.
          </p>
          <div className="flex items-center gap-3">
            <button
              className={buttonClass}
              disabled={positions.length === 1 || loading}
              onClick={() => {
                setData(null);
                setPositions((p) => p.slice(0, -1));
              }}
            >
              Previous page
            </button>
            <span className="text-xs">Page {positions.length}; up to 20 checks per page.</span>
            <button
              className={buttonClass}
              disabled={!data.more || loading}
              onClick={() => {
                setData(null);
                setPositions((p) => [...p, data.nextCursor]);
              }}
            >
              Next page
            </button>
          </div>
        </>
      )}
    </div>
  );
}
export function ExecutionHistory({ run }: { run: ControlExecution }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm">
        Evidence and history ({run.history.length})
      </summary>
      <ol className="mt-2 space-y-3">
        {run.history.map((event) => {
          const command = event.command;
          return (
            <li key={command.commandId} className="border-l-2 border-border pl-3 text-sm">
              <p className="font-medium">
                {ACTION_LABELS[command.action]} · recorded by {event.actor.name} ·{" "}
                {formatDay(event.recordedAt)}
              </p>
              {"performedBy" in command && (
                <p>
                  Reported performed by {command.performedBy} on {formatDay(command.performedOn)}
                </p>
              )}
              {"scope" in command && <p className="whitespace-pre-wrap">Scope: {command.scope}</p>}
              {"method" in command && (
                <p>
                  Method: {METHOD_LABELS[command.method]}; result:{" "}
                  {command.result === "exception" ? "exception found" : "no exception reported"}
                </p>
              )}
              <p className="whitespace-pre-wrap">{command.note}</p>
              {"evidenceRefs" in command && (
                <ul className="mt-1 list-disc pl-4">
                  {command.evidenceRefs.map((ref) => (
                    <li key={ref} className="break-words">
                      {ref}
                    </li>
                  ))}
                </ul>
              )}
              {"followUpOwner" in command && command.followUpOwner && (
                <p>
                  Follow-up: {command.followUpOwner} · due {formatDay(command.dueOn ?? "")}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
