import { useEffect, useRef, useState } from "react";
import { writtenProcedureLinks } from "@/lib/precog/procedures/coverage-link";
import { runPioneerCoach } from "@/lib/precog/coach/pioneer-server";
import { PIONEER_LIST_CAPS } from "@/lib/precog/coach/pioneer-caps";
import { CONTROL_CONFIRM_TAB, CONTROL_IN_PLACE_TAB } from "@/lib/precog/active-template";
import { usePractice } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Compass, GitBranch, Loader2, Sparkles } from "lucide-react";
import { tabLabel, type NavFn } from "@/lib/precog/navigation";
import { localDateKey } from "@/lib/precog/dates";
import { journalEntry, type CoachDecision } from "@/lib/precog/coach/journal-entry";
import {
  BUSINESS_CHANGED_MESSAGE,
  CoachResultView,
  coachErrorMessage,
  type CoachResult,
} from "./pioneer-coach-parts";

export function PioneerCoach({ onNavigate }: { onNavigate?: NavFn }) {
  const { profile, addDecision } = usePractice();
  const { say } = usePresentation();
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

  async function run() {
    const id = ++runId.current;
    running.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await runPioneerCoach({
        data: {
          question,
          today: localDateKey(new Date()),
          profile: {
            industry: profile.industry,
            practiceName: profile.practiceName,
            staff: profile.staff,
            riskVariables: profile.riskVariables,
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
        setResult(res);
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
      await navigator.clipboard.writeText(result.markdown);
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
        <Badge variant="primary">Grounded in Precog&rsquo;s tools</Badge>
        <h1 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <Compass className="size-6 text-primary" aria-hidden />
          {tabLabel("pioneer", say)}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Pioneer builds every answer from Precog&rsquo;s own records: the exposure that remains,
          duty conflicts, scenarios, the guidance library, and the prosecuted cases. Where it orders
          fixes, it uses Precog&rsquo;s weights and says so. It never invents a measurement.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ask Pioneer</CardTitle>
          <CardDescription>Answers use only Precog&rsquo;s own figures.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            aria-label="Your question"
            placeholder="Ask about your team, a person leaving, or what to fix first"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-elevated px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-subtle">Try:</span>
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={question === p}
                onClick={() => setQuestion(p)}
                className={
                  question === p
                    ? "rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-left text-xs"
                    : "rounded-full border border-border bg-elevated px-3 py-1.5 text-left text-xs text-muted hover:border-border-strong"
                }
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={run} disabled={loading || !question.trim()}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Building the brief…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden />
                  Get the brief
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate?.("intel")}>
              <Brain className="size-3.5" aria-hidden />
              Open {tabLabel("intel", say)}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate?.("precog")}>
              <GitBranch className="size-3.5" aria-hidden />
              Open {tabLabel("precog", say)}
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
            {loading ? "Building the brief" : result ? "Brief ready" : ""}
          </p>
        </CardContent>
      </Card>

      {result && (
        <CoachResultView
          result={result}
          onNavigate={onNavigate}
          onLog={logDecision}
          logged={logged}
          onCopy={copyBrief}
          copied={copied}
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
