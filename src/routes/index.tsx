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
import { toast } from "sonner";
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
import { useCurrentUserState } from "@/lib/auth/use-current-user";
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
import { usePracticeActions, usePracticeState, useTemplate } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { count } from "@/lib/precog/text";
import { AccountDataControls } from "@/components/precog/account-menu";
import { BusinessSwitcher } from "@/components/precog/business-switcher";
import { DigestConsentPrompt } from "@/components/precog/digest-consent-prompt";
import { DigestStateProvider } from "@/components/precog/digest-state";
import {
  BehindGuestImportPrompt,
  GuestImportPrompt,
} from "@/components/precog/guest-import-prompt";
import {
  CountBadge,
  HeaderActions,
  MoreTabsMenu,
  TabLoading,
  TabStrip,
  type ShellTab,
} from "@/components/precog/home-shell-parts";
import { LegalFooter } from "@/components/precog/legal-footer";
import { NeedsAttentionMenu } from "@/components/precog/needs-attention-menu";
import { PageIntro, type Wording } from "@/components/precog/page-intro";
import { PaymentOverdueBanner } from "@/components/precog/payment-overdue-banner";
import { PresentationToggle } from "@/components/precog/presentation-toggle";
import { SaveConflictBanner } from "@/components/precog/save-conflict-banner";
import { StartHere } from "@/components/precog/start-here";
import { SyncStatusBadge } from "@/components/precog/sync-status-badge";
import { TabErrorBoundary } from "@/components/precog/tab-error-boundary";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button-variants";

export const Route = createFileRoute("/")({
  component: HomeRoute,
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

/**
 * The digest switch in the header and the one-time question under it share
 * what changed on this page, so neither shows a stale setting.
 */
function HomeRoute() {
  return (
    <DigestStateProvider>
      <Home />
    </DigestStateProvider>
  );
}

function Home() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // A raw route alias (`?tab=value`) can sit here for the instant before the
  // redirect; anything that is not a tab opens Start here.
  const tab: TabId = isTabId(search.tab) ? search.tab : "start";
  const item = search.item ?? null;
  const build = search.build ?? false;
  const activeAdvanced = ADVANCED_TABS.find((t) => t.id === tab) ?? null;

  const tpl = useTemplate();
  const { profile, ready, businesses } = usePracticeState();
  const { switchBusiness } = usePracticeActions();
  const { say } = usePresentation();
  const { user, isPending } = useCurrentUserState();

  // A signed-out visitor with no business on this device lands on the
  // landing page first; its "Set up your business" link comes back with
  // `?start=1`, which opens setup here. A signed-in account with no business
  // sees setup straight away. The list always carries the open business, so
  // "no business" means the open one is unfinished and it is the only one.
  const activeId = profile.businessId ?? DEFAULT_BUSINESS_ID;
  const noBusiness =
    profile.onboardingComplete === false && businesses.every((b) => b.id === activeId);
  const activeSummary = businesses.find((b) => b.id === activeId);
  const wantsLanding = ready && !isPending && !user && noBusiness && !search.start;
  useEffect(() => {
    if (wantsLanding) void navigate({ to: "/welcome", replace: true });
  }, [wantsLanding, navigate]);

  // A digest link names its business (`?business=<id>`): open it once the
  // list holds it, then drop the key so a reload does not switch again. The
  // open business is left alone when the id is not in the list (a client the
  // account no longer sees, or a visitor who is signed out).
  const wantedBusiness = search.business ?? null;
  const switchedTo = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !wantedBusiness || switchedTo.current === wantedBusiness) return;
    const activeId = profile.businessId ?? DEFAULT_BUSINESS_ID;
    const dropKey = () =>
      void navigate({ search: (prev) => ({ ...prev, business: undefined }), replace: true });
    const matches = businesses.filter((b) => b.id === wantedBusiness);
    if (matches.length > 1) {
      switchedTo.current = wantedBusiness;
      toast.error("This link matches more than one client. Open the client from the switcher.");
      dropKey();
      return;
    }
    if (wantedBusiness === activeId) {
      switchedTo.current = wantedBusiness;
      dropKey();
      return;
    }
    if (!matches[0]) return;
    switchedTo.current = wantedBusiness;
    void switchBusiness(wantedBusiness, matches[0].ownerUserId).then((result) => {
      if (!result.ok) toast.error(result.reason);
      dropKey();
    });
  }, [ready, wantedBusiness, businesses, profile.businessId, switchBusiness, navigate]);

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
  // The guest-work question goes first on a first sign-in (the account
  // is empty, so setup would be open too): setup stays mounted but hidden
  // and inert while the question is up, so the two dialogs never show
  // together and no typed setup work is lost either way. When the question
  // closes with setup still to do, focus goes to setup's question.
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const guestPromptWasOpen = useRef(false);
  useEffect(() => {
    if (guestPromptWasOpen.current && !guestPromptOpen && showOnboarding) {
      requestAnimationFrame(() =>
        document.getElementById("industry-onboarding-title")?.focus({ preventScroll: true }),
      );
    }
    guestPromptWasOpen.current = guestPromptOpen;
  }, [guestPromptOpen, showOnboarding]);

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
        <BehindGuestImportPrompt open={guestPromptOpen}>
          <Suspense fallback={<SetupLoading />}>
            <IndustryOnboarding />
          </Suspense>
        </BehindGuestImportPrompt>
      )}
      {/* Guest work from before sign-in: asked before setup shows, because
          on a first sign-in the account is empty and setup would be open
          too; saving the guest business opens it and setup never appears. */}
      <SignedIn>
        <GuestImportPrompt onOpenChange={setGuestPromptOpen} />
      </SignedIn>
      <div inert={showOnboarding}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-elevated focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <header className="sticky top-[var(--grok-banner-h,0px)] z-20 border-b border-border bg-bg/90 backdrop-blur">
          {/* On a phone Report and Needs attention stay in the row and the rest
              folds behind "More" instead of wrapping to a second row. */}
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
            <div className="order-1 flex min-w-0 items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <Eye className="size-4" aria-hidden />
              </span>
              <BusinessSwitcher />
            </div>
            <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-2 sm:ml-auto sm:w-auto">
              <HeaderActions
                leading={
                  <>
                    <PresentationToggle />
                    <SyncStatusBadge compactOnPhone />
                  </>
                }
                inline={
                  <>
                    <Link
                      to="/report"
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      Report
                    </Link>
                    <NeedsAttentionMenu onOpen={(target, item) => openTab(target, item)} />
                  </>
                }
                trailing={
                  <SignedIn>
                    <Link
                      to="/firm"
                      title="For accountants and advisors who look after several businesses"
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      Firm workspace
                    </Link>
                  </SignedIn>
                }
              />
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
          <SignedIn>
            <PaymentOverdueBanner variant="home" />
            <DigestConsentPrompt />
          </SignedIn>
          <TabStrip
            activeId={tab}
            onKeyDown={onTabKeyDown}
            tabCount={TABS.length}
            trailing={
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
            }
          >
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
                {tab === "start" && (
                  <>
                    {/* The business's own account invites its accountant's firm here;
                        the card loads only after sign-in and stays empty otherwise. */}
                    {!noBusiness && !activeSummary?.shared && (
                      <SignedIn>
                        <Suspense fallback={null}>
                          <YourAccountantCard
                            key={activeId}
                            businessId={activeId}
                            businessName={profile.practiceName}
                          />
                        </Suspense>
                      </SignedIn>
                    )}
                    <StartHere onOpenDetail={openTab} sod={sodReport} />
                  </>
                )}
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
                    <ScenarioRunner item={item} onNavigate={openTab} />
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
 * The top of a tab the shell composes itself: the tab's own name in the active
 * wording, so the owner lands under the word they clicked, one sentence of
 * purpose, and the method folded away.
 */
function TabIntro({ id }: { id: keyof typeof TAB_INTROS }) {
  const { say } = usePresentation();
  const intro = TAB_INTROS[id];
  return (
    <PageIntro
      tab={id}
      purpose={intro.purpose}
      method={<p>{say(intro.method.plain, intro.method.tactical)}</p>}
    />
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

/** One sentence of purpose per page, with the method folded under "How this works". */
const TAB_INTROS = {
  knowledge: {
    purpose:
      "List the duties and know-how the business runs on, mark who can do each, and close the gaps where one absence would stop work.",
    method: {
      plain:
        "Each register entry names who can do it alone and who is still learning. One holder means the work stops when that person is out; a second holder is a stand-in. Check-ins per person keep the register current, and a written, findable procedure lowers the exposure of the entry it covers.",
      tactical:
        "Each register entry names who can do it alone and who is still learning. A single holder is a single point of failure; a second holder is a stand-in. Check-ins per person keep the register current, and a written, findable procedure is credited in know-how residual scoring.",
    },
  },
  procedures: {
    purpose: {
      plain:
        "Write the steps for each task, in the software screen or the physical place where it happens, so someone else can do it when the usual person is away.",
      tactical:
        "Step-by-step desk procedures by platform and module, linked to the register, with review dates.",
    },
    method: {
      plain:
        "Each procedure belongs to an entry on Who knows what and names the software or place where the task happens. A review date says when to read it again, and a written, findable procedure lowers the exposure of the entry it belongs to.",
      tactical:
        "Each procedure is linked to a register entry and names its platform and module. A review date drives staleness, and a written procedure is credited in know-how residual scoring.",
    },
  },
  precog: {
    purpose: {
      plain:
        "Pick a scenario to see the assumed loss and how long it would run undetected, then test what a second signer, an independent bank check or your insurance would change.",
      tactical:
        "Timelines, insurance cost of risk, multi-scenario compare, cascades, control failure.",
    },
    method: {
      plain:
        "Every scenario carries assumed days and dollars drawn from the prosecuted cases it cites; Precog never invents a figure. Compare what-ifs puts scenarios side by side, Settings and insurance changes the inputs, What else moves shows what a scenario drags with it, and If a control fails prices a safeguard that stops working.",
      tactical:
        "Every scenario carries assumed days and dollars drawn from the prosecuted cases it cites. Compare what-ifs runs several timelines at once, Settings and insurance changes the risk variables, What else moves shows cascades, and If a control fails re-scores residual risk with a safeguard failed or absent.",
    },
  },
} satisfies Partial<
  Record<TabId, { purpose: Wording; method: { plain: string; tactical: string } }>
>;

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
const YourAccountantCard = lazy(() =>
  import("@/components/precog/your-accountant-card").then((module) => ({
    default: module.YourAccountantCard,
  })),
);
const ScoresArea = lazy(() =>
  import("@/components/precog/scores-area").then((module) => ({ default: module.ScoresArea })),
);
