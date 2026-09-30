import { useState, type FormEvent, type ReactNode } from "react";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { readDraft, writeDraft } from "@/lib/precog/controls/executions/draft";
import {
  METHODS,
  parseCommand,
  type ControlExecution,
  type ExecutionCommand,
} from "@/lib/precog/controls/executions/model";
import { REVIEW_ITEMS } from "@/lib/precog/firm/reviews";
import { uid } from "@/lib/precog/text";

export const fieldClass =
  "mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg";
export const buttonClass =
  "rounded-md border border-border px-3 py-2 text-sm hover:bg-elevated disabled:opacity-50";
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      {children}
    </label>
  );
}
interface Props {
  storageKey: string;
  today: string;
  period: string;
  accountName: string;
  run?: ControlExecution;
  onSave: (command: ExecutionCommand) => Promise<boolean>;
}

/** The same recoverable form records work, review, correction or reopening. */
export function ExecutionForm({ storageKey, today, period, accountName, run, onSave }: Props) {
  const { session } = useWorkspace();
  const fresh = () => ({
    commandId: uid("cmd"),
    runId: run?.id ?? uid("check"),
    controlKey: "bank_statement",
    performedOn: today,
    performedBy: accountName.trim().slice(0, 120),
    method: "",
    scope: "",
    references: "",
    note: "",
    result: "",
    followUpOwner: "",
    dueOn: today,
  });
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...fresh(),
    ...readDraft(session, storageKey),
  }));
  const [draftState, setDraftState] = useState(
    "Not submitted. Draft edits are kept in this tab when browser storage is available.",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = !run
    ? "record"
    : run.status === "needs_correction"
      ? "correct"
      : run.status === "reviewed"
        ? "reopen"
        : "review";
  function change(key: string, value: string) {
    const next = { ...draft, [key]: value, commandId: uid("cmd") };
    setDraft(next);
    setDraftState(
      writeDraft(session, storageKey, next)
        ? "Draft saved in this tab. Not yet in the account log."
        : "Draft is in memory only. Browser storage refused it; keep this page open.",
    );
  }
  const input = (key: string, label: string, type = "text", maxLength = 120) => (
    <Field label={label}>
      <input
        type={type}
        required
        maxLength={maxLength}
        className={fieldClass}
        value={draft[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
      />
    </Field>
  );
  const textarea = (key: string, label: string, maxLength: number) => (
    <Field label={label}>
      <textarea
        required
        rows={3}
        maxLength={maxLength}
        className={fieldClass}
        value={draft[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
      />
    </Field>
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const shared = {
        action,
        commandId: draft.commandId,
        runId: run?.id ?? draft.runId,
        baseRevision: run?.revision ?? 0,
        note: draft.note,
      };
      const evidenceRefs = draft.references
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const follow =
        action === "reopen" || draft.result === "exception"
          ? { followUpOwner: draft.followUpOwner, dueOn: draft.dueOn }
          : {};
      const command = parseCommand(
        action === "record"
          ? {
              ...shared,
              controlKey: draft.controlKey,
              period,
              performedOn: draft.performedOn,
              performedBy: draft.performedBy,
              method: draft.method,
              scope: draft.scope,
              evidenceRefs,
              result: draft.result,
              ...follow,
            }
          : action === "review"
            ? {
                ...shared,
                method: draft.method,
                evidenceRefs,
                result: draft.result,
                independenceConfirmed: confirmed,
                ...follow,
              }
            : action === "correct"
              ? {
                  ...shared,
                  performedOn: draft.performedOn,
                  performedBy: draft.performedBy,
                  scope: draft.scope,
                  evidenceRefs,
                }
              : { ...shared, ...follow },
      );
      if (await onSave(command)) {
        writeDraft(session, storageKey, null);
        setDraft(fresh());
        setConfirmed(false);
        setDraftState("Recorded in the account log. Draft cleared.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The check was not recorded. Your draft is retained.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3">
      <fieldset disabled={busy} className="space-y-3">
        <legend className="sr-only">
          {action === "record" ? "Record a control check" : `${action} this check`}
        </legend>
        {action === "record" && (
          <Field label="Control check">
            <select
              className={fieldClass}
              value={draft.controlKey}
              onChange={(e) => change("controlKey", e.target.value)}
            >
              {REVIEW_ITEMS.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        {(action === "record" || action === "correct") && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {input("performedBy", "Who performed the work")}
              {input("performedOn", "Date performed", "date")}
            </div>
            {textarea("scope", "Population, period and items checked (or correction scope)", 1500)}
          </>
        )}
        {(action === "record" || action === "review") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method">
              <select
                className={fieldClass}
                required
                value={draft.method}
                onChange={(e) => change("method", e.target.value)}
              >
                <option value="" disabled>
                  Choose how the work was checked
                </option>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m === "reperformance"
                      ? "Reperformance / retest"
                      : m[0].toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Result">
              <select
                className={fieldClass}
                required
                value={draft.result}
                onChange={(e) => change("result", e.target.value)}
              >
                <option value="" disabled>
                  Choose the reported result
                </option>
                <option value="no_exception">No exception reported</option>
                <option value="exception">Exception found</option>
              </select>
            </Field>
          </div>
        )}
        {action !== "reopen" && (
          <>
            {textarea("references", "Evidence references (one per line, up to 8)", 3300)}
            <p className="text-xs text-muted">
              Use restricted document locations and version references. No files are uploaded or
              checked here. Never paste passwords, signed access links or account/patient numbers.
            </p>
          </>
        )}
        {textarea(
          "note",
          action === "correct"
            ? "What was corrected and how"
            : action === "reopen"
              ? "Why this conclusion needs to be reopened"
              : "Work performed and conclusion",
          2000,
        )}
        {(action === "reopen" ||
          ((action === "record" || action === "review") && draft.result === "exception")) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {input("followUpOwner", "Follow-up owner")}
            {input("dueOn", "Follow-up due date", "date")}
          </div>
        )}
        {action === "review" && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
              required
            />
            <span>
              I did not perform this work, have appropriate access and competence, and can review it
              independently. This is my attestation, not an automated verification.
            </span>
          </label>
        )}
        {action === "review" && run?.status === "awaiting_retest" && (
          <p className="text-sm">
            Reperform the check on the correction before recording a no-exception result.
          </p>
        )}
        <button type="submit" className={buttonClass}>
          {busy
            ? "Recording…"
            : action === "record"
              ? "Record check"
              : action === "correct"
                ? "Record correction for retest"
                : action === "reopen"
                  ? "Reopen exception"
                  : "Record review conclusion"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <p role="status" className="text-xs text-muted">
        {draftState}
      </p>
    </form>
  );
}
