/**
 * Who operates Precog, read by the legal pages, the footer, sign-in and the
 * server's refusal messages. Each bracketed value is a placeholder the owner
 * replaces before the first production build: scripts/migrate.mjs refuses a
 * production build while one remains. SUPPORT_EMAIL comes from the
 * SUPPORT_EMAIL environment variable, baked into both bundles at build time
 * (vite.config.ts envPrefix), so changing it needs a redeploy.
 */
export const OPERATOR_LEGAL_NAME = "[OPERATOR LEGAL NAME]";
export const OPERATOR_ADDRESS = "[OPERATOR ADDRESS]";
export const GOVERNING_LAW = "[STATE]";
export const AUTH_BROKER_OPERATOR = "[AUTH BROKER OPERATOR]";
export const XAI_API_DATA_POLICY_URL = "[XAI API DATA POLICY URL]";
export const SUPPORT_EMAIL: string =
  (import.meta.env.SUPPORT_EMAIL as string | undefined)?.trim() || "[SUPPORT EMAIL]";
/** True for a value the owner has not entered yet. */
export function isPlaceholder(value: string): boolean {
  return /^\[[A-Z ]+\]$/.test(value);
}
