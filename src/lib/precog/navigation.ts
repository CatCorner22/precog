/** How a panel asks the shell to open another tab, optionally focused on one item. */
export type NavFn = (tab: string, id?: string) => void;

/**
 * Every tab's two names. Plain is what a business owner reads by default; the
 * tactical name is the framework term one toggle away. The tab strip and every
 * "Open …" button read from here, so a button never prints a tab's internal id.
 */
export const TAB_WORDING = {
  start: { label: "Start here", tactical: "Start here" },
  command: { label: "Dashboard", tactical: "Command" },
  map: { label: "How work flows", tactical: "Process map" },
  pioneer: { label: "Ask a question", tactical: "Advisor" },
  intel: { label: "Patterns", tactical: "Intel" },
  residual: { label: "What is still exposed", tactical: "Residual" },
  coso: { label: "Coverage check", tactical: "COSO" },
  layers: { label: "Where risk sits", tactical: "Layers" },
  knowledge: { label: "Who knows what", tactical: "Knowledge" },
  precog: { label: "What could happen", tactical: "Precog" },
  sod: { label: "Who controls what", tactical: "SoD" },
  journal: { label: "Decisions log", tactical: "Journal" },
  value: { label: "Value proof", tactical: "Value" },
  blueprint: { label: "Operating blueprint", tactical: "Blueprint" },
  snapshots: { label: "Assessment snapshots", tactical: "Snapshots" },
} as const satisfies Record<string, { label: string; tactical: string }>;

/**
 * A tab's name in the active wording ("Who controls what" for "sod" in plain
 * wording, pass `say` from usePresentation for the toggle); an unknown id is
 * returned as given.
 */
export function tabLabel(
  tab: string,
  say: (plain: string, tactical: string) => string = (plain) => plain,
): string {
  const wording = (TAB_WORDING as Record<string, { label: string; tactical: string }>)[tab];
  return wording ? say(wording.label, wording.tactical) : tab;
}
