import { useEffect, useRef, useState, useId, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inputCls } from "@/components/ui/field-classes";
import { usePractice } from "@/lib/precog/practice-context";
import type { PracticeProfile } from "@/lib/precog/practice-profile";
import { localDateKey } from "@/lib/precog/dates";
import {
  importBankCsv,
  importBooksCsv,
  MAX_BYTES,
  type BankRow,
  type BooksRow,
  type MoneyImport,
} from "@/lib/precog/money-checks/import";
import type { SkippedCheck } from "@/lib/precog/money-checks/detect";
import {
  withMoneyRun,
  withFindingExplanation,
  withReconciliationSignoff,
  withChannelSignoff,
} from "@/lib/precog/money-checks/profile-state";
import {
  CHECK_LABELS,
  addClose,
  closedMonths,
  noteProblem,
  runScreenChecks,
  skippedReason,
} from "./money-checks.logic";

export default function MoneyChecksPanel() {
  const { profile } = usePractice();
  return <MoneyChecks key={profile.businessId} />;
}
function MoneyChecks() {
  const { profile, template, setMoneyChecks } = usePractice();
  const [bank, setBank] = useState<MoneyImport<BankRow> | null>(null);
  const [books, setBooks] = useState<MoneyImport<BooksRow> | null>(null);
  const [closes, setCloses] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<SkippedCheck[] | null>(null);
  const [runError, setRunError] = useState("");
  const today = localDateKey(new Date());
  const people = template.people.filter((p) => p.active);
  const state = profile.moneyChecks;
  const ledger = state?.ledger ?? [];
  const closed = ledger.filter((r) => r.status === "closed");
  const month = today.slice(0, 7);
  const edit = (update: (p: PracticeProfile) => PracticeProfile) =>
    setMoneyChecks((current) => update({ ...profile, moneyChecks: current }).moneyChecks);
  const personOptions = (
    <>
      <option value="">Choose a person</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
  const person = (data: FormData, key: string) => {
    const id = String(data.get(key) ?? "");
    if (!people.some((p) => p.id === id))
      throw new Error("Choose an active team person for each person field.");
    return id;
  };
  function run() {
    const runToday = localDateKey(new Date());
    setRunError("");
    try {
      const result = runScreenChecks({
        bank,
        books,
        today: runToday,
        closes: closes.length ? closes : undefined,
        template,
        policy: profile.dualRelease,
        decisions: profile.decisions,
        signoffs: state?.reconciliationSignoffs ?? [],
      });
      edit((p) => withMoneyRun(p, result, runToday));
      setSkipped(result.skipped);
    } catch {
      setRunError("The checks could not run. Check the dates and files, then try again.");
    }
  }
  return (
    <div className="space-y-6" aria-label="Money checks workspace">
      <p className="text-sm text-muted">
        These checks are advisory. They describe lines, entries and months, not people.
      </p>
      <p className="text-xs text-subtle">
        Files stay in this browser while this section is open. Only findings and sign-offs are
        saved. Upload the files again after a reload.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <FileField label="Bank file" parse={importBankCsv} result={bank} onResult={setBank} />
        <FileField label="Books file" parse={importBooksCsv} result={books} onResult={setBooks} />
      </div>
      <MoneyForm
        label="Add closed-through date"
        onSave={(data) => setCloses(addClose(closes, String(data.get("date") ?? "")))}
      >
        <label className="block text-sm">
          Closed through (optional)
          <input name="date" type="date" className={inputCls} />
        </label>
      </MoneyForm>
      {!!closes.length && (
        <ul className="flex flex-wrap gap-2">
          {closes.map((date) => (
            <li key={date}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCloses(closes.filter((d) => d !== date))}
              >
                Remove {date}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run}>Run checks</Button>
        <span className="text-xs text-muted">
          {state?.lastRun ? `Last run: ${state.lastRun}` : "No run yet"}
        </span>
      </div>
      {runError && <p role="alert">{runError}</p>}
      <section aria-label="Open findings" className="space-y-4">
        <h3 className="font-semibold">Open findings</h3>
        {!ledger.some((r) => r.status === "open") && (
          <p className="text-sm text-muted">No open findings recorded.</p>
        )}
        {(["review", "watch", "info"] as const).map((level) => {
          const rows = ledger.filter((r) => r.status === "open" && r.level === level);
          return rows.length ? (
            <section key={level} aria-label={`${level} findings`} className="space-y-3">
              <h4 className="font-medium capitalize">{level}</h4>
              {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-border p-4 space-y-2">
                  <Badge
                    variant={level === "review" ? "danger" : level === "watch" ? "warn" : "default"}
                  >
                    {level === "review" ? "Review" : level === "watch" ? "Watch" : "Info"}
                  </Badge>
                  <p className="text-sm">{row.sentence}</p>
                  {row.explained && (
                    <p className="text-sm text-muted">
                      Explanation ({row.explained.on}): {row.explained.note}
                    </p>
                  )}
                  <details>
                    <summary className="cursor-pointer text-sm">Explain</summary>
                    <MoneyForm
                      label="Save explanation"
                      onSave={(data) => {
                        const note = String(data.get("note") ?? "");
                        if (noteProblem(note)) throw new Error(noteProblem(note));
                        edit((p) => withFindingExplanation(p, row.id, note, today));
                      }}
                    >
                      <label className="block text-sm">
                        Explanation note
                        <textarea
                          name="note"
                          className={inputCls}
                          defaultValue={row.explained?.note}
                        />
                      </label>
                    </MoneyForm>
                  </details>
                </article>
              ))}
            </section>
          ) : null;
        })}
      </section>
      <details>
        <summary className="cursor-pointer text-sm">Closed findings ({closed.length})</summary>
        <ul className="space-y-3 pt-3">
          {closed.map((row) => (
            <li key={row.id} className="text-sm">
              <p>{row.sentence}</p>
              <p className="text-muted">
                Closed {row.closedOn}: {row.closeReason}. Reopened {row.reopenCount} times.
              </p>
              {row.explained && <p>Explanation: {row.explained.note}</p>}
            </li>
          ))}
        </ul>
      </details>
      <section aria-label="Checks that could not run">
        <h3 className="font-semibold">Checks that could not run</h3>
        {skipped === null ? (
          <p className="text-sm text-muted">Run checks to see the current file coverage.</p>
        ) : !skipped.length ? (
          <p className="text-sm">All checks ran.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm space-y-1">
            {skipped.map((skip, i) => (
              <li key={`${skip.check}:${i}`}>
                <strong>{CHECK_LABELS[skip.check]}:</strong> {skippedReason(skip)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Reconciliation sign-off</h3>
        {!people.length && (
          <p className="text-sm">Add active team people before recording a sign-off.</p>
        )}
        {closedMonths(today).map((closedMonth) => {
          const saved = state?.reconciliationSignoffs.find((s) => s.month === closedMonth);
          return (
            <Card key={closedMonth}>
              <CardHeader>
                <CardTitle as="h4">{closedMonth}</CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyForm
                  label={`Save reconciliation ${closedMonth}`}
                  onSave={(data) => {
                    const signoff = {
                      month: closedMonth,
                      preparedBy: person(data, "preparedBy"),
                      signedBy: person(data, "signedBy"),
                      signedOn: String(data.get("signedOn") ?? ""),
                    };
                    withReconciliationSignoff(profile, signoff);
                    edit((p) => withReconciliationSignoff(p, signoff));
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm">
                      Preparer
                      <select
                        name="preparedBy"
                        defaultValue={saved?.preparedBy ?? ""}
                        className={inputCls}
                      >
                        {personOptions}
                      </select>
                    </label>
                    <label className="text-sm">
                      Signer
                      <select
                        name="signedBy"
                        defaultValue={saved?.signedBy ?? ""}
                        className={inputCls}
                      >
                        {personOptions}
                      </select>
                    </label>
                    <label className="text-sm">
                      Signed on
                      <input
                        name="signedOn"
                        type="date"
                        defaultValue={saved?.signedOn ?? today}
                        className={inputCls}
                      />
                    </label>
                  </div>
                  {saved && (
                    <p className="text-xs text-muted">
                      Recorded for {closedMonth}. Run checks again to refresh findings.
                    </p>
                  )}
                </MoneyForm>
              </CardContent>
            </Card>
          );
        })}
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Channel sign-off · {month}</h3>
        {!profile.dualRelease.enabled && (
          <p className="text-sm text-muted">The dual-release policy is off.</p>
        )}
        {profile.dualRelease.enabled &&
          profile.dualRelease.rules
            .filter((r) => r.enabled)
            .map((rule) => {
              const saved = state?.channelSignoffs.find(
                (s) => s.month === month && s.channel === rule.channel,
              );
              return (
                <Card key={rule.channel}>
                  <CardHeader>
                    <CardTitle as="h4">{rule.label}</CardTitle>
                    <p className="text-sm text-muted">
                      {saved ? `Signed off on ${saved.on}` : "No sign-off yet"}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <MoneyForm
                      label={`Save ${rule.label} sign-off`}
                      onSave={(data) => {
                        const note = String(data.get("note") ?? "");
                        if (noteProblem(note)) throw new Error(noteProblem(note));
                        const by = person(data, "by");
                        edit((p) =>
                          withChannelSignoff(p, {
                            month,
                            channel: rule.channel,
                            note,
                            by,
                            on: today,
                          }),
                        );
                      }}
                    >
                      <label className="block text-sm">
                        Reviewed by
                        <select name="by" defaultValue={saved?.by ?? ""} className={inputCls}>
                          {personOptions}
                        </select>
                      </label>
                      <label className="block text-sm">
                        Review note (at least 10 characters)
                        <textarea name="note" defaultValue={saved?.note} className={inputCls} />
                      </label>
                    </MoneyForm>
                  </CardContent>
                </Card>
              );
            })}
      </section>
    </div>
  );
}

function MoneyForm({
  label,
  onSave,
  children,
}: {
  label: string;
  onSave: (data: FormData) => void;
  children: ReactNode;
}) {
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const errorId = useId();
  return (
    <form
      noValidate
      aria-label={label}
      aria-describedby={error ? errorId : undefined}
      className="space-y-3 pt-3"
      onChange={() => setSaved(false)}
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        setSaved(false);
        try {
          onSave(new FormData(event.currentTarget));
          setSaved(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "The entry could not be saved.");
        }
      }}
    >
      {children}
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted">
          Saved.
        </p>
      )}
    </form>
  );
}
function FileField<T>({
  label,
  parse,
  result,
  onResult,
}: {
  label: string;
  parse: (text: string) => MoneyImport<T>;
  result: MoneyImport<T> | null;
  onResult: (value: MoneyImport<T> | null) => void;
}) {
  const reader = useRef<FileReader | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => reader.current?.abort(), []);
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">
        {label}
        <input
          type="file"
          accept=".csv,text/csv"
          className={`${inputCls} mt-2`}
          onChange={(event) => {
            reader.current?.abort();
            onResult(null);
            setError("");
            setLoading(false);
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > MAX_BYTES) {
              setError("Choose a CSV file no larger than 5 MB.");
              return;
            }
            const next = new FileReader();
            reader.current = next;
            setLoading(true);
            next.onerror = () => {
              setLoading(false);
              setError("Could not read this file. Choose a readable CSV file and try again.");
            };
            next.onload = () => {
              setLoading(false);
              try {
                onResult(parse(String(next.result)));
              } catch {
                setError("Could not import this file. Choose a readable CSV file and try again.");
              }
            };
            next.readAsText(file);
          }}
        />
      </label>
      {loading && <p role="status">Reading file…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="text-sm">{result.rows.length} rows imported</p>
          <ul className="text-xs text-muted">
            {result.issues.map((issue, i) => (
              <li key={i}>
                Row {issue.row}: {issue.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
