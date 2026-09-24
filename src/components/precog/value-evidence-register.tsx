import { useState } from "react";
import { Check, Download, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  summarizeValueEvidence,
  formatEvidenceAmount,
  assessEvidenceQuality,
  parseValueEvidence,
  serializeValueEvidence,
  type ValueEvidence,
  type ValueEvidenceKind,
} from "@/lib/precog/value-evidence";

export function ValueEvidenceRegister({
  items,
  onChange,
}: {
  items: ValueEvidence[];
  onChange: (items: ValueEvidence[]) => void;
}) {
  const [draft, setDraft] = useState({
    kind: "time" as ValueEvidenceKind,
    description: "",
    source: "",
    amount: 0,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState("");
  const [transferMessage, setTransferMessage] = useState("");
  const summary = summarizeValueEvidence(items);
  const quality = assessEvidenceQuality(items);
  const add = () => {
    if (!draft.description.trim()) return;
    onChange([
      ...items,
      {
        ...draft,
        id: crypto.randomUUID(),
        observedAt: new Date().toISOString().slice(0, 10),
        verified: false,
      },
    ]);
    setDraft((current) => ({ ...current, description: "", source: "", amount: 0 }));
  };
  const beginSourceEdit = (item: ValueEvidence) => {
    setEditingId(item.id);
    setEditSource(item.source);
  };
  const saveSource = () => {
    onChange(
      items.map((item) =>
        item.id === editingId
          ? {
              ...item,
              source: editSource.trim(),
              verified: item.verified && Boolean(editSource.trim()),
            }
          : item,
      ),
    );
    setEditingId(null);
    setEditSource("");
  };
  const exportEvidence = () => {
    const blob = new Blob([serializeValueEvidence(items)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `precog-value-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importEvidence = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseValueEvidence(await file.text());
      onChange(imported);
      setTransferMessage(`Imported ${imported.length} evidence records`);
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
              Attach the observation and its source before presenting a value claim.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={quality.score === 100 && items.length ? "primary" : "default"}>
              {quality.score}% evidence ready
            </Badge>
            <Badge variant="default">
              {summary.verified}/{summary.total} verified
            </Badge>
            <button
              type="button"
              onClick={exportEvidence}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg"
            >
              <Download className="size-3.5" />
              Export
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg">
              <Upload className="size-3.5" />
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
        <div className="grid gap-2 md:grid-cols-[140px_1fr_1fr_120px_auto]">
          <select
            aria-label="Evidence type"
            value={draft.kind}
            onChange={(event) =>
              setDraft({ ...draft, kind: event.target.value as ValueEvidenceKind })
            }
            className="h-10 rounded-lg border border-border bg-elevated px-2 text-sm"
          >
            <option value="time">Annual time saved</option>
            <option value="recovery">Recovery</option>
            <option value="control">Control change</option>
            <option value="exception">Exception</option>
          </select>
          <input
            aria-label="Evidence observation"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="What was observed?"
            className="h-10 rounded-lg border border-border bg-elevated px-3 text-sm focus:border-primary/60"
          />
          <input
            aria-label="Evidence source"
            value={draft.source}
            onChange={(event) => setDraft({ ...draft, source: event.target.value })}
            placeholder="Source, ticket, or report"
            className="h-10 rounded-lg border border-border bg-elevated px-3 text-sm focus:border-primary/60"
          />
          <input
            aria-label={
              draft.kind === "recovery"
                ? "Evidence amount in dollars"
                : draft.kind === "time"
                  ? "Evidence amount in hours"
                  : "Evidence item count"
            }
            type="number"
            min="0"
            value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })}
            className="h-10 rounded-lg border border-border bg-elevated px-3 text-sm focus:border-primary/60"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.description.trim()}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            <Plus className="size-4" />
            Add
          </button>
        </div>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">
            No evidence recorded yet. Start with a timed baseline review or documented recovery.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
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
                  {editingId === item.id ? (
                    <div className="mt-1 flex max-w-xl gap-1">
                      <input
                        autoFocus
                        aria-label={`Source for ${item.description}`}
                        value={editSource}
                        onChange={(event) => setEditSource(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveSource();
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        placeholder="Report, ticket, invoice, or file reference"
                        className="h-8 min-w-0 flex-1 rounded-md border border-primary/50 bg-bg px-2 text-xs"
                      />
                      <button
                        type="button"
                        aria-label="Save source"
                        onClick={saveSource}
                        className="rounded-md p-1.5 text-ok hover:bg-ok/10"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel source edit"
                        onClick={() => setEditingId(null)}
                        className="rounded-md p-1.5 text-muted hover:bg-surface"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      {item.kind} · {item.observedAt}
                      {item.source ? ` · ${item.source}` : " · source needed"}
                    </p>
                  )}
                </div>
                {item.amount > 0 && (
                  <span className="text-sm font-semibold tabular">
                    {formatEvidenceAmount(item)}
                  </span>
                )}
                {editingId !== item.id && (
                  <button
                    type="button"
                    aria-label={`${item.source ? "Edit" : "Add"} source for ${item.description}`}
                    onClick={() => beginSourceEdit(item)}
                    className="rounded-md p-2 text-muted hover:bg-primary/10 hover:text-primary"
                  >
                    <Pencil className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Delete ${item.description}`}
                  onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))}
                  className="rounded-md p-2 text-muted hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {items.length > 0 && (quality.unsourced > 0 || quality.stale > 0 || quality.future > 0) && (
          <p className="text-xs text-warn">
            Evidence readiness excludes {quality.unsourced} unsourced, {quality.stale} stale or
            undated, and {quality.future} future-dated {quality.future === 1 ? "record" : "records"}
            . Refresh records older than 12 months and correct future dates.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
