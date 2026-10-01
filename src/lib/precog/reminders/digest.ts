import type { Sql } from "@/lib/db";
import { normalizeProfile, type PracticeProfile } from "../practice-profile";
import { loadFirmFor } from "../firm/store";
import { dueItemsFor, forAudience, type ReminderItem } from "./due-items";
import { renderDigest, renderOwnerReminder, type RenderedEmail } from "./email";

interface DigestOutcome {
  advisors: number;
  owners: number;
  skipped: number;
  errors: string[];
}

/**
 * The reminder run, in two passes. First, for every account with the digest
 * on: read each live business the account or its firm holds, work out what
 * is due, drop the items already announced for that due date, and send one
 * digest per advisor. Then, apart from who receives a digest, one note per
 * client owner whose address is confirmed and not stopped. What was sent is
 * logged so the next run stays quiet about it until an overdue item is due
 * to be announced again.
 *
 * Whether a client's owner is emailed is the setting of the account that
 * controls the business (the firm owner for a firm client), so a preparer's
 * switch cannot override the firm's, and turning one's own digest off does
 * not stop the owners' notes.
 *
 * `send` is injected so the job runs against PGLite in a test with no
 * network; the cron route passes the real mailer.
 */
export async function runDigest(
  sql: Sql,
  input: {
    today: string;
    appUrl: string;
    send: (to: string, message: RenderedEmail) => Promise<void>;
  },
): Promise<DigestOutcome> {
  const outcome: DigestOutcome = { advisors: 0, owners: 0, skipped: 0, errors: [] };
  const itemsByBusiness = new Map<string, ReminderItem[]>();
  const itemsFor = (row: BusinessRow): ReminderItem[] => {
    const businessKey = `${row.user_id}/${row.id}`;
    let items = itemsByBusiness.get(businessKey);
    if (!items) {
      items = dueItemsFor(normalizeProfile(row.profile), input.today);
      itemsByBusiness.set(businessKey, items);
    }
    return items;
  };

  for (const recipient of await recipients(sql)) {
    const clients: { row: BusinessRow; items: ReminderItem[] }[] = [];
    for (const row of await businessesFor(sql, recipient)) {
      const items = forAudience(itemsFor(row), "advisor");
      const fresh = await unannounced(sql, row, recipient.email, items);
      if (fresh.length > 0) clients.push({ row, items: fresh });
    }

    if (clients.length === 0) {
      outcome.skipped += 1;
      continue;
    }
    try {
      await input.send(
        recipient.email,
        renderDigest({
          firmName: recipient.firmName,
          clients: clients.map((c) => ({ businessName: c.row.name, items: c.items })),
          appUrl: input.appUrl,
        }),
      );
      for (const client of clients) await logSent(sql, client.row, recipient.email, client.items);
      outcome.advisors += 1;
    } catch (err) {
      outcome.errors.push(`digest ${recipient.userId}: ${errorText(err)}`);
    }
  }

  for (const row of await ownerNoteTargets(sql)) {
    const ownerItems = await unannounced(
      sql,
      row,
      row.owner_email,
      forAudience(itemsFor(row), "owner"),
    );
    if (ownerItems.length === 0) continue;
    try {
      await input.send(
        row.owner_email,
        renderOwnerReminder({
          businessName: row.name,
          firmName: row.firm_name,
          items: ownerItems,
          ...(row.reply_to ? { advisorEmail: row.reply_to } : {}),
          unsubscribeUrl: `${input.appUrl}/api/owner-email?do=stop&token=${row.owner_email_token}`,
        }),
      );
      await logSent(sql, row, row.owner_email, ownerItems);
      outcome.owners += 1;
    } catch (err) {
      outcome.errors.push(`owner ${row.id}: ${errorText(err)}`);
    }
  }
  return outcome;
}

interface Recipient {
  userId: string;
  email: string;
  firmName: string | null;
  firmUserId: string | null;
}

interface BusinessRow {
  user_id: string;
  id: string;
  name: string;
  profile: PracticeProfile;
}

interface OwnerNoteRow extends BusinessRow {
  owner_email: string;
  owner_email_token: string;
  firm_name: string | null;
  /** The controlling account's address, when Precog trusts it. */
  reply_to: string | null;
}

/**
 * An account whose address Precog trusts: confirmed, or signed in through
 * Google or X. A password sign-up that never confirmed its address could
 * have typed anyone's.
 */
const TRUSTED_EMAIL = (alias: string) => `(
  ${alias}."emailVerified"
  or exists (
    select 1 from account a
    where a."userId" = ${alias}.id and a."providerId" in ('grok-google', 'grok-x')
  )
)`;

/**
 * Accounts with the digest on, a trusted address, and at least one live
 * business of their own or of a firm they belong to. The firm is the one the
 * workspace shows (loadFirmFor), so the digest and the workspace always agree.
 */
async function recipients(sql: Sql): Promise<Recipient[]> {
  const rows = await sql.query<{ id: string; email: string }>(`
    select u.id, u.email
    from "user" u
    left join notification_settings s on s.user_id = u.id
    where coalesce(s.weekly_digest, true)
      and position('@' in u.email) > 0
      and ${TRUSTED_EMAIL("u")}
      and exists (
        select 1 from businesses b
        where b.deleted_at is null
          and (b.user_id = u.id
            or b.firm_user_id in (
              select firm_user_id from firm_members where member_user_id = u.id
            ))
      )
    order by u.id
  `);
  const out: Recipient[] = [];
  for (const row of rows) {
    const firm = await loadFirmFor(sql, row.id);
    out.push({
      userId: row.id,
      email: row.email,
      firmName: firm?.name ?? null,
      firmUserId: firm?.firmUserId ?? null,
    });
  }
  return out;
}

async function businessesFor(sql: Sql, recipient: Recipient): Promise<BusinessRow[]> {
  return sql<BusinessRow>`
    select b.user_id, b.id, b.name, b.profile
    from businesses b
    where b.deleted_at is null
      and (b.user_id = ${recipient.userId}
        or (${recipient.firmUserId}::text is not null and b.firm_user_id = ${recipient.firmUserId}))
    order by b.user_id, b.id
  `;
}

/**
 * Live businesses whose owner confirmed their address and has not stopped
 * the reminders, where the controlling account (the firm owner for a firm
 * client) has owner reminders on.
 */
async function ownerNoteTargets(sql: Sql): Promise<OwnerNoteRow[]> {
  return sql.query<OwnerNoteRow>(`
    select b.user_id, b.id, b.name, b.profile, e.owner_email, e.owner_email_token,
      f.name as firm_name,
      case when ${TRUSTED_EMAIL("cu")} then cu.email end as reply_to
    from businesses b
    join engagement_marks e on e.user_id = b.user_id and e.business_id = b.id
    left join notification_settings ns on ns.user_id = coalesce(b.firm_user_id, b.user_id)
    left join firms f on f.user_id = coalesce(b.firm_user_id, b.user_id)
    left join "user" cu on cu.id = coalesce(b.firm_user_id, b.user_id)
    where b.deleted_at is null
      and e.owner_email is not null
      and e.owner_email_token is not null
      and e.owner_email_confirmed_at is not null
      and e.owner_email_unsubscribed_at is null
      and coalesce(ns.owner_reminders, true)
    order by b.user_id, b.id
  `);
}

/** Items not yet logged for this recipient at this due date and announcement. */
async function unannounced(
  sql: Sql,
  business: Pick<BusinessRow, "user_id" | "id">,
  recipient: string,
  items: readonly ReminderItem[],
): Promise<ReminderItem[]> {
  if (items.length === 0) return [];
  const sent = await sql<{ item_key: string; due_on: string }>`
    select item_key, due_on::text as due_on from reminder_log
    where user_id = ${business.user_id} and business_id = ${business.id}
      and recipient = ${recipient}
      and item_key = any(${items.map((item) => item.announceKey)}::text[])
  `;
  const seen = new Set(sent.map((r) => `${r.item_key}|${r.due_on}`));
  return items.filter((item) => !seen.has(`${item.announceKey}|${item.dueOn}`));
}

async function logSent(
  sql: Sql,
  business: Pick<BusinessRow, "user_id" | "id">,
  recipient: string,
  items: readonly ReminderItem[],
): Promise<void> {
  await sql`
    insert into reminder_log (user_id, business_id, item_key, due_on, recipient)
    select ${business.user_id}, ${business.id}, t.item_key, t.due_on::date, ${recipient}
    from unnest(
      ${items.map((item) => item.announceKey)}::text[],
      ${items.map((item) => item.dueOn)}::text[]
    ) as t(item_key, due_on)
    on conflict do nothing
  `;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
