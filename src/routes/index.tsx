import { HEALTH_SCALE, RISK_SCALE } from "@/lib/precog/scoring/bands";
import { IndexBasis } from "@/components/precog/index-basis";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTemplate } from "@/lib/precog/use-template";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  BookOpen,
  Brain,
  Compass,
  Crosshair,
  Eye,
  FileText,
  Gauge,
  Grid3x3,
  Hammer,
  LibraryBig,
  Layers,
  Map,
  MessageSquare,
  Network,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { AccountMenu } from "@/components/precog/account-menu";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { rankDangerousScenarios } from "@/lib/precog/engine";
import { criticalSinglePoints } from "@/lib/precog/continuity/coverage";
import { registerAssessed } from "@/lib/precog/continuity/register-state";
import { OWN_TEAM_MAX } from "@/lib/precog/onboarding/own-team";
import { pluralTeamLabel } from "@/lib/precog/templates/industry-copy";
import { assessCoso, type DeepLinkTarget } from "@/lib/precog/coso";
import { portfolioSummary } from "@/lib/precog/scoring/residual-engine";
import { scoreLeadingIndicators } from "@/lib/precog/ml/leading-indicators";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { continuitySlips, decisionsDue } from "@/lib/precog/decisions/follow-through";
import { useToday } from "@/lib/precog/decisions/use-today";
import { usePractice } from "@/lib/precog/practice-context";
import { mapAssessed } from "@/lib/precog/builder/map-state";
import { usePresentation } from "@/lib/precog/presentation";
import type { MatrixLayerId } from "@/lib/precog/types";
import { StartHere } from "@/components/precog/start-here";
import { PresentationToggle } from "@/components/precog/presentation-toggle";
import { IndustryOnboarding } from "@/components/precog/industry-onboarding";
import { PracticeSetup } from "@/components/precog/practice-setup";
import { SyncStatusBadge } from "@/components/precog/sync-status-badge";
import { SaveConflictBanner } from "@/components/precog/save-conflict-banner";
import { MapHealthCard } from "@/components/precog/map-health-card";
import { ControlCalendarCard } from "@/components/precog/control-calendar";
import { BusinessSwitcher } from "@/components/precog/business-switcher";
import { WeeklyActionPlan } from "@/components/precog/weekly-action-plan";
import { TabErrorBoundary } from "@/components/precog/tab-error-boundary";
import {
  computeMapHealth,
  buildProcessMapGraph,
  validateProcessMap,
} from "@/lib/precog/process-graph";
import { industryMeta } from "@/lib/precog/industry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd, cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";

export const Route = createFileRoute("/")({
  component: HomeGate,
  // The open tab lives in the URL (?tab=map) so refresh, back/forward, and
  // shared links land on the same view instead of always resetting to Start.
  validateSearch: (search: Record<string, unknown>): { tab?: TabId } => ({
    tab: isTabId(search.tab) && search.tab !== "start" ? search.tab : undefined,
  }),
});

const ProcessMap = lazy(() =>
  import("@/components/precog/process-map").then((module) => ({ default: module.ProcessMap })),
);
const PioneerCoach = lazy(() =>
  import("@/components/precog/pioneer-coach").then((module) => ({ default: module.PioneerCoach })),
);
const ResidualRadar = lazy(() =>
  import("@/components/precog/residual-radar").then((module) => ({
    default: module.ResidualRadar,
  })),
);
const ScenarioRunner = lazy(() =>
  import("@/components/precog/scenario-runner").then((module) => ({
    default: module.ScenarioRunner,
  })),
);
const SodPanel = lazy(() =>
  import("@/components/precog/sod-panel").then((module) => ({ default: module.SodPanel })),
);
const IntelligencePanel = lazy(() =>
  import("@/components/precog/intelligence-panel").then((module) => ({
    default: module.IntelligencePanel,
  })),
);
const KnowledgeMap = lazy(() =>
  import("@/components/precog/knowledge-map").then((module) => ({ default: module.KnowledgeMap })),
);
const ContinuityPlanner = lazy(() =>
  import("@/components/precog/continuity-planner").then((module) => ({
    default: module.ContinuityPlanner,
  })),
);
const LayersPanel = lazy(() =>
  import("@/components/precog/layers-panel").then((module) => ({ default: module.LayersPanel })),
);
const LayerDetail = lazy(() =>
  import("@/components/precog/layers-panel").then((module) => ({ default: module.LayerDetail })),
);
const CosoHeatmap = lazy(() =>
  import("@/components/precog/coso-heatmap").then((module) => ({ default: module.CosoHeatmap })),
);
const DecisionJournal = lazy(() =>
  import("@/components/precog/decision-journal").then((module) => ({
    default: module.DecisionJournal,
  })),
);
const AssessmentSnapshots = lazy(() =>
  import("@/components/precog/assessment-snapshots").then((module) => ({
    default: module.AssessmentSnapshots,
  })),
);
const OperatingBlueprint = lazy(() =>
  import("@/components/precog/operating-blueprint").then((module) => ({
    default: module.OperatingBlueprint,
  })),
);
const ValueProofCenter = lazy(() =>
  import("@/components/precog/value-proof-center").then((module) => ({
    default: module.ValueProofCenter,
  })),
);

/**
 * The dashboard is driven by client-only state (local profile + active template).
 * Render a stable shell for SSR and the hydration pass, then the real app.
 */
function HomeGate() {
  const hydrated = useHydrated();
  if (!hydrated) return <HomeShell />;
  return <Home />;
}

function HomeShell() {
  return (
    <div className="min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-bg">
      <header className="border-b border-border bg-bg/90">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:px-6">
          <span className="inline-flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Eye className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Precog Pioneer</p>
            <p className="text-xs text-muted">Small business risk, mapped</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6" aria-busy="true">
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border bg-surface"
            />
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * Horizontal tab strip that tells the user there is more: a fade on whichever
 * edge still has hidden tabs, and the active tab scrolled into view so the
 * tabs past the viewport (12 through 15 on a laptop) are discoverable.
 */
function TabStrip({
  activeId,
  children,
  onKeyDown,
}: {
  activeId: string;
  children: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>("[data-active]");
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <div className="relative">
      <nav
        ref={ref}
        role="tablist"
        aria-label="Sections"
        onKeyDown={onKeyDown}
        className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6 [scrollbar-width:thin]"
      >
        {children}
      </nav>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent transition-opacity",
          edges.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg to-transparent transition-opacity",
          edges.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function TabLoading() {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-muted">Loading…</CardContent>
    </Card>
  );
}

type TabId =
  | "start"
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
  | "journal"
  | "snapshots"
  | "blueprint"
  | "value";

const TAB_IDS: readonly TabId[] = [
  "start",
  "command",
  "map",
  "pioneer",
  "intel",
  "residual",
  "coso",
  "layers",
  "knowledge",
  "precog",
  "sod",
  "journal",
  "snapshots",
  "blueprint",
  "value",
];

function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value);
}

/**
 * Every tab carries both wordings. Plain is what a business owner reads by
 * default; the framework and tactical terms stay one toggle away, because an
 * owner who will sit across from an accountant, a lender, or an insurer is
 * better off knowing both words for the same thing.
 */
const TABS: { id: TabId; label: string; tactical: string; icon: typeof Eye }[] = [
  { id: "start", label: "Start here", tactical: "Start here", icon: Compass },
  { id: "command", label: "Dashboard", tactical: "Command", icon: Activity },
  { id: "map", label: "How work flows", tactical: "Process map", icon: Map },
  { id: "pioneer", label: "Ask a question", tactical: "Advisor", icon: MessageSquare },
  { id: "intel", label: "Patterns", tactical: "Intel", icon: Brain },
  { id: "residual", label: "What is still exposed", tactical: "Residual", icon: Gauge },
  { id: "coso", label: "Coverage check", tactical: "COSO", icon: Grid3x3 },
  { id: "layers", label: "Where risk sits", tactical: "Layers", icon: Layers },
  { id: "knowledge", label: "Who knows what", tactical: "Knowledge", icon: Network },
  { id: "precog", label: "What could happen", tactical: "Precog", icon: Sparkles },
  { id: "sod", label: "Who controls what", tactical: "SoD", icon: Shield },
  { id: "journal", label: "Decisions log", tactical: "Journal", icon: BookOpen },
  { id: "value", label: "Value proof", tactical: "Value", icon: TrendingUp },
  { id: "blueprint", label: "Operating blueprint", tactical: "Blueprint", icon: LibraryBig },
  { id: "snapshots", label: "Assessment snapshots", tactical: "Snapshots", icon: Archive },
];

function Home() {
  const tpl = useTemplate();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: TabId = search.tab ?? "start";
  const setTab = useCallback(
    (next: TabId) => {
      void navigate({
        search: (prev) => ({ ...prev, tab: next === "start" ? undefined : next }),
        resetScroll: false,
      });
    },
    [navigate],
  );
  const [layer, setLayer] = useState<MatrixLayerId>("control");
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [knowledgeId, setKnowledgeId] = useState<string | null>(null);
  const [processId, setProcessId] = useState<string | null>(null);
  const [mapBuild, setMapBuild] = useState(false);
  const { isPending } = useCurrentUserState();
  const { profile, ready, mapCustomized } = usePractice();
  const { say } = usePresentation();
  const industry = industryMeta(profile.industry);

  const ranked = useMemo(
    () =>
      rankDangerousScenarios(tpl, {
        staff: profile.staff,
        riskVariables: profile.riskVariables,
      }),
    [tpl, profile.staff, profile.riskVariables],
  );
  const coso = useMemo(() => assessCoso(tpl), [tpl]);
  const portfolio = useMemo(() => portfolioSummary(tpl, profile.staff), [tpl, profile.staff]);
  const today = useToday();
  const leading = useMemo(
    () => scoreLeadingIndicators(tpl, profile.staff, profile.riskVariables),
    [tpl, profile.staff, profile.riskVariables],
  );
  const sodReport = useMemo(
    () => detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease)),
    [tpl, profile.staff, profile.dualRelease],
  );
  // One sole-owner figure on the whole Dashboard: the card shows the value the
  // business profile shows and the residual index uses, which for an owner's
  // register is the critical single points Who knows what counts.
  const registerReady = registerAssessed(tpl);
  const singlePoints = useMemo(() => criticalSinglePoints(tpl), [tpl]);
  const soleOwnerFigure = profile.staff.soleOwnerKnowledgeCount;
  const sodGaps = tpl.controls.filter((c) => !c.segregated).length;
  const top = ranked[0];
  const overdueDecisions = useMemo(
    () => decisionsDue(profile.decisions, today).overdue.length,
    [profile.decisions, today],
  );
  const slippedDecisions = useMemo(
    () => continuitySlips(profile.decisions, tpl).length,
    [profile.decisions, tpl],
  );

  const mapHealth = useMemo(() => {
    const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
    const issues = validateProcessMap(
      tpl.processes,
      tpl.people,
      new Set(tpl.controls.map((c) => c.id)),
      profile.mapLayout ?? {},
    );
    return computeMapHealth(snapshots, issues, { customized: mapCustomized });
  }, [tpl, profile.staff, profile.mapLayout, mapCustomized]);
  // A starter map nobody has assigned, or an empty map, has no health to show.
  const mapReady = mapAssessed(profile);

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

  /** Roving focus for the tab strip: arrow keys, Home, and End move between tabs. */
  function onTabKeyDown(event: KeyboardEvent<HTMLElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const id = TABS[next].id;
    setTab(id);
    requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
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
    // A confirmed starter control opens the control list on Where risk sits.
    if (tabName === "control") {
      setLayer("control");
      setTab("layers");
      return;
    }
    if (isTabId(tabName)) setTab(tabName);
  }

  return (
    <div className="min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-bg">
      {ready && profile.onboardingComplete === false && <IndustryOnboarding />}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-elevated focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="sticky top-[var(--grok-banner-h,0px)] z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <Eye className="size-4" />
              </span>
              <BusinessSwitcher />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PresentationToggle className="hidden sm:inline-flex" />
            <SyncStatusBadge className="hidden sm:inline-flex" />
            {overdueDecisions > 0 && (
              <button
                type="button"
                onClick={() => setTab("journal")}
                className="hidden rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn sm:inline"
              >
                {overdueDecisions} review overdue
              </button>
            )}
            {slippedDecisions > 0 && (
              <button
                type="button"
                onClick={() => setTab("journal")}
                className="hidden rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] text-danger sm:inline"
              >
                {slippedDecisions} slipped since done
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
                  <AccountMenu />
                </SignedIn>
              </>
            )}
          </div>
        </div>
        <TabStrip activeId={tab} onKeyDown={onTabKeyDown}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="main-content"
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                aria-label={say(t.label, t.tactical)}
                data-active={active || undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border border-border bg-elevated text-fg"
                    : "text-muted hover:bg-elevated/60 hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {say(t.label, t.tactical)}
                {t.id === "sod" && sodReport.summary.critical > 0 && (
                  <span className="rounded-full bg-danger/20 px-1.5 text-[10px] text-danger">
                    {sodReport.summary.critical}
                  </span>
                )}
              </button>
            );
          })}
        </TabStrip>
      </header>
      <SaveConflictBanner />

      <main
        id="main-content"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={-1}
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6"
      >
        {/* prettier-ignore */}
        {/* Keyed on the business, so switching businesses remounts every tab:
            no unsaved form input, import note or Power map baseline carries
            from one business into another. */}
        <TabErrorBoundary
          key={profile.businessId ?? "biz_default"}
          resetKey={tab}
          onReset={() => navigateTab("start")}
        >
          <Suspense fallback={<TabLoading />}>
            {tab === "start" && <StartHere onOpenDetail={navigateTab} />}

            {tab === "command" && (
              <div className="space-y-6">
                <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
                  <Badge variant="accent">{industry.label} · internal controls</Badge>
                  <h1 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                    Know your residual risk before it becomes a loss
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                    {industry.tagline}. Precog Pioneer scores SoD gaps, knowledge single points of
                    failure, and financial scenarios — then tells you what to fix this week. Built
                    for owner-operated {pluralTeamLabel(profile.industry)} of 2 to {OWN_TEAM_MAX}{" "}
                    people.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button onClick={() => setTab("sod")}>
                      Review SoD ({sodReport.conflicts.length})
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMapBuild(false);
                        setTab("map");
                      }}
                    >
                      Process map
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMapBuild(true);
                        setTab("map");
                      }}
                    >
                      <Hammer className="size-4" />
                      Build your map
                    </Button>
                    <Button variant="outline" onClick={() => setTab("pioneer")}>
                      Ask advisor
                    </Button>
                    <Link
                      to="/threat"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-fg"
                    >
                      <Crosshair className="size-4" />
                      Threat view
                    </Link>
                    <Link
                      to="/report"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-fg"
                    >
                      <FileText className="size-4" />
                      PDF report
                    </Link>
                  </div>
                </section>

                <MapHealthCard
                  onOpenMap={(id) => {
                    setMapBuild(false);
                    setProcessId(id ?? null);
                    setTab("map");
                  }}
                  onBuildMap={() => {
                    setMapBuild(true);
                    setTab("map");
                  }}
                />

                <IndexBasis />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <MetricCard
                    label="Map health"
                    value={mapReady ? String(mapHealth.score) : "—"}
                    hint={mapReady ? mapHealth.bandLabel : "Not assessed yet"}
                    tone={
                      !mapReady || mapHealth.score >= HEALTH_SCALE.adequate
                        ? "primary"
                        : mapHealth.score >= HEALTH_SCALE.weak
                          ? "warn"
                          : "danger"
                    }
                    onClick={() => {
                      setMapBuild(true);
                      setTab("map");
                    }}
                  />
                  <MetricCard
                    label="Avg residual"
                    value={String(portfolio.averageResidual)}
                    hint={`${portfolio.criticalPath} critical`}
                    tone={
                      portfolio.averageResidual >= RISK_SCALE.actNow
                        ? "danger"
                        : portfolio.averageResidual >= RISK_SCALE.mitigate
                          ? "warn"
                          : "primary"
                    }
                    onClick={() => setTab("residual")}
                  />
                  <MetricCard
                    label="SoD health"
                    value={String(sodReport.summary.segregationHealth)}
                    hint={`${sodReport.summary.critical} critical conflicts`}
                    tone={
                      sodReport.summary.segregationHealth < HEALTH_SCALE.weak
                        ? "danger"
                        : sodReport.summary.segregationHealth < HEALTH_SCALE.adequate
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
                    value={registerReady ? String(soleOwnerFigure) : "—"}
                    hint={
                      !registerReady
                        ? "Not assessed yet"
                        : soleOwnerFigure === singlePoints.count
                          ? `${singlePoints.nobody} with nobody, ${singlePoints.onePerson} with one person`
                          : `Business profile figure · Who knows what counts ${singlePoints.count}`
                    }
                    tone={!registerReady || soleOwnerFigure === 0 ? "primary" : "danger"}
                    onClick={() => navigateDeepLink({ type: "knowledge" })}
                  />
                  <MetricCard
                    label="Largest assumed retained loss"
                    value={
                      top
                        ? formatUsd(
                            top.result.retainedImpact?.expected ??
                              top.result.financialImpact.expected,
                          )
                        : "—"
                    }
                    hint={
                      top
                        ? `scenario assumption · about ${top.result.timelineDays.p50} days out`
                        : ""
                    }
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
                  <WeeklyActionPlan onNavigate={(t, id) => navigateTab(t, id)} />
                  <ControlCalendarCard
                    onOpenProcess={(id) => {
                      setMapBuild(true);
                      setProcessId(id);
                      setTab("map");
                    }}
                    onOpenJournal={() => setTab("journal")}
                    onOpenBuilder={() => {
                      setMapBuild(true);
                      setTab("map");
                    }}
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
                            <span className="block truncate text-sm font-medium">{item.name}</span>
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
                key={mapBuild ? "build" : "view"}
                initialProcessId={processId}
                initialBuild={mapBuild}
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

            {tab === "intel" && <IntelligencePanel onNavigate={(t) => navigateTab(t)} />}

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
                {/* A layer card shows its list below; the list links to its full tab. */}
                <LayersPanel active={layer} onSelect={setLayer} />
                <LayerDetail layer={layer} onOpenTab={(id) => navigateTab(id)} />
              </div>
            )}

            {tab === "knowledge" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Continuity of operations</h2>
                  <p className="text-sm text-muted">
                    List the duties, tasks and know-how the business runs on, mark who can do each,
                    and close the gaps where one absence would stop work.
                  </p>
                </div>
                <ContinuityPlanner initialKnowledgeId={knowledgeId} />
                <div>
                  <h3 className="text-base font-semibold">Knowledge continuity map</h3>
                  <p className="text-sm text-muted">
                    The same register as a people-to-knowledge map.
                  </p>
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

            {tab === "sod" && <SodPanel onNavigate={(t, id) => navigateTab(t, id)} />}

            {tab === "journal" && <DecisionJournal onOpenLinked={(t, id) => navigateTab(t, id)} />}
            {tab === "snapshots" && <AssessmentSnapshots />}
            {tab === "blueprint" && <OperatingBlueprint onNavigate={(t) => navigateTab(t)} />}
            {tab === "value" && <ValueProofCenter />}
          </Suspense>
        </TabErrorBoundary>
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
