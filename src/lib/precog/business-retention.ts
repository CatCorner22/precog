/**
 * Days a deleted business stays restorable before the purge job removes it.
 * Shared by the store and by the prompts that tell people about the restore.
 */
export const DELETED_RETENTION_DAYS = 30;

/**
 * Versions kept per business before the oldest are dropped. Shared by the
 * store and by the change history, which says how many it keeps.
 */
export const MAX_HISTORY_PER_BUSINESS = 200;
