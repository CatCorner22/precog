import type { Sql } from "@/lib/db";
import type { SuppressionReason } from "./resend-webhook";

/**
 * Addresses Precog no longer emails: Resend reported a hard bounce or a
 * complaint (migration 0038). Addresses are kept lower-cased and trimmed,
 * and compared the same way, since mail providers treat them so.
 */

/**
 * Records that `email` is not to be emailed again. A second report of the
 * same address (a redelivery, a complaint after a bounce) leaves the first
 * row and its reason as they were.
 */
export async function suppressEmail(
  sql: Sql,
  input: { email: string; reason: SuppressionReason; providerEventId: string | null },
): Promise<void> {
  await sql`
    insert into email_suppressions (email, reason, provider_event_id)
    values (${normalizeEmail(input.email)}, ${input.reason}, ${input.providerEventId})
    on conflict (email) do nothing
  `;
}

export async function isSuppressed(sql: Sql, email: string): Promise<boolean> {
  const rows = await sql<{ one: number }>`
    select 1 as one from email_suppressions where email = ${normalizeEmail(email)}
  `;
  return rows.length > 0;
}

/**
 * A SQL condition, true when the address in `column` is not suppressed, for
 * the raw queries that list who gets email. `column` is a column reference
 * written by the caller, never user input.
 */
export function NOT_SUPPRESSED(column: string): string {
  return `not exists (
    select 1 from email_suppressions es where es.email = lower(trim(${column}))
  )`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
