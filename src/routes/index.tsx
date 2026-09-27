import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Archive,
  BookOpen,
  BookOpenCheck,
  Brain,
  Compass,
  Eye,
  Gauge,
  Grid3x3,
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
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";
import type { DeepLinkTarget } from "@/lib/precog/coso";
import { continuitySlips, decisionsDue } from "@/lib/precog/decisions/follow-through";
import { useToday } from "@/lib/use-today";
import { localDateKey } from "@/lib/precog/dates";
import { isNavTarget, parseHomeSearch, TAB_WORDS, type TabId } from "@/lib/precog/navigation";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { count, verb } from "@/lib/precog/text";
import type { MatrixLayerId } from "@/lib/precog/types";
import { AccountDataControls } from "@/components/precog/account-menu";
import { BusinessSwitcher } from "@/components/precog/business-switcher";
import { Dashboard } from "@/components/precog/dashboard";
import {
  CountBadge,
  MoreTabsMenu,
  TabLoading,
  TabStrip,
  type ShellTab,
} from "@/components/precog/home-shell-parts";
import { IndustryOnboarding } from "@/components/precog/industry-onboarding";
import { LeaverAccessPrompt } from "@/components/precog/leaver-access";
import { PresentationToggle } from "@/components/precog/presentation-toggle";
import { SaveConflictBanner } from "@/components/precog/save-conflict-banner";
import { StartHere } from "@/components/precog/start-here";
import { SyncStatusBadge } from "@/components/precog/sync-status-badge";
import { TabErrorBoundary } from "@/components/precog/tab-error-boundary";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button-variants";

export const Route = createFileRoute("/")({
  component: Home,
  // The open tab and the item on it live in the URL (?tab=precog&item=…) so
  // refresh, back/forward, and shared links land on the same view and item.
  validateSearch: parseHomeSearch,
});

function Home() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: TabId = search.tab ?? "start";
  const item = search.item ?? null;
  const build = search.build ?? false;
  const layer: MatrixLayerId = item && item in MATRIX_LAYERS ? (item as MatrixLayerId) : "control";
  const activeAdvanced = ADVANCED_TABS.find((t) => t.id === tab) ?? null;

  const tpl = useTemplate();
  const { profile, ready } = usePractice();
  const { say } = usePresentation();
  const today = useToday();

  /**
   * The one way to change the view: a tab, optionally one item on it, and
   * build mode for How work flows. Panels pass tab names as strings; one that
   * names no tab is reported in development instead of silently ignored.
   */
  const openTab = useCallback(
    (target: string, nextItem?: string | null, nextBuild?: boolean | "validate") => {
      if (!isNavTarget(target)) {
        if (import.meta.env.DEV) console.warn(`No tab named "${target}"`);
        return;
      }
      // A confirmed starter control opens the control list on Where risk sits.
      const next: TabId = target === "control" ? "layers" : target;
      const id = target === "control" ? "control" : nextItem;
      void navigate({
        search: {
          ...(next !== "start" ? { tab: next } : {}),
          ...(id ? { item: id } : {}),
          ...(next === "map" && nextBuild
            ? { build: nextBuild === "validate" ? ("validate" as const) : (true as const) }
            : {}),
        },
        resetScroll: false,
      });
    },
    [navigate],
  );
  const openDeepLink = useCallback(
    (target: DeepLinkTarget) => openTab(target.type, deepLinkItem(target)),
    [openTab],
  );

  // While setup is open, the page behind it is inert: no keyboard or screen
  // reader can reach it. When setup closes, focus lands on the view's heading.
  const showOnboarding = ready && profile.onboardingComplete === false;
  const onboardingWasOpen = useRef(showOnboarding);
  useEffect(() => {
    if (onboardingWasOpen.current && !showOnboarding) {
      requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>("#main-content h1");
        if (heading) {
          heading.tabIndex = -1;
          heading.focus();
        } else {
          document.getElementById("main-content")?.focus();
        }
      });
    }
    onboardingWasOpen.current = showOnboarding;
  }, [showOnboarding]);

  // The shell computes only what it shows on every tab: the conflict badge and
  // the two decision notices. Each tab runs its own engines.
  const sodReport = useMemo(
    () => detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease)),
    [tpl, profile.staff, profile.dualRelease],
  );
  const overdueDecisions = useMemo(
    () => decisionsDue(profile.decisions, localDateKey(today)).overdue.length,
    [profile.decisions, today],
  );
  const slippedDecisions = useMemo(
    () => continuitySlips(profile.decisions, tpl).length,
    [profile.decisions, tpl],
  );
  const critical = sodReport.summary.critical;

  /** Roving focus for the tab strip: arrow keys, Home, and End move between tabs. */
  function onTabKeyDown(event: KeyboardEvent<HTMLElement>) {
    // The visible strip: the primary tabs plus the open advanced tab, if any.
    const visible = activeAdvanced ? [...PRIMARY_TABS, activeAdvanced] : PRIMARY_TABS;
    const index = visible.findIndex((t) => t.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % visible.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + visible.length) % visible.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    else return;
    event.preventDefault();
    const id = visible[next].id;
    openTab(id);
    requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
  }

  return (
    <div className="min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-bg">
      {showOnboarding && <IndustryOnboarding />}
      <div inert={showOnboarding}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-elevated focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <header className="sticky top-[var(--grok-banner-h,0px)] z-20 border-b border-border bg-bg/90 backdrop-blur">
          {/* On a phone the wording, save state, notices and Firm workspace wrap
              to a second row instead of disappearing. */}
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
            <div className="order-1 flex min-w-0 items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <Eye className="size-4" aria-hidden />
              </span>
              <BusinessSwitcher />
            </div>
            <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-2 sm:ml-auto sm:w-auto">
              <PresentationToggle />
              <SyncStatusBadge compactOnPhone />
              {overdueDecisions > 0 && (
                <button
                  type="button"
                  onClick={() => openTab("journal")}
                  className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn"
                >
                  {count(overdueDecisions, "decision")} to review
                </button>
              )}
              {slippedDecisions > 0 && (
                <button
                  type="button"
                  onClick={() => openTab("journal")}
                  className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger"
                >
                  {count(slippedDecisions, "decision")} undone since you marked{" "}
                  {verb(slippedDecisions, "it", "them")} done
                </button>
              )}
              <SignedIn>
                <Link
                  to="/firm"
                  title="For accountants and advisors who look after several businesses"
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Firm workspace
                </Link>
              </SignedIn>
            </div>
            <div className="order-2 flex items-center gap-2 sm:order-3">
              <SignedOut>
                <Link to="/login" className={buttonClass({ variant: "secondary", size: "sm" })}>
                  Sign in
                </Link>
              </SignedOut>
              <SignedIn>
                <UserButton />
                <AccountDataControls />
              </SignedIn>
            </div>
          </div>
          <TabStrip activeId={tab} onKeyDown={onTabKeyDown} tabCount={TABS.length}>
            {[...PRIMARY_TABS, ...(activeAdvanced ? [activeAdvanced] : [])].map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="tab-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => openTab(t.id)}
                  data-active={active || undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "border border-border bg-elevated text-fg"
                      : "text-muted hover:bg-elevated/60 hover:text-fg",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {say(t.label, t.tactical)}
                  {t.id === "sod" && critical > 0 && (
                    <CountBadge
                      n={critical}
                      tone="danger"
                      text={count(critical, "critical duty conflict")}
                    />
                  )}
                </button>
              );
            })}
            <MoreTabsMenu
              tabs={ADVANCED_TABS}
              activeId={tab}
              label={(t) => say(t.label, t.tactical)}
              badge={(t) => (t.id === "journal" ? overdueDecisions : 0)}
              badgeText={(n) => `${count(n, "decision")} to review`}
              onPick={(id) => openTab(id)}
            />
          </TabStrip>
        </header>
        <SaveConflictBanner />
        {/* On Start here the leaver check is part of the page; elsewhere it asks once at the top. */}
        {tab !== "start" && <LeaverAccessPrompt />}

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {/* Keyed on the business, so switching businesses remounts every tab:
                no unsaved form input, import note or Power map baseline carries
                from one business into another. */}
            <TabErrorBoundary
              key={profile.businessId ?? DEFAULT_BUSINESS_ID}
              resetKey={tab}
              onReset={() => openTab("start")}
            >
              <Suspense fallback={<TabLoading />}>
                {tab === "start" && <StartHere onOpenDetail={openTab} sod={sodReport} />}
                {tab === "command" && <Dashboard sodReport={sodReport} onOpen={openTab} />}
                {tab === "map" && (
                  <ProcessMap
                    key={String(build)}
                    initialProcessId={item}
                    initialBuild={build !== false}
                    initialPanel={build === "validate" ? "validate" : undefined}
                    onNavigate={openTab}
                  />
                )}
                {tab === "pioneer" && <PioneerCoach onNavigate={openTab} />}
                {tab === "intel" && <IntelligencePanel onNavigate={openTab} />}
                {tab === "residual" && (
                  <div className="space-y-4">
                    <TabIntro id="residual" />
                    <ResidualRadar onNavigate={openDeepLink} />
                  </div>
                )}
                {tab === "coso" && (
                  <div className="space-y-4">
                    <TabIntro id="coso" />
                    <CosoHeatmap onNavigate={openDeepLink} />
                  </div>
                )}
                {tab === "layers" && (
                  <div className="space-y-4">
                    <TabIntro id="layers" />
                    {/* A layer card shows its list below; the list links to its full tab. */}
                    <LayersPanel active={layer} onSelect={(id) => openTab("layers", id)} />
                    <LayerDetail layer={layer} onOpenTab={openTab} />
                  </div>
                )}
                {tab === "knowledge" && (
                  <div className="space-y-4">
                    <TabIntro id="knowledge" />
                    <ContinuityPlanner initialKnowledgeId={item} />
                    <div>
                      <h2 className="text-base font-semibold">The register as a drawing</h2>
                      <p className="text-sm text-muted">
                        The same register, drawn as people and what each of them knows.
                      </p>
                    </div>
                    <KnowledgeMap initialKnowledgeId={item} />
                  </div>
                )}
                {tab === "procedures" && (
                  <div className="space-y-4">
                    <TabIntro id="procedures" />
                    <ProceduresPanel key={item ?? "list"} initialItem={item} />
                  </div>
                )}
                {tab === "precog" && (
                  <div className="space-y-4">
                    <TabIntro id="precog" />
                    <ScenarioRunner initialScenarioId={item} />
                  </div>
                )}
                {tab === "sod" && <SodPanel onNavigate={openTab} />}
                {tab === "journal" && <DecisionJournal onOpenLinked={openTab} />}
                {tab === "snapshots" && <AssessmentSnapshots />}
                {tab === "blueprint" && <OperatingBlueprint />}
                {tab === "value" && <ValueProofCenter />}
              </Suspense>
            </TabErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * The heading of a tab that has one: the tab's own name in plain wording, so
 * the owner lands under the word they clicked, and the framework name in
 * tactical wording.
 */
function TabIntro({ id }: { id: keyof typeof TAB_INTROS }) {
  const { say } = usePresentation();
  const tab = TABS.find((t) => t.id === id)!;
  const intro = TAB_INTROS[id];
  return (
    <div>
      <h1 className="text-lg font-semibold">{say(tab.label, intro.heading)}</h1>
      <p className="text-sm text-muted">{say(intro.plain, intro.tactical)}</p>
    </div>
  );
}

/** The item a coverage-check or residual link points at, in the shell's `item` vocabulary. */
function deepLinkItem(target: DeepLinkTarget): string | undefined {
  switch (target.type) {
    case "knowledge":
      return target.knowledgeId;
    case "precog":
      return target.scenarioId;
    case "layers":
      return target.layer;
    default:
      return undefined;
  }
}

const TAB_ICONS: Record<TabId, ShellTab["icon"]> = {
  start: Compass,
  command: Activity,
  map: Map,
  pioneer: MessageSquare,
  intel: Brain,
  residual: Gauge,
  coso: Grid3x3,
  layers: Layers,
  knowledge: Network,
  procedures: BookOpenCheck,
  precog: Sparkles,
  sod: Shield,
  journal: BookOpen,
  value: TrendingUp,
  blueprint: LibraryBig,
  snapshots: Archive,
};

const TABS: readonly ShellTab[] = TAB_WORDS.map((t) => ({ ...t, icon: TAB_ICONS[t.id] }));

/**
 * Seven tabs carry the product: where you stand, how work flows, who controls
 * what, who knows what, how to do it when they are out, what could happen,
 * and the advisor. The rest are other views of the same inputs and sit
 * behind "More", so a first visit meets seven choices, not sixteen. Every
 * tab keeps its id and deep link.
 */
const PRIMARY_TAB_IDS: readonly TabId[] = [
  "start",
  "map",
  "sod",
  "knowledge",
  "procedures",
  "precog",
  "pioneer",
];
const PRIMARY_TABS = PRIMARY_TAB_IDS.map((id) => TABS.find((t) => t.id === id)!);
const ADVANCED_TABS = TABS.filter((t) => !PRIMARY_TAB_IDS.includes(t.id));

/** Heading (tactical) and one-line purpose, in both wordings, for the tabs that open on a heading. */
const TAB_INTROS = {
  residual: {
    heading: "Residual risk radar",
    plain:
      "Which risks remain after the controls you have today, scored from your business profile.",
    tactical: "Transparent scoring from the business profile.",
  },
  coso: {
    heading: "COSO control system",
    plain:
      "How well your controls cover each part of a sound control system, with a link to each gap.",
    tactical: "Component health with deep links.",
  },
  layers: {
    heading: "Six layers of your business",
    plain:
      "Look at one layer of the business at a time: customers, work, know-how, controls, systems and continuity.",
    tactical: "Peel layers independently.",
  },
  knowledge: {
    heading: "Continuity of operations",
    plain:
      "List the duties and know-how the business runs on, mark who can do each, and close the gaps where one absence would stop work.",
    tactical:
      "List the duties and know-how the business runs on, mark who can do each, and close the gaps where one absence would stop work.",
  },
  procedures: {
    heading: "Procedures",
    plain:
      "Write the steps for each task, in the software screen or the physical place it is done, so someone else can do it when the usual person is away.",
    tactical:
      "Step-by-step desk procedures by platform and module, linked to the register, with review dates.",
  },
  precog: {
    heading: "Precog scenario engine",
    plain:
      "Pick a scenario to see the assumed loss and how long it would run undetected, then test what dual release, an independent bank reconciliation, or your insurance would change.",
    tactical: "Timelines, insurance cost of risk, multi-scenario compare, cascades.",
  },
} satisfies Partial<Record<TabId, { heading: string; plain: string; tactical: string }>>;

/** Every layer Where risk sits can open on; `item` names one of them. */
const MATRIX_LAYERS: Record<MatrixLayerId, true> = {
  surface: true,
  process: true,
  knowledge: true,
  control: true,
  source: true,
  continuity: true,
};

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
const ProceduresPanel = lazy(() =>
  import("@/components/precog/procedures/procedures-panel").then((module) => ({
    default: module.ProceduresPanel,
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
