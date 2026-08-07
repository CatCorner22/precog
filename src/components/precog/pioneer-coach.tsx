import { useState, type ReactNode } from "react";
import { runPioneerCoach } from "@/lib/precog/coach/pioneer-server";
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Compass,
  Copy,
  GitBranch,
  Loader2,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";

const PROMPTS = [
  "Where is residual risk worst this week, and what should I do first?",
  "If I turn on dual control and cameras, what else moves — premium, retained loss, residual?",
  "What happens to annual cost of risk if I raise the deductible to $10,000?",
  "What can I safely accept for now, and what must I not accept?",
  "If my front desk lead leaves, what fails first across Matrix layers?",
  "Give me a 7-day frontier plan that accounts for insurance credits and SoD together.",
];

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
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
};

export function PioneerCoach({
  onNavigate,
}: {
  onNavigate?: (tab: string, id?: string) => void;
}) {
  const { profile, addDecision } = usePractice();
  const [question, setQuestion] = useState(PROMPTS[1]);
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

  const usedCascade = result?.toolsUsed?.includes("simulate_variable_cascades");
  const cascadeEvidence = result?.evidence?.filter((e) => e.kind === "cascade") ?? [];

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">LLM differentiator</Badge>
          <Badge variant="primary">Variables are coupled</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <Compass className="size-6 text-primary" />
          Precog Pioneer
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Every brief runs insurance cost-of-risk and <strong className="text-fg">variable cascades</strong>.
          Dual control, cameras, deductible, and residual are not separate knobs — the coach
          says what else moves when you turn one.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ask the frontier</CardTitle>
          <CardDescription>
            Uses your saved practice profile. Cascade tool runs on every brief.
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
            className="w-full rounded-xl border border-border bg-elevated px-3 py-2 text-sm text-fg outline-none ring-primary/40 focus:ring-2"
            placeholder="What if I change dual control / deductible / cameras?"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={run} disabled={loading || !question.trim()}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Running agent + cascades…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Run Pioneer agent
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onNavigate?.("precog")}
            >
              <GitBranch className="size-3.5" />
              Open cascade panel
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
                  {result.toolsUsed?.length ?? 0} tools
                  {usedCascade ? " · cascades on" : ""} · {result.latencyMs ?? "—"}ms ·{" "}
                  {result.source}
                  {result.model ? ` · ${result.model}` : ""}
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
                    {s.toolSummaries && s.toolSummaries.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-[11px] text-subtle">
                        {s.toolSummaries.slice(0, 8).map((t) => (
                          <li key={t}>· {t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {cascadeEvidence.length > 0 && (
            <Card className="border-primary/25">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitBranch className="size-4 text-primary" />
                  Cascade evidence (what else moves)
                </CardTitle>
                <CardDescription>
                  From simulate_variable_cascades — open Precog → Cascades to explore
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {cascadeEvidence.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onNavigate?.(e.link.tab, e.link.id)}
                    className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-left text-sm"
                  >
                    <span className="text-[10px] text-subtle">{e.id}</span>
                    <span className="block font-medium">{e.label}</span>
                    {e.metric && (
                      <span className="block text-xs text-muted">{e.metric}</span>
                    )}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {(result.warnings?.length ?? 0) > 0 && (
            <Card className="border-warn/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-warn">
                  <TriangleAlert className="size-4" />
                  Chicken Little warnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-muted">
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
                <CardTitle className="text-base">All evidence anchors</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {result.evidence!.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onNavigate?.(e.link.tab, e.link.id)}
                    className="rounded-xl border border-border bg-elevated px-3 py-2 text-left text-sm transition-colors hover:border-border-strong"
                  >
                    <span className="text-[10px] text-subtle">
                      {e.id} · {e.kind}
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
                <CardTitle className="text-base">Actionable decisions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.decisions!.map((d) => (
                  <div
                    key={d.action}
                    className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.action}</span>
                      <Badge variant="default">{d.effort}</Badge>
                      <span className="text-xs text-muted">{d.horizonDays}d</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{d.rationale}</p>
                  </div>
                ))}
                <Button size="sm" variant="secondary" onClick={logFirstDecision}>
                  Log top decision to journal
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Scout brief</CardTitle>
                    <Badge
                      variant={result.source.includes("grok") ? "accent" : "primary"}
                    >
                      {result.source.includes("grok")
                        ? `Grok · ${result.model ?? "grok-4.5"}`
                        : "Local agent"}
                    </Badge>
                  </div>
                  <CardDescription className="font-mono text-[11px]">
                    {result.contextFingerprint}
                  </CardDescription>
                </div>
                <Button size="sm" variant="secondary" onClick={copyBrief}>
                  <Copy className="size-3.5" />
                  {copied ? "Copied" : "Copy brief"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <article className="max-w-none space-y-3 text-sm leading-relaxed">
                {result.markdown.split("\n").map((line, i) => {
                  if (line.startsWith("## ")) {
                    const title = line.replace(/^## /, "");
                    const isCascade = /cascade|what else moves/i.test(title);
                    return (
                      <h3
                        key={i}
                        className={
                          isCascade
                            ? "flex items-center gap-2 pt-2 text-base font-semibold tracking-tight text-primary"
                            : "pt-2 text-base font-semibold tracking-tight text-fg"
                        }
                      >
                        {isCascade && <GitBranch className="size-4" />}
                        {title}
                      </h3>
                    );
                  }
                  if (line.startsWith("# ")) {
                    return (
                      <h3 key={i} className="text-lg font-semibold text-fg">
                        {line.replace(/^# /, "")}
                      </h3>
                    );
                  }
                  if (line.trim() === "") return <div key={i} className="h-1" />;
                  const cleaned = line.replace(/^[-*]\s/, "· ");
                  return (
                    <p key={i} className="text-muted">
                      {renderInline(cleaned)}
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
