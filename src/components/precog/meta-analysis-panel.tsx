import { useMemo, useState, type ReactNode } from "react";
import {
  runMetaAnalysis,
  type EpistemicClass,
  type EpistemicItem,
} from "@/lib/precog/llm/meta-analysis";
import { usePractice } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import { johariPanes } from "@/components/precog/johari-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, Eye, EyeOff, HelpCircle, Radar, Search, Sparkles, Zap } from "lucide-react";
import { tabLabel, type NavFn } from "@/lib/precog/navigation";
import { openBusinessSettings } from "@/lib/precog/business-settings-event";

const CLASS_META: Record<
  EpistemicClass,
  { label: string; blurb: string; variant: "ok" | "warn" | "danger" | "primary" | "default" }
> = {
  known_known: {
    label: "Known known",
    blurb: "Precog measures it",
    variant: "ok",
  },
  known_unknown: {
    label: "Known unknown",
    blurb: "Precog knows it cannot see this yet",
    variant: "warn",
  },
  unknown_unknown: {
    label: "Unknown unknown",
    blurb: "Outside what Precog models",
    variant: "danger",
  },
  unknown_known: {
    label: "Unknown known",
    blurb: "Your team knows it; Precog does not",
    variant: "primary",
  },
};

export function MetaAnalysisPanel({ onNavigate }: { onNavigate?: NavFn }) {
  const { profile } = usePractice();
  const [filter, setFilter] = useState<EpistemicClass | "all" | "critical">("all");
  // The report is a pure function of the profile: it changes when the
  // business does, and re-running it on a timer would only repeat itself.
  const report = useMemo(() => runMetaAnalysis(profile), [profile]);
  // Every pane comes from this business's own items, as on the Johari view.
  const panes = useMemo(() => johariPanes(report.items), [report.items]);

  const filtered = report.items.filter((i) => {
    if (filter === "all") return true;
    if (filter === "critical")
      return (
        i.classification !== "known_known" && (i.severity === "critical" || i.severity === "high")
      );
    return i.classification === filter;
  });

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">What Precog can see</Badge>
          <Badge variant="primary">Inventory, not a score</Badge>
        </div>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Radar className="size-5 text-primary" />
          What Precog measures, what it knows it cannot see, and what lies outside its model
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          An inventory of{" "}
          <strong className="text-fg">what is behind every other number here</strong>: items
          measured from your profile, gaps Precog admits (known unknowns), and areas outside what it
          models (unknown unknowns). It is a list to work through, not a score. It re-evaluates as
          your profile, dual release, and decisions change.
        </p>
        <p className="mt-3 text-xs text-subtle">From the current profile · {report.practiceName}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CountChip
          label="Critical and high gaps"
          hint="Need a check or a new input"
          n={report.summary.criticalUnknowns}
          active={filter === "critical"}
          onClick={() => setFilter("critical")}
          tone="danger"
        />
        <CountChip
          label="Known knowns"
          n={report.summary.knownKnowns}
          hint={CLASS_META.known_known.blurb}
          active={filter === "known_known"}
          onClick={() => setFilter("known_known")}
          tone="ok"
        />
        <CountChip
          label="Known unknowns"
          n={report.summary.knownUnknowns}
          hint={CLASS_META.known_unknown.blurb}
          active={filter === "known_unknown"}
          onClick={() => setFilter("known_unknown")}
          tone="warn"
        />
        <CountChip
          label="Unknown unknowns"
          n={report.summary.unknownUnknowns}
          hint={CLASS_META.unknown_unknown.blurb}
          active={filter === "unknown_unknown"}
          onClick={() => setFilter("unknown_unknown")}
          tone="danger"
        />
        <CountChip
          label="Unknown knowns"
          n={report.summary.unknownKnowns}
          hint={CLASS_META.unknown_known.blurb}
          active={filter === "unknown_known"}
          onClick={() => setFilter("unknown_known")}
          tone="primary"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter the list">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "secondary"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All items
        </Button>
        <Button
          size="sm"
          variant={filter === "critical" ? "default" : "secondary"}
          aria-pressed={filter === "critical"}
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
            What the list says
          </CardTitle>
          <CardDescription>Updates as profile, dual release, and decisions change</CardDescription>
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
              What updates by itself
            </CardTitle>
            <CardDescription>
              What recalculates as you edit, and what still needs you to enter it
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
                <p className="mt-0.5 text-xs text-subtle">Depends on: {c.dependency}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="size-4" />
                Johari window
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <JohariCell title="Open" icon={<Eye className="size-3" />} items={panes.open} />
              <JohariCell
                title="Blind (Precog sees, you may not)"
                icon={<Search className="size-3" />}
                items={panes.blind}
              />
              <JohariCell
                title="Hidden (your team knows)"
                icon={<EyeOff className="size-3" />}
                items={panes.hidden}
              />
              <JohariCell
                title="Unknown"
                icon={<HelpCircle className="size-3" />}
                items={panes.unknown}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Everything Precog can and cannot see ({filtered.length})
          </CardTitle>
          <CardDescription>
            Known unknowns are the gaps Precog admits; unknown unknowns are what to look for next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} onNavigate={onNavigate} />
          ))}
          {filtered.length === 0 && <p className="text-sm text-muted">No items in this filter.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function CountChip({
  label,
  hint,
  n,
  active,
  onClick,
  tone,
}: {
  label: string;
  hint?: string;
  n: number;
  active: boolean;
  onClick: () => void;
  tone: "ok" | "warn" | "danger" | "primary";
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
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
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </button>
  );
}

function JohariCell({ title, icon, items }: { title: string; icon: ReactNode; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-2.5">
      <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-subtle uppercase">
        {icon}
        {title}
      </p>
      <ul className="space-y-1 text-xs text-muted">
        {items.slice(0, 4).map((t) => (
          <li key={t} className="truncate" title={t}>
            · {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemCard({ item, onNavigate }: { item: EpistemicItem; onNavigate?: NavFn }) {
  const meta = CLASS_META[item.classification];
  const { say } = usePresentation();
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
            item.severity === "critical" ? "danger" : item.severity === "high" ? "warn" : "default"
          }
        >
          {item.severity}
        </Badge>
        {item.metric && <span className="text-xs text-muted">{item.metric}</span>}
      </div>
      <p className="mt-1.5 font-medium">{item.title}</p>
      <p className="mt-1 text-xs text-muted">{item.description}</p>
      <p className="mt-1 text-xs text-subtle">Affects: {item.affects.join(" · ")}</p>
      {item.probe && (
        <div className="mt-2 rounded-md border border-border bg-panel px-2 py-1.5 text-xs">
          <span className="font-medium text-fg">Check ({item.probe.effort})</span>
          <span className="text-muted"> · {item.probe.kind.replace("_", " ")}</span>
          <p className="mt-0.5 text-fg">{item.probe.action}</p>
          <p className="text-xs text-ok">{item.probe.expectedLift}</p>
        </div>
      )}
      {item.link && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 px-2 text-xs"
          onClick={() => onNavigate?.(item.link!.tab, item.link!.id)}
        >
          Open {tabLabel(item.link.tab, say)}
        </Button>
      )}
      {item.opensBusinessSettings && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 px-2 text-xs"
          onClick={openBusinessSettings}
        >
          Open Business settings
        </Button>
      )}
    </div>
  );
}
