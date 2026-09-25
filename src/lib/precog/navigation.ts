/** How a panel asks the shell to open another tab, optionally focused on one item. */
export type NavFn = (tab: string, id?: string) => void;
