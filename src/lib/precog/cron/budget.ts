/**
 * How long each long stage of the weekly run may take, in milliseconds,
 * counted from the stage's start. The route runs under Vercel's 300 s bound
 * (vite.config.ts, check-build-functions.mjs); these four leave about 20 s
 * for the purge, the share logs and the activation counts. A stage that
 * reaches its deadline stops before its next recipient, connection, account
 * or credit reversal, and the run answers `partial: true` naming it; the next run picks
 * up what is left, since every stage logs or stamps what it finished.
 */
export const CRON_STAGE_BUDGET_MS = {
  digest: 150_000,
  quickbooks: 90_000,
  "quickbooks-alerts": 30_000,
  "credit-reversals": 10_000,
} as const;

export type CronStage = keyof typeof CRON_STAGE_BUDGET_MS;

/** True while there is time left before `deadline` (no deadline: always). */
export function beforeDeadline(deadline: number | undefined, now = Date.now()): boolean {
  return deadline === undefined || now < deadline;
}
