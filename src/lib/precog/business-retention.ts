/**
 * Days a deleted business stays restorable before the purge job removes it.
 * Shared by the store and by the prompts that tell people about the restore.
 */
export const DELETED_RETENTION_DAYS = 30;

/**
 * Minutes of one person's editing that share one kept version. A save keeps
 * the version it replaces only when the newest kept version is older than
 * this, or another account saved either of them. Shared by the store and by
 * the change history, which states the rule.
 */
export const HISTORY_VERSION_WINDOW_MINUTES = 15;

/** Days a kept version stays; the newest kept version stays however old it is. */
export const HISTORY_RETENTION_DAYS = 90;

/**
 * Versions kept per business at most, however recent: the ceiling on what
 * one business's history can store.
 */
export const MAX_HISTORY_PER_BUSINESS = 200;

/** The change history's statement of the rule above, for one business. */
export function historyRuleText(businessName: string): string {
  return `Precog keeps one version of ${businessName} for every ${HISTORY_VERSION_WINDOW_MINUTES} minutes of editing by each person, for ${HISTORY_RETENTION_DAYS} days and at most ${MAX_HISTORY_PER_BUSINESS} versions, with who made each one.`;
}
