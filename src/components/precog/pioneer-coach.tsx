import { useState, type ReactNode } from "react";
import { runPioneerCoach } from "@/lib/precog/coach/pioneer-server";
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Brain,
  Compass,
  Copy,
  GitBranch,
  Loader2,
  Sparkles,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";

const PROMPTS = [
  "Where is residual risk worst, and what do leading indicators say?",
  "If I turn on dual control and cameras, what else moves — premium, retained, residual?",
  "Forecast residual for 12 weeks if I do nothing vs dual control + bank rec.",
  "What COSO language should I use when I accept residual risk on write-offs?",
  "Give me a multi-agent board brief: ops, controls, precog, and critic.",
];

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
    if (part.startsWith("_") && part.endsWith("_")) {
      return (
        <em key={i} className="text-fg">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

type CoachResult = {
  source: string;
  model?: string;
  markdown: string;
  contextFingerprint: string;
  latencyMs?: number;
  toolsUsed?: string[];
  steps?: {
    phase: string;
    title: string;
    detail: string;
    toolSummaries?: string[];
  }[];
  evidence?: {
    id: string;
    kind: string;
    label: string;
    metric?: string;
    link: { tab: string; id?: string };
  }[];
  warnings?: string[];
  decisions?: {
    action: string;
    rationale: string;
    effort: string;
    horizonDays: number;
  }[];
  specialistNotes?: { agent: string; title: string; bullets: string[] }[];
};

export function PioneerCoach({
  onNavigate,
}: {
  onNavigate?: (tab: string, id?: string) => void;
}) {
  const { profile, addDecision } = usePractice();
  const [question, setQuestion] = useState(PROMPTS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await runPioneerCoach({
        data: {
          question,
          riskVariables: profile.riskVariables,
          staff: profile.staff,
          practiceName: profile.practiceName,
        },
      });
      if (!res.ok) {
        setError(res.error);
        setResult(null);
      } else {
        setResult({
          source: res.source,
          model: res.model,
          markdown: res.markdown,
          contextFingerprint: res.contextFingerprint,
          latencyMs: res.latencyMs,
          toolsUsed: res.toolsUsed,
          steps: res.steps,
          evidence: res.evidence,
          warnings: res.warnings,
          decisions: res.decisions,
          specialistNotes: res.specialistNotes,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coach failed");
    } finally {
      setLoading(false);
    }
  }

  async function copyBrief() {
    if (!result?.markdown) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function logFirstDecision() {
    const d = result?.decisions?.[0];
    if (!d) return;
    addDecision({
      subject: d.action.slice(0, 120),
      kind: "remediate",
      note: d.rationale,
      reviewBy: new Date(Date.now() + d.horizonDays * 86400000)
        .toISOString()
        .slice(0, 10),
    });
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">LLM + RAG + ML</Badge>
          <Badge variant="primary">Multi-agent board</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <Compass className="size-6 text-primary" />
          Precog Pioneer
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Tool-grounded agent loop: residual, cascades, TF-IDF guidance retrieval, anomaly
          scoring, leading indicators, residual forecast, then Operator / Shield / Precog /
          Critic specialists.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ask the frontier</CardTitle>
          <CardDescription>
            Always retrieves RAG + ML tools. Opens Intelligence for charts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
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
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-elevated px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={run} disabled={loading || !question.trim()}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Multi-agent run…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Run Pioneer agent
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate?.("intel")}>
              <Brain className="size-3.5" />
              Intelligence
            </Button>
            <Button variant="secondary" onClick={() => onNavigate?.("precog")}>
              <GitBranch className="size-3.5" />
              Cascades
            </Button>
          </div>
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          {(result.steps?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="size-4" />
                  Reasoning trace
                </CardTitle>
                <CardDescription>
                  {result.toolsUsed?.length ?? 0} tools · {result.latencyMs ?? "—"}ms ·{" "}
                  {result.source}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.steps!.map((s, i) => (
                  <div
                    key={`${s.phase}-${i}`}
                    className="rounded-lg border border-border bg-elevated px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{s.phase}</Badge>
                      <span className="text-sm font-medium">{s.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{s.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(result.specialistNotes?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4" />
                  Specialist board
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {result.specialistNotes!.map((n) => (
                  <div
                    key={n.agent}
                    className="rounded-xl border border-border bg-elevated px-3 py-3"
                  >
                    <Badge variant="primary">{n.agent}</Badge>
                    <p className="mt-1 text-sm font-medium">{n.title}</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {n.bullets.map((b) => (
                        <li key={b}>· {b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(result.warnings?.length ?? 0) > 0 && (
            <Card className="border-warn/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-warn">
                  <TriangleAlert className="size-4" />
                  Warnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted">
                  {result.warnings!.map((w) => (
                    <li key={w}>· {w}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {(result.evidence?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evidence</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {result.evidence!.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onNavigate?.(e.link.tab, e.link.id)}
                    className="rounded-xl border border-border bg-elevated px-3 py-2 text-left text-sm hover:border-border-strong"
                  >
                    <span className="text-[10px] text-subtle">
                      {e.kind} · {e.id}
                    </span>
                    <span className="block font-medium">{e.label}</span>
                    {e.metric && (
                      <span className="block text-xs text-muted">{e.metric}</span>
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {(result.decisions?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Decisions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.decisions!.map((d) => (
                  <div
                    key={d.action}
                    className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap gap-2">
                      <span className="font-medium">{d.action}</span>
                      <Badge variant="default">{d.effort}</Badge>
                      <span className="text-xs text-muted">{d.horizonDays}d</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{d.rationale}</p>
                  </div>
                ))}
                <Button size="sm" variant="secondary" onClick={logFirstDecision}>
                  Log top decision
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Scout brief</CardTitle>
                  <CardDescription className="font-mono text-[11px]">
                    {result.contextFingerprint}
                  </CardDescription>
                </div>
                <Button size="sm" variant="secondary" onClick={copyBrief}>
                  <Copy className="size-3.5" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <article className="space-y-3 text-sm leading-relaxed">
                {result.markdown.split("\n").map((line, i) => {
                  if (line.startsWith("### ")) {
                    return (
                      <h4 key={i} className="pt-1 text-sm font-semibold text-fg">
                        {line.replace(/^### /, "")}
                      </h4>
                    );
                  }
                  if (line.startsWith("## ")) {
                    return (
                      <h3
                        key={i}
                        className="pt-2 text-base font-semibold tracking-tight text-fg"
                      >
                        {line.replace(/^## /, "")}
                      </h3>
                    );
                  }
                  if (line.trim() === "") return <div key={i} className="h-1" />;
                  return (
                    <p key={i} className="text-muted">
                      {renderInline(line.replace(/^[-*]\s/, "· "))}
                    </p>
                  );
                })}
              </article>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
