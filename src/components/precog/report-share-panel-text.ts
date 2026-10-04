/** What a report link hands to whoever opens it, said before the link is made. */
export const REPORT_SHARE_NOTE =
  "The link carries this business's names, duties and review notes as the version prints them. Anyone with the link can open it until it expires or you revoke it.";

/** The expiries a report link offers, in days. */
export const REPORT_SHARE_EXPIRIES = [7, 30, 90] as const;

/**
 * Shown when this version's links could not be listed. The list loads once
 * when the panel opens, so reopening it is the retry; the map builder's panel
 * says the same.
 */
export const REPORT_SHARE_LIST_FAILED =
  "Couldn't load your links. Close and reopen Share to try again.";
