import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import {
  DECISION_KIND_LABEL,
  type DecisionKind,
} from "@/lib/precog/practice-profile";
import { portfolioSummary } from "@/lib/precog/scoring/residual-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Plus, Trash2 } from "lucide-react";

const KINDS: DecisionKind[] = [
  "remediate",
  "accept_residual",
  "monitor",
  "insure",
];

export function DecisionJournal({
  onOpenLinked,
}: {
  onOpenLinked?: (tab: string, id?: string) => void;
}) {
  const { profile, addDecision, removeDecision } = usePractice();
  const portfolio = useMemo(
    () => portfolioSummary(profile.staff),
    [profile.staff],
  );

  const [subject, setSubject] = useState(portfolio.top[0]?.name ?? "");
  const [kind, setKind] = useState<DecisionKind>("remediate");
  const [note, setNote] = useState("");
  const [reviewDays, setReviewDays] = useState(30);

  const overdue = useMemo(() => {
    const now = Date.now();
    return profile.decisions.filter(
      (d) => d.reviewBy && new Date(d.reviewBy).getTime() < now,
    );
  }, [profile.decisions]);

  function submit() {
    if (!subject.trim()) return;
    const reviewBy = new Date();
    reviewBy.setDate(reviewBy.getDate() + reviewDays);
    const match = portfolio.top.find((t) => t.name === subject);
    addDecision({
      subject: subject.trim(),
      kind,
      note: note.trim() || DECISION_KIND_LABEL[kind],
      reviewBy: reviewBy.toISOString().slice(0, 10),
      residualAtDecision: match?.residual,
      linkedTab:
        match?.category === "knowledge"
          ? "knowledge"
          : match?.category === "scenario"
            ? "precog"
            : match?.category === "control"
              ? "sod"
              : "residual",
      linkedId: match?.linkedKnowledgeId ?? match?.linkedScenarioId ?? match?.linkedControlId,
    });
    setNote("");
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="accent">Decision journal</Badge>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <BookOpen className="size-5 text-primary" />
          Write it down or it did not happen
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          COSO monitoring needs a paper trail. Record remediate, accept residual, monitor, or
          insure decisions with a review date. Stored on this device for the demo profile.
        </p>
        {overdue.length > 0 && (
          <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            {overdue.length} decision(s) past review date — re-open residual radar and re-score.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log a decision</CardTitle>
            <CardDescription>Plain language. Owner-owned. Review-dated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted">Subject</span>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              >
                {portfolio.top.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name} ({t.residual})
                  </option>
                ))}
                <option value="Practice-wide monitoring">Practice-wide monitoring</option>
                <option value="Insurance / transfer terms">Insurance / transfer terms</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={
                    kind === k
                      ? "rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs"
                      : "rounded-full border border-border bg-elevated px-3 py-1 text-xs text-muted"
                  }
                >
                  {DECISION_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <label className="block text-sm">
              <span className="text-muted">Note</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Why this choice? What compensating control? Who owns the review?"
                className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Review in (days)</span>
                <span className="tabular font-medium">{reviewDays}</span>
              </div>
              <input
                type="range"
                min={7}
                max={180}
                step={7}
                value={reviewDays}
                onChange={(e) => setReviewDays(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--color-primary)]"
              />
            </label>
            <Button onClick={submit}>
              <Plus className="size-3.5" />
              Save decision
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Log ({profile.decisions.length})
            </CardTitle>
            <CardDescription>
              Newest first · residual snapshot when available
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile.decisions.length === 0 && (
              <p className="text-sm text-muted">
                No decisions yet. Accepting residual risk without a log is how small practices get
                surprised.
              </p>
            )}
            {profile.decisions.map((d) => {
              const past =
                d.reviewBy && new Date(d.reviewBy).getTime() < Date.now();
              return (
                <div
                  key={d.id}
                  className="rounded-xl border border-border bg-elevated px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            d.kind === "accept_residual"
                              ? "warn"
                              : d.kind === "remediate"
                                ? "ok"
                                : "primary"
                          }
                        >
                          {DECISION_KIND_LABEL[d.kind]}
                        </Badge>
                        {past && <Badge variant="danger">Review overdue</Badge>}
                        {d.residualAtDecision != null && (
                          <span className="text-xs tabular text-muted">
                            residual was {d.residualAtDecision}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-medium">{d.subject}</p>
                      <p className="mt-0.5 text-sm text-muted">{d.note}</p>
                      <p className="mt-1 text-[11px] text-subtle">
                        {new Date(d.createdAt).toLocaleDateString()}
                        {d.reviewBy ? ` · review by ${d.reviewBy}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {d.linkedTab && onOpenLinked && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenLinked(d.linkedTab!, d.linkedId)}
                        >
                          Open
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeDecision(d.id)}
                        aria-label="Delete decision"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
