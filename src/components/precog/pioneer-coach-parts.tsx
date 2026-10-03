/* eslint-disable react-refresh/only-export-components */
import { useState, type ReactNode } from "react";
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
  "The business changed while Pioneer was building the brief; ask again for this one.";

/** How many recommended moves show before "Show all". */
export const MOVES_PREVIEW = 3;

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
}: {
  result: CoachResult;
  onNavigate?: NavFn;
  onLog: (d: CoachDecision) => void;
  logged: ReadonlySet<string>;
  onCopy: () => void;
  copied: boolean;
}) {
  const { say } = usePresentation();
  const [allMoves, setAllMoves] = useState(false);
  const moves = allMoves ? result.decisions : result.decisions.slice(0, MOVES_PREVIEW);
  const notes = extraWarnings(result);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Your brief</CardTitle>
              <CardDescription>{briefAuthorLine(result)}</CardDescription>
            </div>
            <Button size="sm" variant="secondary" onClick={onCopy}>
              <Copy className="size-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          {notes.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-muted">
              {notes.map((w) => (
                <li key={w} className="flex gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </CardHeader>
        <CardContent>
          <BriefMarkdown markdown={result.markdown} />
        </CardContent>
      </Card>

      {result.decisions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{`Add a move to the ${tabLabel("journal", say)}`}</CardTitle>
            <CardDescription>
              A logged move gets a review date, and the next brief follows it up instead of
              recommending it again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {moves.map((d) => {
              const done = logged.has(d.action);
              return (
                <div
                  key={d.action}
                  className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.action}</span>
                    <Badge variant="default">{d.effort} effort</Badge>
                    <span className="text-xs text-muted">within {count(d.horizonDays, "day")}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{d.rationale}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
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
            {result.decisions.length > MOVES_PREVIEW && (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={allMoves}
                onClick={() => setAllMoves((v) => !v)}
              >
                {allMoves ? `Show the top ${MOVES_PREVIEW}` : `Show all ${result.decisions.length}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <details className="group rounded-2xl border border-border bg-surface">
        <summary className="flex cursor-pointer items-center gap-2 px-6 py-4 text-sm font-semibold">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          How Pioneer built this brief
        </summary>
        <div className="space-y-4 px-6 pb-6">
          {result.steps.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">
                Steps · {count(result.toolsUsed.length, "tool")} · {result.latencyMs} ms
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

/** Who wrote the brief, in one line the owner can repeat to their accountant. */
export function briefAuthorLine(result: Pick<CoachResult, "modelStatus" | "model">): string {
  return result.modelStatus === "answered"
    ? `Selected by Grok (${result.model ?? "model"}) from complete statements written by Precog's rules. No model-written claims were added.`
    : "Written by Precog's rules from your data. No AI model wrote it.";
}

/** Warnings the brief's own Warnings section does not already list (sign in, the model failed). */
export function extraWarnings(result: Pick<CoachResult, "warnings" | "markdown">): string[] {
  return result.warnings.filter((w) => !result.markdown.includes(w));
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
  return "Pioneer could not build the brief. Try again in a moment.";
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
