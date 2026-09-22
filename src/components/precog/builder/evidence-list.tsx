import { useState } from "react";
import { toast } from "sonner";

import type { ProcessNode } from "@/lib/precog/types";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { Plus, Trash2, X } from "lucide-react";
import type { Person } from "@/lib/precog/types";

import { Sparkles } from "lucide-react";

import {
  FREQUENCY_LABEL,
  evidenceStatus,
  suggestEvidence,
  summarizeEvidence,
} from "@/lib/precog/builder/evidence";
import type { EvidenceFrequency, EvidenceItem } from "@/lib/precog/types";

import { CheckCircle2 } from "lucide-react";

import { uid, inputCls, labelCls } from "@/components/precog/builder/form-shared";
const FREQUENCIES: EvidenceFrequency[] = ["daily", "weekly", "monthly", "quarterly", "annual"];

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
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [frequency, setFrequency] = useState<EvidenceFrequency>("monthly");
  const [reviewer, setReviewer] = useState("");

  function commit() {
    if (!label.trim()) return;
    onChange([
      ...items,
      {
        id: uid("ev"),
        label: label.trim().slice(0, 100),
        frequency,
        reviewerPersonId: reviewer || undefined,
      },
    ]);
    setLabel("");
    setAdding(false);
  }

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
    toast.success(`Added ${fresh.length} evidence item(s)`);
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
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Sparkles className="size-3" /> Suggest evidence
          </button>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            {adding ? <X className="size-3" /> : <Plus className="size-3" />}
            {adding ? "Cancel" : "Add"}
          </button>
        </span>
      </div>
      {items.length === 0 && !adding && (
        <p className="text-[11px] text-subtle">
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
              "flex items-start gap-2 rounded-md border px-2 py-1.5 text-[11px]",
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
              className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-fg hover:border-ok/50 hover:text-ok"
              title="Record that this review was completed today"
            >
              Done today
            </button>
            <button
              type="button"
              onClick={() => onChange(items.filter((x) => x.id !== e.id))}
              className="text-subtle hover:text-danger"
              aria-label="Remove evidence"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        );
      })}
      {adding && (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <input
            className={inputCls}
            placeholder="e.g. Owner signs off bank reconciliation"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-1.5">
            <select
              className={inputCls}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as EvidenceFrequency)}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            >
              <option value="">Reviewer (optional)</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={commit} disabled={!label.trim()}>
            Add evidence
          </Button>
        </div>
      )}
    </div>
  );
}
