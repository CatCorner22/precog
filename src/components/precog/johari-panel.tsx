import { useMemo, useState } from "react";
import {
  JOHARI_PLAYBOOK,
  johariQuadrantFromEpistemic,
  recommendJohariMoves,
  type JohariDomain,
  type JohariQuadrant,
} from "@/lib/precog/llm/johari-applications";
import { runMetaAnalysis } from "@/lib/precog/llm/meta-analysis";
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Grid2x2,
  HelpCircle,
  Lightbulb,
  Search,
} from "lucide-react";

type NavFn = (tab: string, id?: string) => void;

const Q_META: Record<
  JohariQuadrant,
  { label: string; icon: typeof Eye; variant: "ok" | "warn" | "primary" | "danger" }
> = {
  open: { label: "Open", icon: Eye, variant: "ok" },
  blind: { label: "Blind", icon: Search, variant: "warn" },
  hidden: { label: "Hidden", icon: EyeOff, variant: "primary" },
  unknown: { label: "Unknown", icon: HelpCircle, variant: "danger" },
};

export function JohariPanel({ onNavigate }: { onNavigate?: NavFn }) {
  const { profile } = usePractice();
  const [activeQ, setActiveQ] = useState<JohariQuadrant>("blind");
  const [domain, setDomain] = useState<JohariDomain>("internal_control");
  const [view, setView] = useState<"matrix" | "domains" | "loop">("matrix");

  const meta = useMemo(() => runMetaAnalysis(profile), [profile]);

  const loads = useMemo(() => {
    const counts: Record<JohariQuadrant, number> = {
      open: 0,
      blind: 0,
      hidden: 0,
      unknown: 0,
    };
    for (const item of meta.items) {
      counts[johariQuadrantFromEpistemic(item.classification)] += 1;
    }
    return counts;
  }, [meta.items]);

  const liveItems = useMemo(() => {
    return meta.items
      .filter((i) => johariQuadrantFromEpistemic(i.classification) === activeQ)
      .slice(0, 8);
  }, [meta.items, activeQ]);

  const moves = useMemo(() => recommendJohariMoves(loads), [loads]);
  const guide = JOHARI_PLAYBOOK.quadrants.find((q) => q.id === activeQ)!;
  const domainApp = JOHARI_PLAYBOOK.domains.find((d) => d.domain === domain)!;

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Johari window</Badge>
          <Badge variant="primary">Control-system applications</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Grid2x2 className="size-5 text-primary" />
          See what you see — and what you don’t
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {JOHARI_PLAYBOOK.coreInsight}
        </p>
        <p className="mt-2 text-xs text-subtle">{JOHARI_PLAYBOOK.modelOrigin}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-elevated px-3 py-2 text-xs">
            <span className="text-subtle">Self axis → </span>
            <span className="text-fg">{JOHARI_PLAYBOOK.axesRemap.self}</span>
          </div>
          <div className="rounded-lg border border-border bg-elevated px-3 py-2 text-xs">
            <span className="text-subtle">Others axis → </span>
            <span className="text-fg">{JOHARI_PLAYBOOK.axesRemap.others}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={view === "matrix" ? "default" : "secondary"}
            onClick={() => setView("matrix")}
          >
            Live matrix
          </Button>
          <Button
            size="sm"
            variant={view === "domains" ? "default" : "secondary"}
            onClick={() => setView("domains")}
          >
            Domain applications
          </Button>
          <Button
            size="sm"
            variant={view === "loop" ? "default" : "secondary"}
            onClick={() => setView("loop")}
          >
            Coaching loop
          </Button>
        </div>
      </section>

      {/* 2×2 visual */}
      <div className="grid gap-2 sm:grid-cols-2">
        {(["open", "blind", "hidden", "unknown"] as JohariQuadrant[]).map((q) => {
          const m = Q_META[q];
          const Icon = m.icon;
          const g = JOHARI_PLAYBOOK.quadrants.find((x) => x.id === q)!;
          return (
            <button
              key={q}
              type="button"
              onClick={() => {
                setActiveQ(q);
                setView("matrix");
              }}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                activeQ === q
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                  : "border-border bg-surface hover:border-border-strong",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant={m.variant}>
                  <Icon className="size-3" />
                  {m.label}
                </Badge>
                <span className="text-lg font-semibold tabular">{loads[q]}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{g.classicName}</p>
              <p className="mt-1 text-xs text-muted line-clamp-2">{g.precogMeaning}</p>
              <p className="mt-2 text-[10px] text-subtle">
                Self: {g.axes.self ? "known" : "unknown"} · Others:{" "}
                {g.axes.others ? "known" : "unknown"}
              </p>
            </button>
          );
        })}
      </div>

      {view === "matrix" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{guide.classicName}</CardTitle>
              <CardDescription>{guide.classicMeaning}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted">
                <span className="font-medium text-fg">In Precog: </span>
                {guide.precogMeaning}
              </p>
              <p className="text-xs">
                <span className="text-subtle">Goal · </span>
                {guide.goal}
              </p>
              <p className="text-xs text-warn">
                <span className="font-medium">If this pane is large: </span>
                {guide.riskIfLarge}
              </p>
              <div>
                <p className="text-xs font-medium tracking-wide text-subtle uppercase">
                  Dental examples
                </p>
                <ul className="mt-1 space-y-1 text-xs text-muted">
                  {guide.dentalExamples.map((e) => (
                    <li key={e}>· {e}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-subtle uppercase">
                  Moves ({guide.moves.length})
                </p>
                <ul className="space-y-2">
                  {guide.moves.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-elevated px-2.5 py-2 text-xs"
                    >
                      <span>
                        <Badge variant="default">{m.mechanism}</Badge>{" "}
                        <span className="text-fg">{m.action}</span>
                        <span className="mt-0.5 block text-subtle">{m.effort}</span>
                      </span>
                      {m.precogTab && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px]"
                          onClick={() => onNavigate?.(m.precogTab!)}
                        >
                          Open {m.precogTab}
                          <ArrowRight className="size-3" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Live items in {Q_META[activeQ].label} ({liveItems.length})
              </CardTitle>
              <CardDescription>
                Mapped from meta-analysis epistemic inventory
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {liveItems.length === 0 && (
                <p className="text-sm text-muted">No items currently mapped here.</p>
              )}
              {liveItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-elevated px-2.5 py-2 text-sm"
                >
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="default">{item.severity}</Badge>
                    <span className="font-medium">{item.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted line-clamp-2">
                    {item.description}
                  </p>
                  {item.probe && (
                    <p className="mt-1 text-[11px] text-ok">
                      Probe: {item.probe.action}
                    </p>
                  )}
                  {item.link && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 px-2 text-[11px]"
                      onClick={() => onNavigate?.(item.link!.tab, item.link!.id)}
                    >
                      Open {item.link.tab}
                    </Button>
                  )}
                </div>
              ))}

              <div className="rounded-lg border border-border bg-panel p-3">
                <p className="flex items-center gap-1 text-xs font-medium text-subtle uppercase">
                  <Lightbulb className="size-3" />
                  Recommended moves (load-weighted)
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {moves.map((m) => (
                    <li key={m.id}>
                      · [{m.from}→{m.to}] {m.action}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {view === "domains" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {JOHARI_PLAYBOOK.domains.map((d) => (
              <button
                key={d.domain}
                type="button"
                onClick={() => setDomain(d.domain)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  domain === d.domain
                    ? "border-primary/40 bg-primary/10 text-fg"
                    : "border-border bg-elevated text-muted",
                )}
              >
                {d.title}
              </button>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{domainApp.title}</CardTitle>
              <CardDescription>{domainApp.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                <p>
                  <span className="text-subtle">Self · </span>
                  {domainApp.selfLabel}
                </p>
                <p>
                  <span className="text-subtle">Others · </span>
                  {domainApp.othersLabel}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <QuadExample title="Open" text={domainApp.openExample} tone="ok" />
                <QuadExample title="Blind" text={domainApp.blindExample} tone="warn" />
                <QuadExample title="Hidden" text={domainApp.hiddenExample} tone="primary" />
                <QuadExample title="Unknown" text={domainApp.unknownExample} tone="danger" />
              </div>
              <p className="rounded-lg border border-border bg-elevated px-3 py-2 text-xs">
                <span className="font-medium text-fg">Primary move · </span>
                {domainApp.primaryMove}
              </p>
              <p className="text-xs text-muted">
                <span className="font-medium text-fg">Why it matters for dental · </span>
                {domainApp.valueForDental}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {view === "loop" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Control coaching loop</CardTitle>
              <CardDescription>How Precog uses Johari every cycle</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-muted">
                {JOHARI_PLAYBOOK.controlCoachingLoop.map((step) => (
                  <li key={step} className="rounded-lg border border-border bg-elevated px-3 py-2">
                    {step}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Strategic goals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted">
                {JOHARI_PLAYBOOK.strategicGoals.map((g) => (
                  <p key={g}>· {g}</p>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {JOHARI_PLAYBOOK.metrics.map((m) => (
                  <div
                    key={m.name}
                    className="rounded-lg border border-border bg-elevated px-2.5 py-2 text-xs"
                  >
                    <p className="font-medium text-fg">{m.name}</p>
                    <p className="text-muted">{m.how}</p>
                    <p className="text-ok">Target: {m.target}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-danger">Anti-patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted">
                {JOHARI_PLAYBOOK.antiPatterns.map((a) => (
                  <p key={a}>· {a}</p>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function QuadExample({
  title,
  text,
  tone,
}: {
  title: string;
  text: string;
  tone: "ok" | "warn" | "primary" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-elevated px-2.5 py-2 text-xs">
      <Badge variant={tone}>{title}</Badge>
      <p className="mt-1 text-muted">{text}</p>
    </div>
  );
}
