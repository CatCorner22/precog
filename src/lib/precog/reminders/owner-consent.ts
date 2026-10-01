import type { Sql } from "@/lib/db";

/**
 * A client owner's say over the reminders sent to their address. The token
 * from the confirmation email and from every reminder names one address on
 * one business; whoever holds it can agree to the reminders or stop them.
 */
export interface OwnerConsent {
  businessName: string;
  confirmed: boolean;
  stopped: boolean;
}

const TOKEN = /^[0-9a-f]{48}$/;

export function isOwnerConsentToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

export async function findOwnerConsent(sql: Sql, token: string): Promise<OwnerConsent | null> {
  const rows = await sql<{ name: string; confirmed: boolean; stopped: boolean }>`
    select b.name,
      e.owner_email_confirmed_at is not null as confirmed,
      e.owner_email_unsubscribed_at is not null as stopped
    from engagement_marks e
    join businesses b on b.user_id = e.user_id and b.id = e.business_id
    where e.owner_email_token = ${token} and e.owner_email is not null
  `;
  const row = rows[0];
  return row ? { businessName: row.name, confirmed: row.confirmed, stopped: row.stopped } : null;
}

/** The owner agrees; this also undoes an earlier stop. True when the token named an address. */
export async function confirmOwnerEmail(sql: Sql, token: string): Promise<boolean> {
  const rows = await sql<{ user_id: string; business_id: string; owner_email: string }>`
    update engagement_marks
    set owner_email_confirmed_at = now(), owner_email_unsubscribed_at = null
    where owner_email_token = ${token} and owner_email is not null
    returning user_id, business_id, owner_email
  `;
  for (const r of rows) {
    await sql`
      delete from owner_email_stops
      where user_id = ${r.user_id} and business_id = ${r.business_id} and email = ${r.owner_email}
    `;
  }
  return rows.length > 0;
}

/** The owner stops the reminders. True when the token named an address. */
export async function stopOwnerEmail(sql: Sql, token: string): Promise<boolean> {
  const rows = await sql<{
    user_id: string;
    business_id: string;
    owner_email: string;
    owner_email_unsubscribed_at: string;
  }>`
    update engagement_marks
    set owner_email_unsubscribed_at = coalesce(owner_email_unsubscribed_at, now())
    where owner_email_token = ${token} and owner_email is not null
    returning user_id, business_id, owner_email, owner_email_unsubscribed_at
  `;
  // Remembered by address, so clearing the address and entering it again
  // does not ask the owner a second time.
  for (const r of rows) {
    await sql`
      insert into owner_email_stops (user_id, business_id, email, token, stopped_at)
      values (${r.user_id}, ${r.business_id}, ${r.owner_email}, ${token}, ${r.owner_email_unsubscribed_at})
      on conflict (user_id, business_id, email) do update set
        token = excluded.token, stopped_at = excluded.stopped_at
    `;
  }
  return rows.length > 0;
}
