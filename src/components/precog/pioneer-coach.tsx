import { useEffect, useRef, useState } from "react";
import { writtenProcedureLinks } from "@/lib/precog/procedures/coverage-link";
import { runPioneerCoach } from "@/lib/precog/coach/pioneer-server";
import { PIONEER_LIST_CAPS } from "@/lib/precog/coach/pioneer-caps";
import { CONTROL_CONFIRM_TAB, CONTROL_IN_PLACE_TAB } from "@/lib/precog/active-template";
import { usePractice } from "@/lib/precog/practice-context";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Compass, Loader2, Sparkles } from "lucide-react";
import { type NavFn } from "@/lib/precog/navigation";
import { PageIntro } from "@/components/precog/page-intro";
import { localDateKey } from "@/lib/precog/dates";
import { journalEntry, type CoachDecision } from "@/lib/precog/coach/journal-entry";
import {
  askButtonLabel,
  BUSINESS_CHANGED_MESSAGE,
  CoachResultView,
  briefClipboardText,
  coachErrorMessage,
  type CoachResult,
} from "./pioneer-coach-parts";

export function PioneerCoach({ onNavigate }: { onNavigate?: NavFn }) {
  const { profile, addDecision } = usePractice();
  const prompts = getIndustryCopy(profile.industry).pioneerPrompts;
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [logged, setLogged] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // A brief answers one business; a run whose business changed underneath it
  // is discarded, and the owner is told why. The typed question stays.
  const runId = useRef(0);
  const running = useRef(false);
  useEffect(() => {
    runId.current += 1;
    setResult(null);
    setLogged(new Set());
    setError(running.current ? BUSINESS_CHANGED_MESSAGE : null);
    running.current = false;
    setLoading(false);
  }, [profile.industry, profile.businessId]);

  async function run(asked?: string) {
    const id = ++runId.current;
    const askedQuestion = (asked ?? question).trim();
    setQuestion(askedQuestion);
    running.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await runPioneerCoach({
        data: {
          question: askedQuestion,
          today: localDateKey(new Date()),
          profile: {
            industry: profile.industry,
            practiceName: profile.practiceName,
            staff: profile.staff,
            riskVariables: profile.riskVariables,
            setupAnswers: profile.setupAnswers ?? null,
            dualRelease: profile.dualRelease,
            customProcesses: profile.customProcesses ?? null,
            customPeople: profile.customPeople ?? null,
            customKnowledge: profile.customKnowledge ?? null,
            // Pioneer reads the first 2,500 and refuses more than 5,000.
            customRelations: profile.customRelations?.slice(0, PIONEER_LIST_CAPS.relations) ?? null,
            // The journal entries the server reads: continuity commitments,
            // the scenarios the owner confirmed apply, the starter controls
            // they confirmed run here, and the controls they already have,
            // so Pioneer scores the same scope and controls as every other
            // screen.
            decisions: profile.decisions.filter((d) => PIONEER_JOURNAL_TABS.has(d.linkedTab ?? "")),
            plannedAbsences: profile.plannedAbsences ?? [],
            // Which register items have a written procedure; never the steps.
            procedureLinks: writtenProcedureLinks(profile.procedures, profile.industry),
          },
        },
      });
      if (id !== runId.current) return;
      if (!res.ok) {
        setError(res.error);
        setResult(null);
      } else {
        setResult({ ...res, question: askedQuestion || res.question });
        setLogged(new Set());
      }
    } catch (e) {
      if (id !== runId.current) return;
      setError(coachErrorMessage(e));
    } finally {
      if (id === runId.current) {
        running.current = false;
        setLoading(false);
      }
    }
  }

  async function copyBrief() {
    if (!result?.markdown) return;
    try {
      await navigator.clipboard.writeText(briefClipboardText(result));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard access can be refused; the brief is still on screen. */
    }
  }

  function logDecision(d: CoachDecision) {
    if (logged.has(d.action)) return;
    addDecision(journalEntry(d, new Date()));
    setLogged((prev) => new Set(prev).add(d.action));
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="primary">Built from your records</Badge>
        <PageIntro
          tab="pioneer"
          className="mt-3"
          icon={<Compass className="size-5 text-primary" aria-hidden />}
          purpose="Pioneer is Precog's assistant. Ask about your team, someone leaving, or what to fix first; it answers from your records."
          method={
            <p>
              Precog&rsquo;s rules write every answer from your records: duty conflicts, who knows
              what, scenarios, guidance and real cases. Rankings use Precog&rsquo;s weights, not
              measurements. When you are signed in, Grok picks the moves most relevant to your
              question; it never writes or changes them.
            </p>
          }
        />
        <div className="mt-4 space-y-3">
          <textarea
            aria-label="Your question"
            placeholder="Ask about your team, a person leaving, or what to fix first"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!loading) void run();
              }
            }}
            rows={3}
            className="w-full rounded-xl border border-border bg-elevated px-3 py-2 text-sm"
          />
          {!result && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-subtle">Or start from one of these</span>
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={question === p}
                  disabled={loading}
                  onClick={() => void run(p)}
                  className={
                    question === p
                      ? "rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-left text-sm pointer-coarse:min-h-11"
                      : "rounded-xl border border-border bg-elevated px-3 py-2 text-left text-sm text-muted hover:border-border-strong pointer-coarse:min-h-11"
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run()} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {askButtonLabel(true, false)}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden />
                  {askButtonLabel(false, question.trim().length > 0)}
                </>
              )}
            </Button>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <p role="status" className="sr-only">
            {loading ? "Checking your records" : result ? "Answer ready" : ""}
          </p>
        </div>
      </section>

      {result && (
        <CoachResultView
          result={result}
          onNavigate={onNavigate}
          onLog={logDecision}
          logged={logged}
          onCopy={copyBrief}
          copied={copied}
          nextQuestions={prompts.filter((prompt) => prompt !== result.question)}
          onAsk={(prompt) => void run(prompt)}
          asking={loading}
        />
      )}
    </div>
  );
}

const PIONEER_JOURNAL_TABS = new Set([
  "knowledge",
  "precog",
  CONTROL_CONFIRM_TAB,
  CONTROL_IN_PLACE_TAB,
]);
