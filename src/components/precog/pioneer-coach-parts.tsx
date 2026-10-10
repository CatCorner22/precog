/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, type ReactNode } from "react";
import type { PioneerCoachResult } from "@/lib/precog/coach/pioneer-answer";
import type { CoachDecision } from "@/lib/precog/coach/journal-entry";
import { tabLabel, type NavFn } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import { count } from "@/lib/precog/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Check, ChevronDown, Copy, TriangleAlert } from "lucide-react";

/** A finished brief as the coach screen keeps it: the server's success shape. */
export type CoachResult = PioneerCoachResult;
export type { CoachDecision };

/** The message when the business changes while a brief is being built for the old one. */
export const BUSINESS_CHANGED_MESSAGE =
  "You switched businesses while Voyager was working. Ask again for this one.";

/** How many moves show before "Show other moves". One: the move to open. */
export const MOVES_PREVIEW = 1;

/** The brief heading, focused when an answer arrives. */
export const PIONEER_BRIEF_TITLE_ID = "pioneer-brief-title";

/** The Ask button's words. An empty box still asks what to do this week. */
export function askButtonLabel(loading: boolean, hasQuestion: boolean): string {
  if (loading) return "Checking your records…";
  return hasQuestion ? "Ask" : "What do I do this week?";
}

/** The effort badge in owner words. The stored value stays low, medium, or high. */
export function effortWords(effort: string): string {
  if (effort === "low") return "Small job";
  if (effort === "medium") return "Medium job";
  if (effort === "high") return "Large job";
  return effort;
}

/**
 * The two lines a brief leads with, lifted out of the markdown so the screen
 * can show them once. The rest of the brief stays in reading order, without
 * the recommended-moves section the move list already shows.
 */
export function briefBoard(markdown: string): {
  situation: string | null;
  thisWeek: string | null;
  rest: string;
} {
  const situation = sectionText(markdown, "Situation");
  const week = sectionText(markdown, "This week");
  let rest = markdown;
  for (const heading of ["Situation", "This week", "Recommended moves"]) {
    rest = withoutSection(rest, heading);
  }
  return {
    situation,
    thisWeek: week ? dropThisWeekLabel(week) : null,
    rest: rest.trim(),
  };
}

function sectionText(markdown: string, heading: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const body = (end < 0 ? lines.slice(start + 1) : lines.slice(start + 1, end)).join("\n").trim();
  return body || null;
}

/** The screen labels the line "This week", so the body does not say it again. */
function dropThisWeekLabel(body: string): string {
  const stripped = body.replace(/^This week:\s*/i, "");
  if (!stripped || stripped === body) return body;
  return `${stripped.charAt(0).toUpperCase()}${stripped.slice(1)}`;
}

/**
 * Moves in rules order, with the model's selected ids brought to the front.
 * An id that is not a move in this brief changes nothing.
 */
export function orderedMoves<T>(
  decisions: readonly T[],
  highlightIds: readonly string[] | undefined,
): { decision: T; id: string; highlighted: boolean }[] {
  const tagged = decisions.map((decision, index) => ({
    decision,
    id: `move-${index}`,
    highlighted: false,
  }));
  if (!highlightIds?.length) return tagged;
  const wanted = new Set(highlightIds);
  if (!tagged.some((item) => wanted.has(item.id))) return tagged;
  for (const item of tagged) item.highlighted = wanted.has(item.id);
  return [
    ...tagged.filter((item) => item.highlighted),
    ...tagged.filter((item) => !item.highlighted),
  ];
}

/** The first figure this move cites, by label only. The metric stays in the trace. */
export function citedFigure(
  decision: { evidenceIds?: readonly string[] },
  evidence: readonly { id: string; label: string }[],
): string | null {
  for (const id of decision.evidenceIds ?? []) {
    const found = evidence.find((item) => item.id === id);
    if (found) return found.label;
  }
  return null;
}

export function moveDestination(link: { tab: string; id?: string; personId?: string }): {
  tab: string;
  item?: string;
} {
  if (link.personId && (link.tab === "sod" || link.tab === "team")) {
    const item = link.id?.startsWith("person~") ? link.id : `person~${link.personId}`;
    return { tab: "team", item };
  }
  return { tab: link.tab, item: link.id };
}

/**
 * The brief, the moves to log, and, behind a closed disclosure, how the brief
 * was built. The answer comes first; the trace, the review lenses and the
 * sources are there for whoever wants to check it.
 */
export function CoachResultView({
  result,
  onNavigate,
  onLog,
  logged,
  onCopy,
  copied,
  nextQuestions = [],
  onAsk,
  asking = false,
  choosing = false,
}: {
  result: CoachResult;
  onNavigate?: NavFn;
  onLog: (d: CoachDecision) => void;
  logged: ReadonlySet<string>;
  onCopy: () => void;
  copied: boolean;
  /** Other questions, asked in one press. Hidden when none are passed. */
  nextQuestions?: readonly string[];
  onAsk?: (question: string) => void;
  asking?: boolean;
  /** True while Grok is choosing ids for the brief already on screen. */
  choosing?: boolean;
}) {
  const { say } = usePresentation();
  const [allMoves, setAllMoves] = useState(false);
  const ordered = orderedMoves(result.decisions, result.highlightIds);
  const moves = allMoves ? ordered : ordered.slice(0, MOVES_PREVIEW);
  const notes = extraWarnings(result);
  const board = briefBoard(result.markdown);
  const anyHighlighted = ordered.some((item) => item.highlighted);

  useEffect(() => {
    const title = document.getElementById(PIONEER_BRIEF_TITLE_ID);
    title?.scrollIntoView({ block: "start" });
    if (title instanceof HTMLElement) title.focus({ preventScroll: true });
  }, [result.question, result.contextFingerprint]);

  return (
    <>
      <section className="matrix-grid rounded-2xl border border-primary/30 bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={PIONEER_BRIEF_TITLE_ID}
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight"
            >
              {result.question}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{briefAuthorLine(result)}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={onCopy}>
            <Copy className="size-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        {notes.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-muted">
            {notes.map((w) => (
              <li key={w} className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        )}
        {choosing && (
          <p className="mt-3 text-xs text-subtle" role="status">
            Choosing the most relevant move…
          </p>
        )}
      </section>

      {result.decisions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Do this</CardTitle>
            <CardDescription>
              Open the screen that does the move. Adding it to the {tabLabel("journal", say)} is
              separate. The next brief follows a logged move instead of repeating it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {moves.map((item) => {
              const d = item.decision;
              const done = logged.has(d.action);
              const where = d.link;
              const rank = ordered.findIndex((candidate) => candidate.id === item.id) + 1;
              const lead = rank === 1 && ordered.length > 1;
              const figure = citedFigure(d, result.evidence);
              return (
                <div
                  key={d.action}
                  className={
                    lead
                      ? "rounded-xl border border-primary/40 bg-elevated px-3 py-3 text-sm"
                      : "rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular font-mono text-xs text-subtle">
                      {String(rank).padStart(2, "0")}
                    </span>
                    <span className="font-medium">{d.action}</span>
                    {item.highlighted && <Badge variant="primary">Most relevant</Badge>}
                    {lead && !anyHighlighted && (
                      <Badge variant="primary">Start with this one</Badge>
                    )}
                    <Badge variant="default">{effortWords(d.effort)}</Badge>
                    <span className="text-xs text-muted">within {count(d.horizonDays, "day")}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{d.rationale}</p>
                  {figure && <p className="mt-1 text-xs text-muted">From your records: {figure}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {where?.tab && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const dest = moveDestination(where);
                          onNavigate?.(dest.tab, dest.item);
                        }}
                      >
                        {where.personId && (where.tab === "sod" || where.tab === "team")
                          ? "Open this person on Team"
                          : `Open ${tabLabel(where.tab, say)}`}
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" disabled={done} onClick={() => onLog(d)}>
                      {done ? <Check className="size-3.5" /> : <BookOpen className="size-3.5" />}
                      {`${done ? "Added to the" : "Add to the"} ${tabLabel("journal", say)}`}
                    </Button>
                    {done && (
                      <Button size="sm" variant="ghost" onClick={() => onNavigate?.("journal")}>
                        Open {tabLabel("journal", say)}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {ordered.length > MOVES_PREVIEW && (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={allMoves}
                onClick={() => setAllMoves((v) => !v)}
              >
                {allMoves ? "Show this move only" : "Show other moves"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {nextQuestions.length > 0 && onAsk && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-subtle">Ask next</p>
          {nextQuestions.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={asking}
              onClick={() => onAsk(prompt)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm hover:border-border-strong disabled:opacity-50 pointer-coarse:min-h-11"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {(board.situation || board.thisWeek || board.rest) && (
        <details className="rounded-2xl border border-border bg-surface">
          <summary className="cursor-pointer px-6 py-4 text-sm font-semibold">
            Why we say this
          </summary>
          <div className="space-y-4 px-6 pb-6">
            {board.thisWeek && (
              <div>
                <p className="text-xs font-medium text-primary">This week</p>
                <BriefLines markdown={board.thisWeek} className="text-sm text-fg" />
              </div>
            )}
            {board.situation && (
              <BriefLines markdown={board.situation} className="text-sm text-muted" />
            )}
            {board.rest && <BriefMarkdown markdown={board.rest} />}
          </div>
        </details>
      )}

      <details className="group rounded-2xl border border-border bg-surface">
        <summary className="flex cursor-pointer items-center gap-2 px-6 py-4 text-sm font-semibold">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          How Voyager built this brief
        </summary>
        <div className="space-y-4 px-6 pb-6">
          {result.steps.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">
                Steps · {count(result.toolsUsed.length, "check")}
              </h3>
              <ol className="mt-2 space-y-2">
                {result.steps.map((s, i) => (
                  <li
                    key={`${s.phase}-${i}`}
                    className="rounded-lg border border-border bg-elevated px-3 py-2"
                  >
                    <span className="text-sm font-medium">
                      {i + 1}. {s.title}
                    </span>
                    <p className="mt-1 text-xs break-words text-muted">{s.detail}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {result.specialistNotes.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Four review lenses</h3>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {result.specialistNotes.map((n) => (
                  <div
                    key={n.agent}
                    className="rounded-xl border border-border bg-elevated px-3 py-3"
                  >
                    <h4 className="text-sm font-medium">{n.title}</h4>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {n.bullets.map((b) => (
                        <li key={b}>· {b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.details.length > 0 && (
            <section>
              <div className="space-y-3">
                {result.details.map((detail) => (
                  <div
                    key={detail.title}
                    className="rounded-xl border border-border bg-elevated px-3 py-3"
                  >
                    <h3 className="text-sm font-medium">{detail.title}</h3>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {detail.lines.map((line, index) => (
                        <li key={`${index}-${line}`}>· {renderInline(line)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.evidence.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Where the figures come from</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.evidence.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onNavigate?.(e.link.tab, e.link.id)}
                    className="rounded-xl border border-border bg-elevated px-3 py-2 text-left text-sm hover:border-border-strong"
                  >
                    <span className="block font-medium">{e.label}</span>
                    {e.metric && <span className="block text-xs text-muted">{e.metric}</span>}
                    <span className="text-xs text-subtle">Open {tabLabel(e.link.tab, say)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </details>
    </>
  );
}

/** Lines of brief markdown, with bold and italics, and no section headings. */
export function BriefLines({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className="space-y-2">
      {markdown.split("\n").map((line, i) =>
        line.trim() === "" ? null : (
          <p key={i} className={className}>
            {renderInline(line)}
          </p>
        ),
      )}
    </div>
  );
}

/**
 * The brief's markdown as the screen shows it: "##" sections as h3 under the
 * card's h2, "###" as h4, "---" as a rule, list markers as a dot, **bold** and
 * _italic_ inline. Numbered moves keep their numbers.
 */
export function BriefMarkdown({ markdown }: { markdown: string }) {
  return (
    <article className="space-y-3 text-sm leading-relaxed">
      {markdown.split("\n").map((line, i) => {
        if (line.startsWith("### ")) {
          return (
            <h4 key={i} className="pt-1 text-sm font-semibold text-fg">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h3 key={i} className="pt-2 text-base font-semibold tracking-tight text-fg">
              {line.slice(3)}
            </h3>
          );
        }
        if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) return <hr key={i} className="border-border" />;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-muted">
            {renderInline(line.replace(/^[-*]\s/, "· "))}
          </p>
        );
      })}
    </article>
  );
}

export function withoutSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start < 0) return markdown;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return [...lines.slice(0, start), ...(end < 0 ? [] : lines.slice(end))].join("\n");
}

/** Who wrote the brief, in one line the owner can repeat to their accountant. */
export function briefAuthorLine(
  result: Pick<CoachResult, "modelStatus" | "model" | "ranker">,
): string {
  if (result.ranker === "huggingface") {
    return "A Hugging Face model ranked these moves. Precog's rules wrote every word.";
  }
  if (result.ranker === "both") {
    return "A Hugging Face model and Grok agreed on these moves. Precog's rules wrote every word.";
  }
  return result.modelStatus === "answered"
    ? `Grok (${result.model ?? "model"}) picked the moves most relevant to your question. Precog's rules wrote every word.`
    : "Written by Precog's rules from your records. No AI wrote it.";
}

/** Warnings the brief's own Warnings section does not already list (sign in, the model failed). */
export function extraWarnings(result: Pick<CoachResult, "warnings" | "markdown">): string[] {
  const watchedConditionsListed = result.markdown.includes("Watched conditions: **");
  return result.warnings.filter(
    (warning) =>
      !result.markdown.includes(warning) &&
      !(watchedConditionsListed && /^\d+ watched conditions? breached/i.test(warning)),
  );
}

/**
 * The message for a failed run: the server's own words for a refusal it
 * explains (a 429 that says to sign in, a 400), and a plain sentence for
 * anything else, whose text may be internal.
 */
export function coachErrorMessage(e: unknown): string {
  const status =
    e && typeof e === "object" && "status" in e ? (e as { status: unknown }).status : null;
  const refusal = typeof status === "number" && status >= 400 && status < 500;
  if (refusal && e instanceof Error && e.message.trim()) return e.message;
  return "Voyager could not answer just now. Try again in a moment.";
}

export function briefClipboardText(result: Pick<CoachResult, "question" | "markdown">): string {
  return `**Question:** ${result.question}\n\n${result.markdown}`;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return (
        <em key={i} className="text-fg">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
