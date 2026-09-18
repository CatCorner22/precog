import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  Brain,
  Compass,
  Crosshair,
  Eye,
  Gauge,
  Grid3x3,
  Layers,
  Map,
  Network,
  Shield,
  Sparkles,
} from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { controls } from "@/lib/precog/demo-data";
import { findKnowledgeRisks, rankDangerousScenarios } from "@/lib/precog/engine";
import { assessCoso, type DeepLinkTarget } from "@/lib/precog/coso";
import { portfolioSummary } from "@/lib/precog/scoring/residual-engine";
import { scoreLeadingIndicators } from "@/lib/precog/ml/leading-indicators";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { mitigatedSodRuleIds } from "@/lib/precog/controls/dual-release";
import { usePractice } from "@/lib/precog/practice-context";
import type { MatrixLayerId } from "@/lib/precog/types";
import { CosoHeatmap } from "@/components/precog/coso-heatmap";
import { DecisionJournal } from "@/components/precog/decision-journal";
import { IntelligencePanel } from "@/components/precog/intelligence-panel";
import { KnowledgeMap } from "@/components/precog/knowledge-map";
import { LayerDetail, LayersPanel } from "@/components/precog/layers-panel";
import { PioneerCoach } from "@/components/precog/pioneer-coach";
import { PracticeSetup } from "@/components/precog/practice-setup";
import { ProcessMap } from "@/components/precog/process-map";
import { ResidualRadar } from "@/components/precog/residual-radar";
import { ScenarioRunner } from "@/components/precog/scenario-runner";
import { SodPanel } from "@/components/precog/sod-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd, cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

type TabId =
  | "command"
  | "map"
  | "pioneer"
  | "intel"
  | "residual"
  | "coso"
  | "layers"
  | "knowledge"
  | "precog"
  | "sod"
  | "journal";

const TABS: { id: TabId; label: string; icon: typeof Eye }[] = [
  { id: "command", label: "Command", icon: Activity },
  { id: "map", label: "Map", icon: Map },
  { id: "pioneer", label: "Pioneer", icon: Compass },
  { id: "intel", label: "Intel", icon: Brain },
  { id: "residual", label: "Residual", icon: Gauge },
  { id: "coso", label: "COSO", icon: Grid3x3 },
  { id: "layers", label: "Layers", icon: Layers },
  { id: "knowledge", label: "Knowledge", icon: Network },
  { id: "precog", label: "Precog", icon: Sparkles },
  { id: "sod", label: "SoD", icon: Shield },
  { id: "journal", label: "Journal", icon: BookOpen },
];

function Home() {
  const [tab, setTab] = useState<TabId>("command");
  const [layer, setLayer] = useState<MatrixLayerId>("control");
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [knowledgeId, setKnowledgeId] = useState<string | null>(null);
  const [processId, setProcessId] = useState<string | null>(null);
  const { user, isPending } = useCurrentUserState();
  const { profile } = usePractice();

  const risks = useMemo(() => findKnowledgeRisks(), []);
  const ranked = useMemo(
    () =>
      rankDangerousScenarios({
        staff: profile.staff,
        riskVariables: profile.riskVariables,
      }),
    [profile.staff, profile.riskVariables],
  );
  const coso = useMemo(() => assessCoso(), []);
  const portfolio = useMemo(
    () => portfolioSummary(profile.staff),
    [profile.staff],
  );
  const leading = useMemo(
    () => scoreLeadingIndicators(profile.staff, profile.riskVariables),
    [profile.staff, profile.riskVariables],
  );
  const sodReport = useMemo(
    () =>
      detectSodConflicts(profile.staff, {
        dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(profile.dualRelease),
      }),
    [profile.staff, profile.dualRelease],
  );
  const spofCount = risks.filter((r) => r.soleOwner && r.riskScore >= 65).length;
  const sodGaps = controls.filter((c) => !c.segregated).length;
  const top = ranked[0];
  const overdueDecisions = profile.decisions.filter(
    (d) => d.reviewBy && new Date(d.reviewBy).getTime() < Date.now(),
  ).length;

  function navigateDeepLink(target: DeepLinkTarget) {
    if (target.type === "tab") {
      setTab(target.tab as TabId);
      return;
    }
    if (target.type === "sod") {
      setTab("sod");
      return;
    }
    if (target.type === "knowledge") {
      setKnowledgeId(target.knowledgeId ?? null);
      setTab("knowledge");
      return;
    }
    if (target.type === "precog") {
      setScenarioId(target.scenarioId ?? null);
      setTab("precog");
      return;
    }
    if (target.type === "layers") {
      if (target.layer) setLayer(target.layer as MatrixLayerId);
      setTab("layers");
    }
  }

  function navigateTab(tabName: string, id?: string) {
    if (tabName === "knowledge") {
      setKnowledgeId(id ?? null);
      setTab("knowledge");
      return;
    }
    if (tabName === "precog") {
      setScenarioId(id ?? null);
      setTab("precog");
      return;
    }
    if (tabName === "map") {
      setProcessId(id ?? null);
      setTab("map");
      return;
    }
    if (tabName === "intel") {
      setTab("intel");
      return;
    }
    if (
      ["residual", "coso", "sod", "journal", "command", "pioneer", "layers"].includes(
        tabName,
      )
    ) {
      setTab(tabName as TabId);
    }
  }

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
                <p className="truncate text-sm font-semibold tracking-tight">
                  Precog Pioneer
                </p>
                <p className="truncate text-xs text-muted">{profile.practiceName}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {overdueDecisions > 0 && (
              <button
                type="button"
                onClick={() => setTab("journal")}
                className="hidden rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn sm:inline"
              >
                {overdueDecisions} review overdue
              </button>
            )}
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
                {t.id === "sod" && sodReport.summary.critical > 0 && (
                  <span className="rounded-full bg-danger/20 px-1.5 text-[10px] text-danger">
                    {sodReport.summary.critical}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === "command" && (
          <div className="space-y-6">
            <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
              <Badge variant="accent">SoD detection · process map · Pioneer</Badge>
              <h1 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                See every process, risk, and SoD conflict before it bites
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                Automated segregation-of-duties scanning finds who holds incompatible powers
                (cash + recon, vendor + pay, write-off approve + post). Pair with the process map
                and Precog scenarios for full residual picture.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => setTab("sod")}>
                  SoD conflicts ({sodReport.conflicts.length})
                </Button>
                <Button variant="secondary" onClick={() => setTab("map")}>
                  Process map
                </Button>
                <Button variant="outline" onClick={() => setTab("pioneer")}>
                  Run Pioneer
                </Button>
                <Link
                  to="/threat"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-elevated"
                >
                  <Crosshair className="size-4" />
                  Threat Assessment
                </Link>
              </div>
            </section>

            {/* SOF Threat Assessment entry */}
            <Link
              to="/threat"
              className="block rounded-2xl border border-danger/30 bg-danger/5 p-5 transition-colors hover:border-danger/50 hover:bg-danger/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge variant="danger">OPS · THREAT ASSESSMENT</Badge>
                  <p className="mt-2 text-lg font-semibold tracking-tight">
                    Military-style residual threat HUD
                  </p>
                  <p className="mt-1 max-w-xl text-sm text-muted">
                    Special-operations aesthetic for priority control gaps, SoD conflicts,
                    knowledge SPOFs, and Precog scenarios. Rules of engagement = dual-release,
                    bank rec, and owner review — educational only.
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  <Crosshair className="size-4" />
                  Open /threat
                </span>
              </div>
            </Link>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label="Avg residual"
                value={String(portfolio.averageResidual)}
                hint={`${portfolio.criticalPath} critical`}
                tone={portfolio.averageResidual >= 60 ? "danger" : "warn"}
                onClick={() => setTab("residual")}
              />
              <MetricCard
                label="SoD health"
                value={String(sodReport.summary.segregationHealth)}
                hint={`${sodReport.summary.critical} critical conflicts`}
                tone={
                  sodReport.summary.segregationHealth < 40
                    ? "danger"
                    : sodReport.summary.segregationHealth < 65
                      ? "warn"
                      : "primary"
                }
                onClick={() => setTab("sod")}
              />
              <MetricCard
                label="COSO"
                value={String(coso.overall)}
                hint={coso.overallStatus}
                tone="primary"
                onClick={() => setTab("coso")}
              />
              <MetricCard
                label="Critical SPOFs"
                value={String(spofCount)}
                hint="Sole-owner knowledge"
                tone="danger"
                onClick={() => navigateDeepLink({ type: "knowledge" })}
              />
              <MetricCard
                label="Top retained"
                value={
                  top
                    ? formatUsd(
                        top.result.retainedImpact?.expected ??
                          top.result.financialImpact.expected,
                      )
                    : "—"
                }
                hint={top ? `p50 ${top.result.timelineDays.p50}d` : ""}
                tone="warn"
                onClick={() =>
                  navigateDeepLink({
                    type: "precog",
                    scenarioId: top?.scenario.id,
                  })
                }
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PracticeSetup onOpenDualRelease={() => setTab("sod")} />
              <Card>
                <CardHeader>
                  <CardTitle>Top residual risks</CardTitle>
                  <CardDescription>
                    Profile-driven · {sodGaps} static gaps · {sodReport.conflicts.length}{" "}
                    detected conflicts · pressure {leading.band}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {portfolio.top.slice(0, 5).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab("residual")}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5 text-left hover:border-border-strong"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {item.name}
                        </span>
                        <span className="text-xs text-muted">{item.bandLabel}</span>
                      </span>
                      <span className="text-lg font-semibold tabular">{item.residual}</span>
                    </button>
                  ))}
                  <Button className="w-full" variant="secondary" onClick={() => setTab("sod")}>
                    Open SoD detector
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {tab === "map" && (
          <ProcessMap
            initialProcessId={processId}
            onNavigate={(t, id) => navigateTab(t, id)}
          />
        )}

        {tab === "pioneer" && (
          <PioneerCoach
            onNavigate={(t, id) => {
              if (t === "journal") setTab("journal");
              else navigateTab(t, id);
            }}
          />
        )}

        {tab === "intel" && (
          <IntelligencePanel onNavigate={(t) => navigateTab(t)} />
        )}

        {tab === "residual" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Residual risk radar</h2>
              <p className="text-sm text-muted">Transparent scoring from practice profile.</p>
            </div>
            <ResidualRadar onNavigate={navigateDeepLink} />
          </div>
        )}

        {tab === "coso" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">COSO control system</h2>
              <p className="text-sm text-muted">Component health with deep links.</p>
            </div>
            <CosoHeatmap onNavigate={navigateDeepLink} />
          </div>
        )}

        {tab === "layers" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Matrix process layers</h2>
              <p className="text-sm text-muted">Peel layers independently.</p>
            </div>
            <LayersPanel
              active={layer}
              onSelect={(id) => {
                setLayer(id);
                if (id === "knowledge") setTab("knowledge");
                if (id === "control") setTab("sod");
                if (id === "process") setTab("map");
              }}
            />
            <LayerDetail layer={layer} />
          </div>
        )}

        {tab === "knowledge" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Knowledge continuity map</h2>
              <p className="text-sm text-muted">Critical knowledge SPOFs.</p>
            </div>
            <KnowledgeMap initialKnowledgeId={knowledgeId} />
          </div>
        )}

        {tab === "precog" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Precog scenario engine</h2>
              <p className="text-sm text-muted">
                Timelines, insurance CoR, multi-scenario compare, cascades.
              </p>
            </div>
            <ScenarioRunner initialScenarioId={scenarioId} />
          </div>
        )}

        {tab === "sod" && (
          <SodPanel onNavigate={(t, id) => navigateTab(t, id)} />
        )}

        {tab === "journal" && (
          <DecisionJournal onOpenLinked={(t, id) => navigateTab(t, id)} />
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
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "danger" | "warn" | "primary";
  onClick?: () => void;
}) {
  const badge = tone === "danger" ? "danger" : tone === "warn" ? "warn" : "primary";
  return (
    <Card
      className={
        onClick ? "cursor-pointer transition-colors hover:border-border-strong" : undefined
      }
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4">
        <Badge variant={badge}>{label}</Badge>
        <p className="mt-3 text-2xl font-semibold tabular tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}
