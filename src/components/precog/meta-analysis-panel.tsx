import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  runMetaAnalysis,
  type EpistemicClass,
  type EpistemicItem,
} from "@/lib/precog/llm/meta-analysis";
import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  HelpCircle,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";

const CLASS_META: Record<
  EpistemicClass,
  { label: string; blurb: string; variant: "ok" | "warn" | "danger" | "primary" | "default" }
> = {
  known_known: {
    label: "Known known",
    blurb: "Measured — platform can evaluate with confidence",
    variant: "ok",
  },
  known_unknown: {
    label: "Known unknown",
    blurb: "We know we're missing this — probe to close the gap",
    variant: "warn",
  },
  unknown_unknown: {
    label: "Unknown unknown",
    blurb: "Outside current model ontology — expand what we look for",
    variant: "danger",
  },
  unknown_known: {
    label: "Unknown known",
    blurb: "Tacit knowledge the practice has but hasn't encoded",
    variant: "primary",
  },
};

export function MetaAnalysisPanel({
  onNavigate,
}: {
  onNavigate?: (tab: string, id?: string) => void;
}) {
  const { profile } = usePractice();
  const [filter, setFilter] = useState<EpistemicClass | "all" | "critical">("all");
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(true);

  const report = useMemo(
    () => runMetaAnalysis(profile),
    // re-run on profile change and live tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, tick],
  );

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(id);
  }, [live]);

  const filtered = report.items.filter((i) => {
    if (filter === "all") return true;
    if (filter === "critical")
      return (
        i.classification !== "known_known" &&
        (i.severity === "critical" || i.severity === "high")
      );
    return i.classification === filter;
  });

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Epistemic meta-analysis</Badge>
          <Badge variant="primary">Real-time evaluation quality</Badge>
          <Badge variant={live ? "ok" : "default"}>
            {live ? "Live · 4s pulse" : "Paused"}
          </Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Radar className="size-5 text-primary" />
          How well can Precog evaluate this practice — right now?
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          This tool scores the <strong className="text-fg">quality of knowing</strong>: what is
          measured, gaps we admit (known unknowns), and what the model cannot see yet (unknown
          unknowns). Live pulse re-evaluates as your profile, dual release, and decisions change.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw className="size-3.5" />
            Re-evaluate now
          </Button>
          <Button
            size="sm"
            variant={live ? "default" : "outline"}
            onClick={() => setLive((v) => !v)}
          >
            <Zap className="size-3.5" />
            {live ? "Live on" : "Live off"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-subtle">
          Last run {new Date(report.generatedAt).toLocaleTimeString()} · {report.practiceName}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreCard
          label="Evaluation readiness"
          value={report.evaluationReadiness}
          band={report.readinessBand}
          hint="Can we re-score from current inputs?"
        />
        <ScoreCard
          label="Epistemic confidence"
          value={report.epistemicConfidence}
          band={report.confidenceBand}
          hint="Should we trust the outputs?"
        />
        <ScoreCard
          label="Real-time capability"
          value={report.realtimeScore}
          band={
            report.realtimeScore >= 70
              ? "high"
              : report.realtimeScore >= 50
                ? "solid"
                : report.realtimeScore >= 35
                  ? "partial"
                  : "fragile"
          }
          hint={`${report.realtimeCapabilities.filter((c) => c.ready).length}/${report.realtimeCapabilities.length} streams live`}
        />
        <Card>
          <CardContent className="p-4">
            <Badge variant="danger">Critical / high unknowns</Badge>
            <p className="mt-2 text-2xl font-semibold tabular">
              {report.summary.criticalUnknowns}
            </p>
            <p className="text-xs text-muted">Need probes or ontology expansion</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <CountChip
          label="Known knowns"
          n={report.summary.knownKnowns}
          active={filter === "known_known"}
          onClick={() => setFilter("known_known")}
          tone="ok"
        />
        <CountChip
          label="Known unknowns"
          n={report.summary.knownUnknowns}
          active={filter === "known_unknown"}
          onClick={() => setFilter("known_unknown")}
          tone="warn"
        />
        <CountChip
          label="Unknown unknowns"
          n={report.summary.unknownUnknowns}
          active={filter === "unknown_unknown"}
          onClick={() => setFilter("unknown_unknown")}
          tone="danger"
        />
        <CountChip
          label="Unknown knowns"
          n={report.summary.unknownKnowns}
          active={filter === "unknown_known"}
          onClick={() => setFilter("unknown_known")}
          tone="primary"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "secondary"}
          onClick={() => setFilter("all")}
        >
          All items
        </Button>
        <Button
          size="sm"
          variant={filter === "critical" ? "default" : "secondary"}
          onClick={() => setFilter("critical")}
        >
          <AlertTriangle className="size-3.5" />
          Critical & high only
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Live analysis narrative
          </CardTitle>
          <CardDescription>
            Updates as profile, dual release, and decisions change
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          {report.narrative.map((n) => (
            <p key={n}>· {n}</p>
          ))}
          <div className="mt-3 rounded-lg border border-border bg-panel p-3">
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">
              Recommendations
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {report.recommendations.map((r) => (
                <li key={r} className="text-fg">
                  → {r}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4" />
              Real-time evaluation streams
            </CardTitle>
            <CardDescription>
              What re-computes instantly vs what still needs human import
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.realtimeCapabilities.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  c.ready ? "border-ok/25 bg-ok/5" : "border-border bg-elevated",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={c.ready ? "ok" : "default"}>
                    {c.ready ? "live" : "not live"}
                  </Badge>
                  <Badge variant="default">{c.latencyClass}</Badge>
                  <span className="font-medium">{c.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{c.description}</p>
                <p className="mt-0.5 text-[11px] text-subtle">Depends on: {c.dependency}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Domain coverage</CardTitle>
              <CardDescription>How much of each risk surface is evaluable</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.coverage.map((c) => (
                <div key={c.domain}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-fg">{c.domain}</span>
                    <span className="tabular text-muted">{c.coveredPct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-elevated">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        c.coveredPct >= 65
                          ? "bg-ok"
                          : c.coveredPct >= 40
                            ? "bg-warn"
                            : "bg-danger",
                      )}
                      style={{ width: `${c.coveredPct}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-subtle">{c.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="size-4" />
                Johari window (control system)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <JohariCell
                title="Open"
                icon={<Eye className="size-3" />}
                items={report.johari.open}
              />
              <JohariCell
                title="Blind (platform sees)"
                icon={<Search className="size-3" />}
                items={report.johari.blind}
              />
              <JohariCell
                title="Hidden (practice knows)"
                icon={<EyeOff className="size-3" />}
                items={report.johari.hidden}
              />
              <JohariCell
                title="Unknown"
                icon={<HelpCircle className="size-3" />}
                items={report.johari.unknown}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Epistemic inventory ({filtered.length})
          </CardTitle>
          <CardDescription>
            Known unknowns admit ignorance. Unknown unknowns expand what we should look for next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} onNavigate={onNavigate} />
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted">No items in this filter.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  band,
  hint,
}: {
  label: string;
  value: number;
  band: string;
  hint: string;
}) {
  const tone = value >= 70 ? "ok" : value >= 50 ? "warn" : ("danger" as const);
  return (
    <Card>
      <CardContent className="p-4">
        <Badge variant={tone}>{label}</Badge>
        <p className="mt-2 text-2xl font-semibold tabular">{value}</p>
        <p className="text-xs capitalize text-muted">{band}</p>
        <p className="mt-1 text-[11px] text-subtle">{hint}</p>
      </CardContent>
    </Card>
  );
}

function CountChip({
  label,
  n,
  active,
  onClick,
  tone,
}: {
  label: string;
  n: number;
  active: boolean;
  onClick: () => void;
  tone: "ok" | "warn" | "danger" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/10"
          : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <Badge variant={tone}>{label}</Badge>
      <p className="mt-1 text-xl font-semibold tabular">{n}</p>
    </button>
  );
}

function JohariCell({
  title,
  icon,
  items,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-2.5">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-subtle uppercase">
        {icon}
        {title}
      </p>
      <ul className="space-y-1 text-[11px] text-muted">
        {items.slice(0, 4).map((t) => (
          <li key={t} className="truncate" title={t}>
            · {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemCard({
  item,
  onNavigate,
}: {
  item: EpistemicItem;
  onNavigate?: (tab: string, id?: string) => void;
}) {
  const meta = CLASS_META[item.classification];
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 text-sm",
        item.classification === "unknown_unknown" && "border-danger/30 bg-danger/5",
        item.classification === "known_unknown" && "border-warn/30 bg-warn/5",
        item.classification === "known_known" && "border-ok/25 bg-ok/5",
        item.classification === "unknown_known" && "border-primary/25 bg-primary/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        <Badge
          variant={
            item.severity === "critical"
              ? "danger"
              : item.severity === "high"
                ? "warn"
                : "default"
          }
        >
          {item.severity}
        </Badge>
        {item.confidenceDrag > 0 && (
          <span className="text-[11px] tabular text-subtle">
            −{Math.round(item.confidenceDrag * 100)} conf
          </span>
        )}
        {item.metric && <span className="text-[11px] text-muted">{item.metric}</span>}
      </div>
      <p className="mt-1.5 font-medium">{item.title}</p>
      <p className="mt-1 text-xs text-muted">{item.description}</p>
      <p className="mt-1 text-[11px] text-subtle">Affects: {item.affects.join(" · ")}</p>
      {item.probe && (
        <div className="mt-2 rounded-md border border-border bg-panel px-2 py-1.5 text-xs">
          <span className="font-medium text-fg">Probe ({item.probe.effort})</span>
          <span className="text-muted"> · {item.probe.kind.replace("_", " ")}</span>
          <p className="mt-0.5 text-fg">{item.probe.action}</p>
          <p className="text-[11px] text-ok">{item.probe.expectedLift}</p>
        </div>
      )}
      {item.link && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 px-2 text-[11px]"
          onClick={() => onNavigate?.(item.link!.tab, item.link!.id)}
        >
          Open {item.link.tab}
        </Button>
      )}
    </div>
  );
}
