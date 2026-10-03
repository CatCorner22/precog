/**
 * The home page's tabs and how a link addresses them.
 *
 * Every tab carries both wordings. Plain is what a business owner reads by
 * default; the framework and tactical terms stay one toggle away, because an
 * owner who will sit across from an accountant, a lender, or an insurer is
 * better off knowing both words for the same thing.
 */
export const TAB_WORDS = [
  { id: "start", label: "Home", tactical: "Home" },
  { id: "team", label: "Team", tactical: "Team" },
  { id: "sod", label: "Who controls what", tactical: "SoD" },
  { id: "knowledge", label: "Who knows what", tactical: "Knowledge" },
  { id: "procedures", label: "Procedures", tactical: "Procedures" },
  { id: "monthly", label: "Monthly review", tactical: "Monthly review" },
  { id: "map", label: "How work flows", tactical: "Process map" },
  { id: "precog", label: "What could happen", tactical: "Scenarios" },
  { id: "pioneer", label: "Ask Pioneer", tactical: "Pioneer" },
  { id: "scores", label: "How Precog scores", tactical: "Scoring" },
] as const;

export type TabId = (typeof TAB_WORDS)[number]["id"];

/**
 * Names that are not tabs but still open one: older tab ids that now live
 * inside a tab (saved links, decisions logged with that `linkedTab`, advisor
 * answers), each opening the view or section it became. Each alias keeps its
 * own wording, so a sentence such as "Dated in the Decisions log" still names
 * the place the owner lands on, not the tab around it.
 */
export const TAB_ALIASES = {
  // A starter control confirmed "This runs here", a control recorded as
  // already in place, and the retired "Where risk sits" tab all open the
  // Controls view of Who controls what.
  control: { tab: "sod", item: "controls", label: "Controls", tactical: "Controls" },
  "control-in-place": { tab: "sod", item: "controls", label: "Controls", tactical: "Controls" },
  layers: { tab: "sod", item: "controls", label: "Controls", tactical: "Controls" },
  residual: {
    tab: "scores",
    item: "residual",
    label: "What is still exposed",
    tactical: "Residual",
  },
  coso: { tab: "scores", item: "coverage", label: "Coverage check", tactical: "COSO" },
  intel: { tab: "scores", item: "patterns", label: "Patterns", tactical: "Intel" },
  journal: { tab: "monthly", item: "decisions", label: "Decisions log", tactical: "Journal" },
  // The retired Dashboard opens Home; the retired blueprint screen opens Procedures.
  command: { tab: "start", label: "Home", tactical: "Home" },
  blueprint: { tab: "procedures", label: "Procedures", tactical: "Procedures" },
} as const satisfies Record<string, { tab: TabId; item?: string; label: string; tactical: string }>;

export type AliasId = keyof typeof TAB_ALIASES;

/**
 * Older tab ids that now live on another page: Value proof and the
 * assessment snapshots moved to the firm workspace, each to its own section.
 * They keep their wording, like a tab alias.
 */
export const ROUTE_ALIASES = {
  value: { href: "/firm#value-proof", label: "Value proof", tactical: "Value" },
  snapshots: { href: "/firm#history", label: "History", tactical: "History" },
} as const satisfies Record<string, { href: string; label: string; tactical: string }>;

export type RouteAliasId = keyof typeof ROUTE_ALIASES;

export function isRouteAliasId(value: unknown): value is RouteAliasId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROUTE_ALIASES, value);
}

/**
 * The page a raw `?tab=` names when it is a route alias, read from the
 * address before `parseHomeSearch` drops it (the home route redirects there).
 */
export function routeAliasHref(searchStr: string): string | null {
  const tab = new URLSearchParams(searchStr).get("tab");
  return isRouteAliasId(tab) ? ROUTE_ALIASES[tab].href : null;
}

/** Where a panel can send the owner: a tab, an alias that opens one, or a route alias. */
export type NavTarget = TabId | AliasId | RouteAliasId;

/**
 * How a panel asks the shell to open another tab, optionally focused on one
 * item. The tab is a string because some come from data (advisor answers,
 * coach tools); the shell checks it with `isNavTarget` and reports a miss.
 */
export type NavFn = (tab: string, id?: string) => void;

/**
 * The home page's address: `?tab=precog&item=<scenario id>` opens that
 * scenario, and `&build=1` opens How work flows in build mode, so a reload or
 * a pasted link lands on the same view and the same item. An alias in the
 * address (`?tab=journal`) opens the tab and the view it became; a route
 * alias (`?tab=value`) is redirected to its page before this runs.
 */
interface HomeSearch {
  tab?: TabId;
  item?: string;
  /** Build mode on How work flows; "validate" also opens the builder's Validate panel. */
  build?: true | "validate";
  /** A QuickBooks connection outcome, kept only when it is one of the known codes. */
  quickbooks?: string;
}

export const TAB_IDS: readonly TabId[] = TAB_WORDS.map((t) => t.id);

export function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value);
}

export function isAliasId(value: unknown): value is AliasId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TAB_ALIASES, value);
}

export function isNavTarget(value: unknown): value is NavTarget {
  return isTabId(value) || isAliasId(value) || isRouteAliasId(value);
}

/**
 * Where a target lands: its tab and, when it has one, the item on it. An
 * alias's own item (a view or a section) wins; otherwise the item passes
 * through only to a tab that opens on one. A route alias (a whole other page)
 * comes back as `{ href }`. A name that is neither a tab nor an alias comes
 * back as null.
 */
export function resolveNavTarget(
  target: string,
  item?: string | null,
): { tab: TabId; item?: string } | { href: string } | null {
  if (isAliasId(target)) {
    const alias: { tab: TabId; item?: string } = TAB_ALIASES[target];
    return alias.item ? { tab: alias.tab, item: alias.item } : withItem(alias.tab, item);
  }
  if (isTabId(target)) return withItem(target, item);
  if (isRouteAliasId(target)) return { href: ROUTE_ALIASES[target].href };
  return null;
}

function withItem(tab: TabId, item?: string | null): { tab: TabId; item?: string } {
  return item && ITEM_TABS.has(tab) ? { tab, item } : { tab };
}

/** The outcomes the QuickBooks connection reports back in the address. */
const QUICKBOOKS_STATUSES: ReadonlySet<string> = new Set([
  "connected",
  "declined",
  "invalid",
  "signed-out",
  "wrong-account",
  "failed",
  "not-configured",
]);

/**
 * Reads the home page's search params. Home is the default tab, so it never
 * appears in the address; an alias opens the tab it became; an unknown tab
 * falls back to Home; an item outlives only a tab that can show one.
 */
export function parseHomeSearch(search: Record<string, unknown>): HomeSearch {
  // The router reads `item=42` as a number; an id is always text.
  const raw = typeof search.item === "number" ? String(search.item) : search.item;
  const given = typeof raw === "string" && raw.length <= ITEM_MAX ? raw.trim() : undefined;
  const target = typeof search.tab === "string" ? resolveNavTarget(search.tab, given) : null;
  const landing = target && "tab" in target && target.tab !== "start" ? target : null;
  const tab = landing?.tab;
  const item = landing?.item || undefined;
  const build =
    tab !== "map"
      ? undefined
      : search.build === "validate"
        ? ("validate" as const)
        : search.build === true || search.build === "1" || search.build === 1
          ? (true as const)
          : undefined;
  const quickbooks =
    typeof search.quickbooks === "string" && QUICKBOOKS_STATUSES.has(search.quickbooks)
      ? search.quickbooks
      : undefined;
  // Every key is present, undefined when dropped: the router lays these over
  // the raw query, so a key left out would keep the raw value (a retired
  // `?tab=command` would stay in the address and select no tab). A route
  // alias is the exception: its raw `tab` stays, so the address is not
  // rewritten to Home before the route's beforeLoad redirects it.
  if (isRouteAliasId(search.tab)) return { item, build, quickbooks };
  return { tab, item, build, quickbooks };
}

/**
 * The tabs that open on one item: a scenario, a register entry, a procedure
 * or a process. On Who controls what, How Precog scores and Monthly
 * review, the item names a view or a section.
 */
const ITEM_TABS: ReadonlySet<TabId> = new Set([
  "precog",
  "knowledge",
  "procedures",
  "map",
  "sod",
  "scores",
  "monthly",
]);

const ITEM_MAX = 120;

/**
 * A tab's name in the active wording ("Who controls what" for "sod" in plain
 * wording; pass `say` from usePresentation for the toggle). An alias reads
 * its own wording ("Decisions log" for "journal"), not its tab's. Every
 * "Open …" button reads it from here, so a button never prints a tab's
 * internal id; an unknown id is returned as given.
 */
export function tabLabel(
  tab: NavTarget | (string & {}),
  say: (plain: string, tactical: string) => string = (plain) => plain,
): string {
  const wording: { label: string; tactical: string } | undefined = isAliasId(tab)
    ? TAB_ALIASES[tab]
    : isRouteAliasId(tab)
      ? ROUTE_ALIASES[tab]
      : TAB_WORDS.find((t) => t.id === tab);
  return wording ? say(wording.label, wording.tactical) : tab;
}
