import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  BookOpenCheck,
  CalendarCheck,
  Eye,
  Gauge,
  House,
  Map,
  MessageSquare,
  Network,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";
import type { DeepLinkTarget } from "@/lib/precog/coso";
import {
  isTabId,
  parseHomeSearch,
  resolveNavTarget,
  ROUTE_ALIASES,
  routeAliasHref,
  TAB_WORDS,
  tabLabel,
  type RouteAliasId,
  type TabId,
} from "@/lib/precog/navigation";
import { usePracticeState, useTemplate } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { count } from "@/lib/precog/text";
import { AccountDataControls } from "@/components/precog/account-menu";
import { BusinessSwitcher } from "@/components/precog/business-switcher";
import {
  CountBadge,
  MoreTabsMenu,
  TabLoading,
  TabStrip,
  type ShellTab,
} from "@/components/precog/home-shell-parts";
import { LegalFooter } from "@/components/precog/legal-footer";
import { NeedsAttentionMenu } from "@/components/precog/needs-attention-menu";
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
  // Value proof and the snapshots moved to the firm workspace. The search
  // parser drops a tab it does not know, so the raw address is read here.
  beforeLoad: ({ location }) => {
    const href = routeAliasHref(location.searchStr);
    if (href) throw redirect({ href });
  },
});

function Home() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // A raw route alias (`?tab=value`) can sit here for the instant before the
  // redirect; anything that is not a tab opens Home.
  const tab: TabId = isTabId(search.tab) ? search.tab : "start";
  const item = search.item ?? null;
  const build = search.build ?? false;
  const activeAdvanced = ADVANCED_TABS.find((t) => t.id === tab) ?? null;

  const tpl = useTemplate();
  const { profile, ready } = usePracticeState();
  const { say } = usePresentation();

  /**
   * The one way to change the view: a tab, optionally one item on it, and
   * build mode for How work flows. Panels pass tab names as strings; one that
   * names no tab is reported in development instead of silently ignored.
   */
  const openTab = useCallback(
    (target: string, nextItem?: string | null, nextBuild?: boolean | "validate") => {
      // An alias ("journal", "residual", "control") opens the tab and view it became.
      const landing = resolveNavTarget(target, nextItem);
      if (!landing) {
        if (import.meta.env.DEV) console.warn(`No tab named "${target}"`);
        return;
      }
      if ("href" in landing) {
        void navigate({ href: landing.href });
        return;
      }
      const { tab: next, item: id } = landing;
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
    (target: DeepLinkTarget) =>
      // The control list is a view of Who controls what.
      target.type === "controls"
        ? openTab("sod", "controls")
        : openTab(target.type, deepLinkItem(target)),
    [openTab],
  );

  // While setup is open, the page behind it is inert: no keyboard or screen
  // reader can reach it. When setup closes, focus lands on the view's heading.
  const showOnboarding = ready && profile.onboardingComplete === false;
  // Setup loads on demand; start fetching it as soon as the business says
  // setup is unfinished, before the account check finishes.
  const setupUnfinished = profile.onboardingComplete === false;
  useEffect(() => {
    if (setupUnfinished) void loadIndustryOnboarding();
  }, [setupUnfinished]);
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

  // The shell computes only what it shows on every tab: the conflict badge.
  // "Needs attention" counts its own items; each tab runs its own engines.
  const sodReport = useMemo(
    () => detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease)),
    [tpl, profile.staff, profile.dualRelease],
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
      {showOnboarding && (
        <Suspense fallback={<SetupLoading />}>
          <IndustryOnboarding />
        </Suspense>
      )}
      <div inert={showOnboarding}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-elevated focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <header className="sticky top-[var(--grok-banner-h,0px)] z-20 border-b border-border bg-bg/90 backdrop-blur">
          {/* On a phone the wording, save state, Report, Needs attention and Firm
              workspace wrap to a second row instead of disappearing. */}
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
              <Link to="/report" className={buttonClass({ variant: "secondary", size: "sm" })}>
                Report
              </Link>
              <NeedsAttentionMenu onOpen={(target) => openTab(target)} />
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
              onPick={(id) => openTab(id)}
              links={ROUTE_LINK_IDS.map((id) => ({
                id,
                label: tabLabel(id, say),
                href: ROUTE_ALIASES[id].href,
              }))}
              onOpenLink={(id) => openTab(id)}
            />
          </TabStrip>
        </header>
        <SaveConflictBanner />

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
                {tab === "team" && <TeamArea />}
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
                {tab === "scores" && (
                  <ScoresArea view={item} openTab={openTab} onNavigate={openDeepLink} />
                )}
                {tab === "monthly" && <MonthlyArea item={item} openTab={openTab} />}
                {tab === "knowledge" && (
                  <div className="space-y-4">
                    <TabIntro id="knowledge" />
                    <KnowledgeDrawing item={item} />
                    <ContinuityPlanner initialKnowledgeId={item} />
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
                {tab === "sod" && (
                  <SodPanel onNavigate={openTab} report={sodReport} initialView={item} />
                )}
              </Suspense>
            </TabErrorBoundary>
          </div>
        </main>
        <footer className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
          <LegalFooter />
        </footer>
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

/**
 * The register drawn as people and what each of them knows, on request: the
 * register below is the working view, so the drawing (and its code) loads
 * only when the owner asks for it.
 */
function KnowledgeDrawing({ item }: { item: string | null }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-4">
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setShown((v) => !v)}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        Show as a drawing
      </button>
      {shown && (
        <section id="knowledge-drawing" aria-labelledby="knowledge-drawing-title">
          <h2 id="knowledge-drawing-title" className="text-base font-semibold">
            The register as a drawing
          </h2>
          <p className="mb-4 text-sm text-muted">
            The same register, drawn as people and what each of them knows.
          </p>
          <Suspense fallback={<TabLoading />}>
            <KnowledgeMap initialKnowledgeId={item} />
          </Suspense>
        </section>
      )}
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
    default:
      return undefined;
  }
}

const TAB_ICONS: Record<TabId, ShellTab["icon"]> = {
  start: House,
  team: Users,
  sod: Shield,
  knowledge: Network,
  procedures: BookOpenCheck,
  monthly: CalendarCheck,
  map: Map,
  precog: Sparkles,
  pioneer: MessageSquare,
  scores: Gauge,
};

const TABS: readonly ShellTab[] = TAB_WORDS.map((t) => ({ ...t, icon: TAB_ICONS[t.id] }));

/**
 * Six tabs carry the product: where you stand, who works here, who controls
 * what, who knows what, how to do it when they are out, and what to check
 * each month. The rest are deeper views of the same inputs and sit behind
 * "Advanced". Every tab keeps its id and deep link, and older ids open the
 * view they became (TAB_ALIASES) or the page they moved to (ROUTE_ALIASES).
 */
const PRIMARY_TAB_IDS: readonly TabId[] = [
  "start",
  "team",
  "sod",
  "knowledge",
  "procedures",
  "monthly",
];
/**
 * Value proof and History live on the firm workspace. Advanced links there,
 * so an owner who is signed out (and has no Firm workspace button) still
 * reaches Value proof on this device.
 */
const ROUTE_LINK_IDS: readonly RouteAliasId[] = ["value", "snapshots"];
const PRIMARY_TABS = PRIMARY_TAB_IDS.map((id) => TABS.find((t) => t.id === id)!);
const ADVANCED_TABS = TABS.filter((t) => !PRIMARY_TAB_IDS.includes(t.id));

/** Heading (tactical) and one-line purpose, in both wordings, for the tabs that open on a heading. */
const TAB_INTROS = {
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
      "Write the steps for each task, in the software screen or the physical place where it happens, so someone else can do it when the usual person is away.",
    tactical:
      "Step-by-step desk procedures by platform and module, linked to the register, with review dates.",
  },
  precog: {
    heading: "Scenario engine",
    plain:
      "Pick a scenario to see the assumed loss and how long it would run undetected, then test what dual release, an independent bank reconciliation, or your insurance would change.",
    tactical: "Timelines, insurance cost of risk, multi-scenario compare, cascades.",
  },
} satisfies Partial<Record<TabId, { heading: string; plain: string; tactical: string }>>;

/** Covers the page from the first frame while the setup dialog's code loads. */
function SetupLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm">
      <p role="status" className="text-sm text-muted">
        Opening setup…
      </p>
    </div>
  );
}

const loadIndustryOnboarding = () => import("@/components/precog/industry-onboarding");
const IndustryOnboarding = lazy(() =>
  loadIndustryOnboarding().then((module) => ({ default: module.IndustryOnboarding })),
);
const ProcessMap = lazy(() =>
  import("@/components/precog/process-map").then((module) => ({ default: module.ProcessMap })),
);
const PioneerCoach = lazy(() =>
  import("@/components/precog/pioneer-coach").then((module) => ({ default: module.PioneerCoach })),
);
const ScenarioRunner = lazy(() =>
  import("@/components/precog/scenario-runner").then((module) => ({
    default: module.ScenarioRunner,
  })),
);
const SodPanel = lazy(() =>
  import("@/components/precog/sod-panel").then((module) => ({ default: module.SodPanel })),
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
const TeamArea = lazy(() =>
  import("@/components/precog/team-area").then((module) => ({ default: module.TeamArea })),
);
const MonthlyArea = lazy(() =>
  import("@/components/precog/monthly-area").then((module) => ({ default: module.MonthlyArea })),
);
const ScoresArea = lazy(() =>
  import("@/components/precog/scores-area").then((module) => ({ default: module.ScoresArea })),
);
