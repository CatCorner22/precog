import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Download, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  VALUE_EVIDENCE_KIND_LABEL,
  summarizeValueEvidence,
  formatEvidenceAmount,
  parseValueEvidence,
  serializeValueEvidence,
  type ValueEvidence,
  type ValueEvidenceKind,
} from "@/lib/precog/value-evidence";
import { mergeImportedEvidence } from "@/lib/precog/value-evidence-import";
import { downloadText } from "@/lib/download";
import { formatDay, isCalendarDate, localDateKey } from "@/lib/precog/dates";
import { count, uid } from "@/lib/precog/text";

/** One evidence item as typed: the amount stays text until it is saved. */
interface EvidenceDraft {
  kind: ValueEvidenceKind;
  description: string;
  source: string;
  amount: string;
  observedAt: string;
}

const KINDS = Object.keys(VALUE_EVIDENCE_KIND_LABEL) as ValueEvidenceKind[];

export function ValueEvidenceRegister({
  items,
  onChange,
}: {
  items: ValueEvidence[];
  onChange: (items: ValueEvidence[]) => void;
}) {
  const today = localDateKey(new Date());
  const [draft, setDraft] = useState<EvidenceDraft>(() => emptyDraft(today));
  const [editing, setEditing] = useState<{ id: string; draft: EvidenceDraft } | null>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const summary = summarizeValueEvidence(items);
  const add = () => {
    if (!draft.description.trim()) return;
    onChange([...items, { id: uid("ev"), ...fromDraft(draft, today), verified: false }]);
    setDraft((current) => ({
      ...emptyDraft(today),
      kind: current.kind,
      observedAt: current.observedAt,
    }));
  };
  const saveEdit = () => {
    if (!editing || !editing.draft.description.trim()) return;
    onChange(
      items.map((item) => {
        if (item.id !== editing.id) return item;
        const next = fromDraft(editing.draft, today);
        // A change to what was verified asks for verification again; a new
        // source on an unchanged record keeps it, as long as there is one.
        const sameRecord =
          next.kind === item.kind &&
          next.description === item.description &&
          next.amount === item.amount &&
          next.observedAt === item.observedAt;
        return { ...item, ...next, verified: item.verified && sameRecord && Boolean(next.source) };
      }),
    );
    setEditing(null);
  };
  const exportEvidence = () => {
    downloadText(
      `precog-value-evidence-${today}.json`,
      serializeValueEvidence(items),
      "application/json",
    );
  };
  const importEvidence = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = mergeImportedEvidence(items, parseValueEvidence(await file.text()));
      onChange(result.items);
      const unchanged = items.length - result.updated;
      setTransferMessage(
        [
          `Imported ${count(result.added + result.updated, "record")}: ${count(result.added, "new item")} added`,
          result.updated > 0 ? `, ${count(result.updated, "item")} with the same id replaced` : "",
          ".",
          unchanged > 0 ? ` The ${count(unchanged, "other item")} stay as they were.` : "",
        ].join(""),
      );
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : "Import failed");
    }
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Value evidence register</CardTitle>
            <CardDescription>
              Attach the observation, the day it happened and its source before presenting a value
              claim. Importing a file adds its records to this register.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={summary.score === 100 && items.length ? "primary" : "default"}>
              {summary.score}% evidence ready
            </Badge>
            <Badge variant="default">
              {summary.verified}/{summary.total} verified
            </Badge>
            <button
              type="button"
              onClick={exportEvidence}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg"
            >
              <Download className="size-3.5" aria-hidden />
              Export
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg">
              <Upload className="size-3.5" aria-hidden />
              Import
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  void importEvidence(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {transferMessage && (
          <p role="status" className="text-xs text-muted">
            {transferMessage}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <DraftFields
          draft={draft}
          today={today}
          onChange={setDraft}
          onSubmit={add}
          labelPrefix="New evidence"
        >
          <button
            type="button"
            onClick={add}
            disabled={!draft.description.trim()}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </DraftFields>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">
            No evidence recorded yet. Start with a timed baseline review or documented money
            recovered.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) =>
              editing?.id === item.id ? (
                <div key={item.id} className="rounded-xl border border-primary/50 bg-elevated p-3">
                  <DraftFields
                    draft={editing.draft}
                    today={today}
                    onChange={(next) => setEditing({ id: item.id, draft: next })}
                    onSubmit={saveEdit}
                    onCancel={() => setEditing(null)}
                    labelPrefix={`Edit ${item.description}`}
                  >
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label="Save changes"
                        onClick={saveEdit}
                        disabled={!editing.draft.description.trim()}
                        className="rounded-md p-2 text-ok hover:bg-ok/10 disabled:opacity-40"
                      >
                        <Check className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel changes"
                        onClick={() => setEditing(null)}
                        className="rounded-md p-2 text-muted hover:bg-surface"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  </DraftFields>
                </div>
              ) : (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-elevated p-3"
                >
                  <input
                    aria-label={`Verify ${item.description}`}
                    type="checkbox"
                    checked={item.verified}
                    disabled={!item.source}
                    title={!item.source ? "Add a source before verification" : undefined}
                    onChange={() =>
                      onChange(
                        items.map((candidate) =>
                          candidate.id === item.id
                            ? { ...candidate, verified: !candidate.verified }
                            : candidate,
                        ),
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-muted">
                      {VALUE_EVIDENCE_KIND_LABEL[item.kind]} ·{" "}
                      {item.observedAt ? formatDay(item.observedAt) : "no date"}
                      {item.source ? ` · ${item.source}` : " · source needed"}
                    </p>
                  </div>
                  {item.amount > 0 && (
                    <span className="text-sm font-semibold tabular">
                      {formatEvidenceAmount(item)}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Edit ${item.description}`}
                    onClick={() => setEditing({ id: item.id, draft: toDraft(item, today) })}
                    className="rounded-md p-2 text-muted hover:bg-primary/10 hover:text-primary"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.description}`}
                    onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))}
                    className="rounded-md p-2 text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
        {items.length > 0 && (summary.unsourced > 0 || summary.stale > 0 || summary.future > 0) && (
          <p className="text-xs text-warn">
            Evidence readiness excludes {summary.unsourced} unsourced, {summary.stale} stale or
            undated, and {summary.future} future-dated {summary.future === 1 ? "record" : "records"}
            . Refresh records older than 12 months and correct future dates with the pencil.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The fields of one evidence item: type, observation, source, amount and the
 * day it was observed. Enter saves; Escape cancels when `onCancel` is given.
 */
function DraftFields({
  draft,
  today,
  onChange,
  onSubmit,
  onCancel,
  labelPrefix,
  children,
}: {
  draft: EvidenceDraft;
  today: string;
  onChange: (draft: EvidenceDraft) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  labelPrefix: string;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent) => {
    // A button handles its own Enter as a click.
    if (event.target instanceof HTMLButtonElement) return;
    if (event.key === "Enter") onSubmit();
    if (event.key === "Escape") onCancel?.();
  };
  const field =
    "h-10 min-w-0 rounded-lg border border-border bg-elevated px-3 text-sm focus:border-primary/60";
  return (
    <div className="grid gap-2 md:grid-cols-[170px_1fr_1fr_110px_150px_auto]" onKeyDown={onKeyDown}>
      <select
        aria-label={`${labelPrefix}: type`}
        value={draft.kind}
        onChange={(event) => onChange({ ...draft, kind: event.target.value as ValueEvidenceKind })}
        className="h-10 rounded-lg border border-border bg-elevated px-2 text-sm"
      >
        {KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {VALUE_EVIDENCE_KIND_LABEL[kind]}
          </option>
        ))}
      </select>
      <input
        aria-label={`${labelPrefix}: what was observed`}
        value={draft.description}
        onChange={(event) => onChange({ ...draft, description: event.target.value })}
        placeholder="What was observed?"
        className={field}
      />
      <input
        aria-label={`${labelPrefix}: source`}
        value={draft.source}
        onChange={(event) => onChange({ ...draft, source: event.target.value })}
        placeholder="Source, ticket, or report"
        className={field}
      />
      <input
        aria-label={`${labelPrefix}: ${AMOUNT_LABEL[draft.kind]}`}
        type="number"
        min="0"
        value={draft.amount}
        onChange={(event) => onChange({ ...draft, amount: event.target.value })}
        placeholder={AMOUNT_LABEL[draft.kind]}
        className={field}
      />
      <input
        aria-label={`${labelPrefix}: observed on`}
        type="date"
        max={today}
        value={draft.observedAt}
        onChange={(event) => onChange({ ...draft, observedAt: event.target.value })}
        className={field}
      />
      {children}
    </div>
  );
}

const AMOUNT_LABEL: Record<ValueEvidenceKind, string> = {
  time: "Hours",
  recovery: "Dollars",
  control: "Count",
  exception: "Count",
};

function emptyDraft(today: string): EvidenceDraft {
  return { kind: "time", description: "", source: "", amount: "", observedAt: today };
}

function toDraft(item: ValueEvidence, today: string): EvidenceDraft {
  return {
    kind: item.kind,
    description: item.description,
    source: item.source,
    amount: item.amount > 0 ? String(item.amount) : "",
    observedAt: item.observedAt || today,
  };
}

/** The saved fields of a draft: trimmed text, a non-negative amount, a real calendar day. */
function fromDraft(draft: EvidenceDraft, today: string): Omit<ValueEvidence, "id" | "verified"> {
  const amount = Number(draft.amount);
  return {
    kind: draft.kind,
    description: draft.description.trim(),
    source: draft.source.trim(),
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    observedAt: isCalendarDate(draft.observedAt) ? draft.observedAt : today,
  };
}
