import { toast } from "sonner";
import { CheckCircle2, Plus, Sparkles, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field-classes";
import { useAddForm } from "@/components/precog/builder/use-add-form";
import {
  FREQUENCY_LABEL,
  evidenceStatus,
  suggestEvidence,
  summarizeEvidence,
} from "@/lib/precog/builder/evidence";
import { PROCESS_TEXT_LIMITS } from "@/lib/precog/builder/process-text-sync";
import { count, uid } from "@/lib/precog/text";
import type { EvidenceFrequency, EvidenceItem, Person, ProcessNode } from "@/lib/precog/types";
import { cn } from "@/lib/utils";

/** What proves a process's controls run: each review, how often, who does it, and when it last ran. */
export function EvidenceList({
  process,
  people,
  onChange,
}: {
  process: ProcessNode;
  people: Person[];
  onChange: (evidence: EvidenceItem[]) => void;
}) {
  const items = process.evidence ?? [];
  const form = useAddForm({ title: "", frequency: "monthly" as EvidenceFrequency, reviewer: "" }, [
    "frequency",
    "reviewer",
  ]);
  const { draft, set } = form;
  // Only people still working here can be named as the reviewer.
  const reviewers = people.filter((p) => p.active);

  function markDone(id: string) {
    onChange(items.map((e) => (e.id === id ? { ...e, lastDoneAt: new Date().toISOString() } : e)));
  }

  function addSuggested() {
    const existing = new Set(items.map((e) => e.label.toLowerCase()));
    const fresh = suggestEvidence(process)
      .filter((s) => !existing.has(s.label.toLowerCase()))
      .map((s) => ({ ...s, id: uid("ev") }));
    if (!fresh.length) {
      toast("No new suggestions for this process");
      return;
    }
    onChange([...items, ...fresh]);
    toast.success(`Added ${count(fresh.length, "evidence item")}`);
  }

  const summary = summarizeEvidence([process]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={cn(labelCls, "flex items-center gap-1")}>
          <CheckCircle2 className="size-3 text-ok" />
          Evidence ({items.length})
          {items.length > 0 && (
            <span
              className={cn("ml-1 normal-case", summary.coverage < 100 ? "text-warn" : "text-ok")}
            >
              · {summary.coverage}% current
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={addSuggested}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Sparkles className="size-3" /> Suggest evidence
          </button>
          <button
            type="button"
            onClick={form.toggle}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {form.adding ? <X className="size-3" /> : <Plus className="size-3" />}
            {form.adding ? "Cancel" : "Add"}
          </button>
        </span>
      </div>
      {items.length === 0 && !form.adding && (
        <p className="text-xs text-subtle">
          What proves this control runs? Add the review, its cadence, and who does it.
        </p>
      )}
      {items.map((e) => {
        const { status, daysLeft } = evidenceStatus(e);
        const reviewerName = e.reviewerPersonId
          ? people.find((p) => p.id === e.reviewerPersonId)?.name
          : undefined;
        return (
          <div
            key={e.id}
            className={cn(
              "flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs",
              status === "overdue"
                ? "border-danger/40 bg-danger/10"
                : status === "never"
                  ? "border-warn/40 bg-warn/10"
                  : status === "due_soon"
                    ? "border-warn/30 bg-elevated"
                    : "border-border bg-elevated",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-fg">{e.label}</p>
              <p className="text-subtle">
                {FREQUENCY_LABEL[e.frequency]}
                {reviewerName ? ` · ${reviewerName}` : ""}
                {" · "}
                {status === "never"
                  ? "never recorded"
                  : status === "overdue"
                    ? `overdue by ${Math.abs(daysLeft ?? 0)}d`
                    : status === "due_soon"
                      ? `due in ${daysLeft}d`
                      : `current · next in ${daysLeft}d`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => markDone(e.id)}
              className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-fg hover:border-ok/50 hover:text-ok"
              title="Record that this review was completed today"
            >
              Done today
            </button>
            <button
              type="button"
              onClick={() => onChange(items.filter((x) => x.id !== e.id))}
              className="text-subtle hover:text-danger"
              aria-label={`Remove evidence ${e.label}`}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        );
      })}
      {form.adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <input
            className={inputCls}
            placeholder="e.g. Owner signs off bank reconciliation"
            aria-label="Evidence"
            maxLength={PROCESS_TEXT_LIMITS.evidenceLabel}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-1.5">
            <select
              className={inputCls}
              aria-label="How often"
              value={draft.frequency}
              onChange={(e) => set("frequency", e.target.value as EvidenceFrequency)}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              aria-label="Reviewer"
              value={draft.reviewer}
              onChange={(e) => set("reviewer", e.target.value)}
            >
              <option value="">Reviewer (optional)</option>
              {reviewers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            disabled={!form.ready}
            onClick={() =>
              form.submit((d) =>
                onChange([
                  ...items,
                  {
                    id: uid("ev"),
                    label: d.title.trim(),
                    frequency: d.frequency,
                    reviewerPersonId: d.reviewer || undefined,
                  },
                ]),
              )
            }
          >
            Add evidence
          </Button>
        </div>
      )}
    </div>
  );
}

const FREQUENCIES = Object.keys(FREQUENCY_LABEL) as EvidenceFrequency[];
