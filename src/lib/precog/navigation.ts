/**
 * The home page's tabs and how a link addresses them.
 *
 * Every tab carries both wordings. Plain is what a business owner reads by
 * default; the framework and tactical terms stay one toggle away, because an
 * owner who will sit across from an accountant, a lender, or an insurer is
 * better off knowing both words for the same thing.
 */
export const TAB_WORDS = [
  { id: "start", label: "Start here", tactical: "Start here" },
  { id: "command", label: "Dashboard", tactical: "Command" },
  { id: "map", label: "How work flows", tactical: "Process map" },
  { id: "pioneer", label: "Ask Pioneer", tactical: "Pioneer" },
  { id: "intel", label: "Patterns", tactical: "Intel" },
  { id: "residual", label: "What is still exposed", tactical: "Residual" },
  { id: "coso", label: "Coverage check", tactical: "COSO" },
  { id: "layers", label: "Where risk sits", tactical: "Layers" },
  { id: "knowledge", label: "Who knows what", tactical: "Knowledge" },
  { id: "precog", label: "What could happen", tactical: "Precog" },
  { id: "sod", label: "Who controls what", tactical: "SoD" },
  { id: "journal", label: "Decisions log", tactical: "Journal" },
  { id: "value", label: "Value proof", tactical: "Value" },
  { id: "blueprint", label: "Operating blueprint", tactical: "Blueprint" },
  { id: "snapshots", label: "Assessment snapshots", tactical: "Snapshots" },
] as const;

export type TabId = (typeof TAB_WORDS)[number]["id"];

/**
 * Where a panel can send the owner: a tab, or "control", the control list on
 * Where risk sits.
 */
export type NavTarget = TabId | "control";

/**
 * How a panel asks the shell to open another tab, optionally focused on one
 * item. The tab is a string because some come from data (advisor answers,
 * coach tools); the shell checks it with `isNavTarget` and reports a miss.
 */
export type NavFn = (tab: string, id?: string) => void;

/**
 * The home page's address: `?tab=precog&item=<scenario id>` opens that
 * scenario, and `&build=1` opens How work flows in build mode, so a reload or
 * a pasted link lands on the same view and the same item.
 */
export interface HomeSearch {
  tab?: TabId;
  item?: string;
  /** Build mode on How work flows; "validate" also opens the builder's Validate panel. */
  build?: true | "validate";
}

export const TAB_IDS: readonly TabId[] = TAB_WORDS.map((t) => t.id);

export function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value);
}

export function isNavTarget(value: unknown): value is NavTarget {
  return value === "control" || isTabId(value);
}

/**
 * Reads the home page's search params. Start here is the default tab, so it
 * never appears in the address; an unknown tab falls back to it; an item
 * outlives only a tab that can show one.
 */
export function parseHomeSearch(search: Record<string, unknown>): HomeSearch {
  const tab = isTabId(search.tab) && search.tab !== "start" ? search.tab : undefined;
  // The router reads `item=42` as a number; an id is always text.
  const raw = typeof search.item === "number" ? String(search.item) : search.item;
  const item =
    tab && ITEM_TABS.has(tab) && typeof raw === "string" && raw.length <= ITEM_MAX
      ? raw.trim() || undefined
      : undefined;
  const build =
    tab !== "map"
      ? undefined
      : search.build === "validate"
        ? ("validate" as const)
        : search.build === true || search.build === "1" || search.build === 1
          ? (true as const)
          : undefined;
  return {
    ...(tab ? { tab } : {}),
    ...(item ? { item } : {}),
    ...(build ? { build } : {}),
  };
}

/** The tabs that open on one item: a scenario, a register entry, a process, or a layer. */
const ITEM_TABS: ReadonlySet<TabId> = new Set(["precog", "knowledge", "map", "layers"]);

const ITEM_MAX = 120;

/**
 * A tab's name in the active wording ("Who controls what" for "sod" in plain
 * wording; pass `say` from usePresentation for the toggle). Every "Open …"
 * button reads it from TAB_WORDS, so a button never prints a tab's internal
 * id; an unknown id is returned as given.
 */
export function tabLabel(
  tab: string,
  say: (plain: string, tactical: string) => string = (plain) => plain,
): string {
  const wording = TAB_WORDS.find((t) => t.id === tab);
  return wording ? say(wording.label, wording.tactical) : tab;
}
