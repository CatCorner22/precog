import type { Sql } from "@/lib/db";
import type { PracticeProfile } from "../practice-profile";
import { normalizeProfile } from "../practice-profile";
import { dueItemsFor, forAudience, type DueItem } from "./due-items";
import { renderDigest, renderOwnerReminder, type RenderedEmail } from "./email";

/**
 * The reminder run. For every account with the digest on: read each live
 * business the account or its firm holds, work out what is due, drop the
 * items already announced for that due date, and send one digest per
 * advisor plus one note per client owner who has an address on file. What
 * was sent is logged so the next run stays quiet about it.
 *
 * `send` is injected so the job runs against PGLite in a test with no
 * network; the cron route passes the real mailer.
 */
export interface DigestOutcome {
  advisors: number;
  owners: number;
  skipped: number;
  errors: string[];
}

interface Recipient {
  userId: string;
  email: string;
  firmName: string | null;
  firmUserId: string | null;
  ownerReminders: boolean;
}

interface BusinessRow {
  user_id: string;
  id: string;
  name: string;
  profile: PracticeProfile;
  owner_email: string | null;
}

async function recipients(sql: Sql): Promise<Recipient[]> {
  const rows = await sql<{
    id: string;
    email: string;
    firm_name: string | null;
    firm_user_id: string | null;
    owner_reminders: boolean | null;
  }>`
    select u.id, u.email, f.name as firm_name, m.firm_user_id, s.owner_reminders
    from "user" u
    left join notification_settings s on s.user_id = u.id
    left join lateral (
      select firm_user_id from firm_members where member_user_id = u.id
      order by (firm_user_id = u.id) desc, joined_at asc limit 1
    ) m on true
    left join firms f on f.user_id = m.firm_user_id
    where coalesce(s.weekly_digest, true)
      and position('@' in u.email) > 0
      and exists (select 1 from businesses b where b.user_id = u.id and b.deleted_at is null)
  `;
  return rows.map((r) => ({
    userId: r.id,
    email: r.email,
    firmName: r.firm_name,
    firmUserId: r.firm_user_id,
    ownerReminders: r.owner_reminders ?? true,
  }));
}

async function businessesFor(sql: Sql, recipient: Recipient): Promise<BusinessRow[]> {
  return sql<BusinessRow>`
    select b.user_id, b.id, b.name, b.profile, e.owner_email
    from businesses b
    left join engagement_marks e on e.user_id = b.user_id and e.business_id = b.id
    where b.deleted_at is null
      and (b.user_id = ${recipient.userId}
        or (${recipient.firmUserId}::text is not null and b.firm_user_id = ${recipient.firmUserId}))
  `;
}

/** Items not yet logged for this recipient at this due date. */
async function unannounced(
  sql: Sql,
  userId: string,
  businessId: string,
  recipient: string,
  items: readonly DueItem[],
): Promise<DueItem[]> {
  if (items.length === 0) return [];
  const sent = await sql<{ item_key: string; due_on: string | null }>`
    select item_key, due_on::text as due_on from reminder_log
    where user_id = ${userId} and business_id = ${businessId} and recipient = ${recipient}
  `;
  const seen = new Set(sent.map((r) => `${r.item_key}|${r.due_on ?? ""}`));
  return items.filter((item) => !seen.has(`${item.key}|${item.dueOn ?? ""}`));
}

async function logSent(
  sql: Sql,
  userId: string,
  businessId: string,
  recipient: string,
  items: readonly DueItem[],
): Promise<void> {
  for (const item of items) {
    await sql`
      insert into reminder_log (user_id, business_id, item_key, due_on, recipient)
      values (${userId}, ${businessId}, ${item.key}, ${item.dueOn}, ${recipient})
      on conflict do nothing
    `;
  }
}

export async function runDigest(
  sql: Sql,
  input: {
    today: string;
    appUrl: string;
    send: (to: string, message: RenderedEmail) => Promise<void>;
  },
): Promise<DigestOutcome> {
  const outcome: DigestOutcome = { advisors: 0, owners: 0, skipped: 0, errors: [] };
  const ownerNotesSent = new Set<string>();

  for (const recipient of await recipients(sql)) {
    const clients: { businessName: string; items: DueItem[]; row: BusinessRow }[] = [];
    for (const row of await businessesFor(sql, recipient)) {
      const profile = normalizeProfile(row.profile);
      const items = dueItemsFor(profile, input.today);
      const fresh = await unannounced(
        sql,
        row.user_id,
        row.id,
        recipient.email,
        forAudience(items, "advisor"),
      );
      if (fresh.length > 0) clients.push({ businessName: row.name, items: fresh, row });

      // The owner's note goes once per business per run, whoever's digest
      // reached it first, and only when the firm allows owner reminders.
      const ownerKey = `${row.user_id}/${row.id}`;
      if (row.owner_email && recipient.ownerReminders && !ownerNotesSent.has(ownerKey)) {
        const ownerItems = await unannounced(
          sql,
          row.user_id,
          row.id,
          row.owner_email,
          forAudience(items, "owner"),
        );
        if (ownerItems.length > 0) {
          ownerNotesSent.add(ownerKey);
          try {
            await input.send(
              row.owner_email,
              renderOwnerReminder({
                businessName: row.name,
                firmName: recipient.firmName,
                items: ownerItems,
              }),
            );
            await logSent(sql, row.user_id, row.id, row.owner_email, ownerItems);
            outcome.owners += 1;
          } catch (err) {
            outcome.errors.push(
              `owner ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
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
          clients: clients.map((c) => ({ businessName: c.businessName, items: c.items })),
          appUrl: input.appUrl,
        }),
      );
      for (const client of clients) {
        await logSent(sql, client.row.user_id, client.row.id, recipient.email, client.items);
      }
      outcome.advisors += 1;
    } catch (err) {
      outcome.errors.push(
        `digest ${recipient.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return outcome;
}
