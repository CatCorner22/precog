import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Eye,
  Layers,
  Network,
  Shield,
  Sparkles,
} from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PRACTICE_NAME, controls } from "@/lib/precog/demo-data";
import { findKnowledgeRisks, rankDangerousScenarios } from "@/lib/precog/engine";
import type { MatrixLayerId } from "@/lib/precog/types";
import { KnowledgeMap } from "@/components/precog/knowledge-map";
import { LayerDetail, LayersPanel } from "@/components/precog/layers-panel";
import { ScenarioRunner } from "@/components/precog/scenario-runner";
import { SodPanel } from "@/components/precog/sod-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd, cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

type TabId = "command" | "layers" | "knowledge" | "precog" | "sod";

const TABS: { id: TabId; label: string; icon: typeof Eye }[] = [
  { id: "command", label: "Command", icon: Activity },
  { id: "layers", label: "Layers", icon: Layers },
  { id: "knowledge", label: "Knowledge", icon: Network },
  { id: "precog", label: "Precog", icon: Sparkles },
  { id: "sod", label: "SoD", icon: Shield },
];

function Home() {
  const [tab, setTab] = useState<TabId>("command");
  const [layer, setLayer] = useState<MatrixLayerId>("control");
  const { user, isPending } = useCurrentUserState();

  const risks = useMemo(() => findKnowledgeRisks(), []);
  const ranked = useMemo(() => rankDangerousScenarios(), []);
  const spofCount = risks.filter((r) => r.soleOwner && r.riskScore >= 65).length;
  const sodGaps = controls.filter((c) => !c.segregated).length;
  const top = ranked[0];

  return (
    <div className="min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-bg">
      <header className="sticky top-[var(--grok-banner-h,0px)] z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <Eye className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">Precog</p>
                <p className="truncate text-xs text-muted">{PRACTICE_NAME}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPending ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
            ) : (
              <>
                <SignedOut>
                  <Link
                    to="/login"
                    className="inline-flex h-8 items-center rounded-md border border-border bg-elevated px-3 text-xs font-medium hover:border-border-strong"
                  >
                    Sign in
                  </Link>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border border-border bg-elevated text-fg"
                    : "text-muted hover:bg-elevated/60 hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === "command" && (
          <div className="space-y-6">
            <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
              <Badge variant="accent">Demo practice loaded</Badge>
              <h1 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                See the practice as layered reality — then scrub probable futures.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                Precog peels Surface, Process, Knowledge, Control, Source, and Continuity layers.
                Run statistically grounded what-ifs with 95% confidence timelines, financial impact,
                staff composition, and fraud base rates — so owners can address risk or accept residual risk deliberately.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => setTab("precog")}>Run Precog scenario</Button>
                <Button variant="secondary" onClick={() => setTab("knowledge")}>
                  Open knowledge map
                </Button>
              </div>
              {!user && !isPending && (
                <p className="mt-4 text-xs text-subtle">
                  Guest demo mode — sign in to attach this map to your account later.
                </p>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Critical SPOFs"
                value={String(spofCount)}
                hint="Sole-owner critical knowledge"
                tone="danger"
              />
              <MetricCard
                label="Top scenario impact"
                value={top ? formatUsd(top.result.financialImpact.expected) : "—"}
                hint={top ? `p50 ${top.result.timelineDays.p50} days` : ""}
                tone="warn"
              />
              <MetricCard
                label="SoD gaps"
                value={String(sodGaps)}
                hint="Unsegregated high-risk duties"
                tone="primary"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Most dangerous unmitigated futures</CardTitle>
                <CardDescription>
                  Ranked by expected impact and time-to-materialization under current staff composition
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ranked.slice(0, 3).map((row, i) => (
                  <button
                    key={row.scenario.id}
                    type="button"
                    onClick={() => setTab("precog")}
                    className="flex w-full flex-col gap-1 rounded-xl border border-border bg-elevated px-4 py-3 text-left transition-colors hover:border-border-strong sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="text-xs text-subtle">#{i + 1}</span>
                      <p className="font-medium">{row.scenario.title}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="warn">
                        {row.result.timelineDays.p95Low}–{row.result.timelineDays.p95High}d (95%)
                      </Badge>
                      <Badge variant="danger">
                        {formatUsd(row.result.financialImpact.expected)} expected
                      </Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "layers" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Matrix process layers</h2>
              <p className="text-sm text-muted">
                Peel layers independently. Cross-layer links stay visible when you drill in.
              </p>
            </div>
            <LayersPanel
              active={layer}
              onSelect={(id) => {
                setLayer(id);
                if (id === "knowledge") setTab("knowledge");
              }}
            />
            <LayerDetail layer={layer} />
          </div>
        )}

        {tab === "knowledge" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Knowledge continuity map</h2>
              <p className="text-sm text-muted">
                Trace who holds critical knowledge and detect single points of failure.
              </p>
            </div>
            <KnowledgeMap />
          </div>
        )}

        {tab === "precog" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Precog scenario engine</h2>
              <p className="text-sm text-muted">
                Think-ahead scenarios: timelines, 95% CI, financial impact, staff + fraud stats.
              </p>
            </div>
            <ScenarioRunner />
          </div>
        )}

        {tab === "sod" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Segregation of duties</h2>
              <p className="text-sm text-muted">
                COSO-aligned conflicts, compensating controls, residual risk language for small teams.
              </p>
            </div>
            <SodPanel />
          </div>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "danger" | "warn" | "primary";
}) {
  const badge = tone === "danger" ? "danger" : tone === "warn" ? "warn" : "primary";
  return (
    <Card>
      <CardContent className="p-4">
        <Badge variant={badge}>{label}</Badge>
        <p className="mt-3 text-2xl font-semibold tabular tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}
