import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import {
  DECISION_KIND_LABEL,
  type DecisionEntry,
  type DecisionKind,
} from "@/lib/precog/practice-profile";
import { portfolioSummary } from "@/lib/precog/scoring/residual-engine";
import {
  captureDecisionSnapshot,
  continuitySlips,
  decisionDelta,
  decisionsDue,
  isDecisionOpen,
  linkedKnowledgeId,
  linkedToIndustry,
  slipLabels,
} from "@/lib/precog/decisions/follow-through";
import { DOCUMENTATION_LABEL, STATUS_LABEL } from "@/lib/precog/continuity/coverage";
import { useToday } from "@/lib/precog/decisions/use-today";
import { CONFLICT_RULES } from "@/lib/precog/sod/conflict-rules";
import { casesForSodRules, observedLossRange } from "@/lib/precog/evidence";
import { formatUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Plus, Trash2 } from "lucide-react";

const KINDS: DecisionKind[] = ["remediate", "accept_residual", "monitor", "insure"];

function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

function reviewDelta(
  d: DecisionEntry,
  current: ReturnType<typeof captureDecisionSnapshot>,
): string {
  const delta = decisionDelta(d, current);
  if (!delta || !d.snapshot) return "no snapshot on record";
  if (!delta.comparable) {
    return `scoring model changed since this was logged (v${d.snapshot.scoringVersion} → v${current.scoringVersion}) — values not directly comparable`;
  }
  if (delta.continuity && d.snapshot.continuity && current.continuity) {
    const c = delta.continuity;
    const item = c.itemThen
      ? `${STATUS_LABEL[c.itemThen].toLowerCase()} → ${
          c.itemNow ? STATUS_LABEL[c.itemNow].toLowerCase() : "no longer on the register"
        } · `
      : "";
    const docs =
      c.docsThen && c.docsNow && c.docsThen !== c.docsNow
        ? `${DOCUMENTATION_LABEL[c.docsThen].toLowerCase()} → ${DOCUMENTATION_LABEL[c.docsNow].toLowerCase()} · `
        : "";
    return `${item}${docs}backed up ${d.snapshot.continuity.coverageIndex}% → ${current.continuity.coverageIndex}% (${signed(c.coverageIndex)}) · single points of failure ${d.snapshot.continuity.singlePoints} → ${current.continuity.singlePoints}`;
  }
  if (delta.subject !== undefined && d.snapshot.subjectResidual !== undefined) {
    return `residual ${d.snapshot.subjectResidual} → ${current.subjectResidual} (${signed(delta.subject)}) · open SoD conflicts ${d.snapshot.sodOpenConflicts} → ${current.sodOpenConflicts}`;
  }
  return `portfolio avg ${d.snapshot.averageResidual} → ${current.averageResidual} (${signed(delta.average)}) · open SoD conflicts ${d.snapshot.sodOpenConflicts} → ${current.sodOpenConflicts}`;
}

export function DecisionJournal({
  onOpenLinked,
}: {
  onOpenLinked?: (tab: string, id?: string) => void;
}) {
  const { profile, template, addDecision, removeDecision, reviewDecision } = usePractice();
  const portfolio = useMemo(
    () => portfolioSummary(template, profile.staff),
    [template, profile.staff],
  );

  const [subject, setSubject] = useState(portfolio.top[0]?.name ?? "");
  const [kind, setKind] = useState<DecisionKind>("remediate");
  const [note, setNote] = useState("");
  const [reviewDays, setReviewDays] = useState(30);

  /**
   * What accepting this particular gap has cost other businesses.
   *
   * Accepting residual risk is a legitimate decision, and the journal exists
   * so it is a recorded one. When the subject is a control and the owner has
   * chosen "accept residual", the prosecuted cases behind the duty conflicts
   * that control addresses are put in front of them before they save, with
   * the loss figures as stated in the sources. Subjects with no such cases
   * get no note rather than a loosely related one.
   */
  const acceptEvidence = useMemo(() => {
    if (kind !== "accept_residual") return null;
    const match = portfolio.top.find((t) => t.name === subject);
    if (!match?.linkedControlId) return null;
    const ruleIds = CONFLICT_RULES.filter((r) => r.linkedControlId === match.linkedControlId).map(
      (r) => r.id,
    );
    if (ruleIds.length === 0) return null;
    const cases = casesForSodRules(ruleIds);
    if (cases.length === 0) return null;
    const largest = cases.reduce((best, c) => (c.lossUsd > best.lossUsd ? c : best), cases[0]);
    return { count: cases.length, range: observedLossRange(cases), largest };
  }, [kind, subject, portfolio.top]);

  const today = useToday();
  const due = useMemo(() => decisionsDue(profile.decisions, today), [profile.decisions, today]);
  const dueDecisions = useMemo(() => [...due.overdue, ...due.dueSoon], [due.overdue, due.dueSoon]);
  const slips = useMemo(
    () => continuitySlips(profile.decisions, template),
    [profile.decisions, template],
  );
  const currentSnapshots = useMemo(() => {
    return new Map(
      profile.decisions.map((d) => [
        d.id,
        captureDecisionSnapshot(
          template,
          profile.staff,
          profile.dualRelease,
          d.subject,
          new Date(),
          linkedKnowledgeId(d, profile.industry),
        ),
      ]),
    );
  }, [profile.decisions, profile.industry, template, profile.staff, profile.dualRelease]);
  const orderedDecisions = useMemo(
    () =>
      [...profile.decisions].sort((a, b) => Number(isDecisionOpen(b)) - Number(isDecisionOpen(a))),
    [profile.decisions],
  );

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
          COSO monitoring needs a paper trail. Record remediate, accept residual, monitor, or insure
          decisions with a review date. Syncs to your account when signed in.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          {slips.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Slipped since closed</CardTitle>
                <CardDescription>
                  You closed these as done, but the register no longer backs them up or the
                  procedure is no longer written/findable. Reopen to put the step back on a review
                  date.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {slips.map((slip) => {
                  const { decision: d } = slip;
                  const labels = slipLabels(slip);
                  return (
                    <div
                      key={d.id}
                      className="rounded-lg border border-danger/40 bg-elevated px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="danger">Slipped</Badge>
                        <span className="font-medium">{d.subject}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {labels.from} when closed → {labels.to} now
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            reviewDecision(
                              d.id,
                              "still_open",
                              `Reopened: ${
                                slip.measure === "coverage" ? "coverage" : "documentation"
                              } slipped to "${labels.to}"`,
                              30,
                            )
                          }
                        >
                          Reopen +30d
                        </Button>
                        {d.linkedTab && onOpenLinked && linkedToIndustry(d, profile.industry) && (
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
                          onClick={() => reviewDecision(d.id, "no_longer_relevant")}
                        >
                          Not relevant
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          {dueDecisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reviews due</CardTitle>
                <CardDescription>Re-score the decision before you close the loop.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {dueDecisions.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-border bg-elevated px-3 py-2.5"
                  >
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
                      <span className="font-medium">{d.subject}</span>
                      {d.reviewBy && (
                        <span className="text-[11px] text-subtle">review by {d.reviewBy}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs tabular text-muted">
                      {reviewDelta(d, currentSnapshots.get(d.id)!)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => reviewDecision(d.id, "done")}
                      >
                        Done
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => reviewDecision(d.id, "still_open", undefined, 90)}
                      >
                        Still open +90d
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => reviewDecision(d.id, "no_longer_relevant")}
                      >
                        Not relevant
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
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
              {acceptEvidence && (
                <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm leading-relaxed text-muted">
                  <p className="font-medium text-warn">Before you accept this</p>
                  <p className="mt-1">
                    {acceptEvidence.count} prosecuted{" "}
                    {acceptEvidence.count === 1 ? "case involves" : "cases involve"} the duty
                    conflicts this control addresses
                    {acceptEvidence.range
                      ? `; median stated loss ${formatUsd(acceptEvidence.range.median)}`
                      : ""}
                    . The largest: &ldquo;{acceptEvidence.largest.title}&rdquo; (
                    {acceptEvidence.largest.lossIsFloor ? "at least " : ""}
                    {formatUsd(acceptEvidence.largest.lossUsd)}). Accepting is a legitimate
                    decision; write down which compensating control makes it acceptable and who
                    reviews it.
                  </p>
                  {onOpenLinked && (
                    <button
                      type="button"
                      onClick={() => onOpenLinked("start")}
                      className="mt-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      Read the cases on Start here
                    </button>
                  )}
                </div>
              )}
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log ({profile.decisions.length})</CardTitle>
            <CardDescription>Newest first · residual snapshot when available</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile.decisions.length === 0 && (
              <p className="text-sm text-muted">
                No decisions yet. Accepting residual risk without a log is how small businesses get
                surprised.
              </p>
            )}
            {orderedDecisions.map((d) => {
              const past =
                isDecisionOpen(d) && d.reviewBy && new Date(d.reviewBy).getTime() < Date.now();
              return (
                <div key={d.id} className="rounded-xl border border-border bg-elevated px-3 py-3">
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
                        {!isDecisionOpen(d) && <Badge variant="default">Closed</Badge>}
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
                        {d.reviews?.length ? ` · reviewed ${d.reviews.length}×` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {d.linkedTab && onOpenLinked && linkedToIndustry(d, profile.industry) && (
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
