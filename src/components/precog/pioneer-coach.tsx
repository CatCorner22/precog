import { useState, type ReactNode } from "react";
import { runPioneerCoach } from "@/lib/precog/coach/pioneer-server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Compass, Loader2, Sparkles } from "lucide-react";

const PROMPTS = [
  "Where is residual risk worst this week, and what should I do first?",
  "What can I safely accept for now, and what must I not accept?",
  "If my front desk lead leaves, what fails first across Matrix layers?",
  "Give me a 7-day frontier plan using COSO control activities and monitoring.",
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

export function PioneerCoach() {
  const [question, setQuestion] = useState(PROMPTS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    source: string;
    model?: string;
    markdown: string;
    contextFingerprint: string;
  } | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await runPioneerCoach({ data: { question } });
      if (!res.ok) {
        setError(res.error);
        setResult(null);
      } else {
        setResult({
          source: res.source,
          model: res.model,
          markdown: res.markdown,
          contextFingerprint: res.contextFingerprint,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coach failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Pioneer LLM stack</Badge>
          <Badge variant="primary">Context-packed · residual-aware</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <Compass className="size-6 text-primary" />
          Precog Pioneer
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          A frontier decision coach. It packs COSO scores, residual risk drivers, SPOFs, Precog
          scenarios, crime priors, and tornado levers — then briefs you like a scout on the ridge:
          what to fix, what to compensate, what residual to accept on purpose.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ask the frontier</CardTitle>
          <CardDescription>
            User-initiated only (no auto-spend). Uses Grok when available; otherwise the local
            pioneer engine still runs on the full scoring stack.
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
            placeholder="What should I tackle this week?"
          />
          <Button onClick={run} disabled={loading || !question.trim()}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scouting…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Run Pioneer brief
              </>
            )}
          </Button>
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Scout brief</CardTitle>
              <Badge variant={result.source === "grok" ? "accent" : "primary"}>
                {result.source === "grok"
                  ? `Grok · ${result.model ?? "grok-4.5"}`
                  : "Local pioneer engine"}
              </Badge>
            </div>
            <CardDescription className="font-mono text-[11px]">
              context {result.contextFingerprint}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <article className="max-w-none space-y-3 text-sm leading-relaxed">
              {result.markdown.split("\n").map((line, i) => {
                if (line.startsWith("## ")) {
                  return (
                    <h3 key={i} className="pt-2 text-base font-semibold tracking-tight text-fg">
                      {line.replace(/^## /, "")}
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
      )}
    </div>
  );
}
