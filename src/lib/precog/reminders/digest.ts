import type { Sql } from "@/lib/db";
import { reportServerError } from "@/lib/observability/report.server";
import { normalizeProfile, type PracticeProfile } from "../practice-profile";
import { digestTokenFor } from "../firm/store";
import { randomHex } from "@/lib/web-crypto";
import { beforeDeadline } from "../cron/budget";
import { loadEntitlements } from "../firm/entitlements.server";
import { EXPIRY_WARNING_DAYS } from "../integrations/qbo/alert-email";
import { dueItemsFor, forAudience, type ReminderItem } from "./due-items";
import { renderDigest, renderOwnerReminder, type RenderedEmail } from "./email";
import { NOT_SUPPRESSED } from "./suppression-store";
import { TRUSTED_EMAIL } from "../firm/vouched-email";

interface DigestOutcome {
  advisors: number;
  owners: number;
  skipped: number;
  errors: string[];
  /** The deadline came before every recipient and owner note was covered. */
  stopped: boolean;
  /** Recipients and owner notes left for the next run when stopped. */
  remaining: number;
}

/**
 * The reminder run, in two passes. First, for every account that turned the
 * digest on (nobody is opted in by default; an account with no settings row
 * gets nothing): read each live business the account or its firm holds, work out what
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
 * A business the normaliser throws on is reported, named in `errors` and
 * left out; every other business and recipient still gets its email.
 *
 * With a `deadline` (epoch milliseconds) the run stops before the next
 * recipient or owner note once it is reached, and says how many it left;
 * nothing left is logged, so the next run sends it.
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
    deadline?: number;
  },
): Promise<DigestOutcome> {
  const outcome: DigestOutcome = {
    advisors: 0,
    owners: 0,
    skipped: 0,
    errors: [],
    stopped: false,
    remaining: 0,
  };
  // Each business's profile is read once per run, however many recipients
  // share it. Null for a business that could not be read: reported once, then skipped.
  const itemsByBusiness = new Map<string, ReminderItem[] | null>();
  const itemsFor = async (row: BusinessRow): Promise<ReminderItem[]> => {
    const businessKey = `${row.user_id}/${row.id}`;
    let items = itemsByBusiness.get(businessKey);
    if (items === undefined) {
      try {
        const profile = await profileFor(sql, row);
        // Deleted since the run listed it: nothing to announce.
        items = profile
          ? dueItemsFor(normalizeProfile(profile), input.today, {
              hasFirm: row.firm_user_id !== null,
            })
          : [];
      } catch (err) {
        items = null;
        outcome.errors.push(`business ${row.id}: ${errorText(err)}`);
        await reportServerError(err, "digest-normalize");
      }
      itemsByBusiness.set(businessKey, items);
    }
    return items ?? [];
  };

  const everyone = await recipients(sql);
  const quickBooksCounts = await quickBooksNeedingAttention(sql, everyone);
  const reviewCounts = await versionsAwaitingReview(sql, everyone);
  for (const [index, recipient] of everyone.entries()) {
    if (!beforeDeadline(input.deadline)) {
      outcome.stopped = true;
      outcome.remaining += everyone.length - index;
      break;
    }
    const clients: { row: BusinessRow; items: ReminderItem[] }[] = [];
    for (const row of await businessesFor(sql, recipient)) {
      const items = forAudience(await itemsFor(row), "advisor");
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
          clients: clients.map((c) => ({
            businessId: c.row.id,
            businessName: c.row.name,
            items: c.items,
          })),
          appUrl: input.appUrl,
          unsubscribeUrl: `${input.appUrl}/api/digest-email?do=stop&token=${recipient.digestToken}`,
          quickBooks: { needAttention: quickBooksCounts.get(recipient.userId) ?? 0 },
          reviews: { awaiting: reviewCounts.get(recipient.userId) ?? 0 },
        }),
      );
      for (const client of clients) await logSent(sql, client.row, recipient.email, client.items);
      outcome.advisors += 1;
    } catch (err) {
      outcome.errors.push(`digest ${recipient.userId}: ${errorText(err)}`);
    }
  }

  // Owner reminder emails are part of the paid plans: the controlling
  // account's plan (the firm owner's for a firm client) decides, read once
  // per account per run.
  const reminderEmailsOpen = new Map<string, Promise<boolean>>();
  const ownerRemindersOpen = (userId: string): Promise<boolean> => {
    let open = reminderEmailsOpen.get(userId);
    if (!open) {
      open = loadEntitlements(sql, userId).then((e) => e.features.ownerReminders);
      reminderEmailsOpen.set(userId, open);
    }
    return open;
  };

  const notes = await ownerNoteTargets(sql);
  for (const [index, row] of notes.entries()) {
    if (!beforeDeadline(input.deadline)) {
      outcome.stopped = true;
      outcome.remaining += notes.length - index;
      break;
    }
    if (!(await ownerRemindersOpen(row.controlling_user_id))) {
      outcome.skipped += 1;
      continue;
    }
    const ownerItems = await unannounced(
      sql,
      row,
      row.owner_email,
      forAudience(await itemsFor(row), "owner"),
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
  /** What the digest's stop link carries; minted on the first digest. */
  digestToken: string;
}

interface BusinessRow {
  user_id: string;
  id: string;
  name: string;
  /** The firm working on the business; null for an owner's own business. */
  firm_user_id: string | null;
}

interface OwnerNoteRow extends BusinessRow {
  owner_email: string;
  owner_email_token: string;
  firm_name: string | null;
  /** The controlling account's address, when Precog trusts it. */
  reply_to: string | null;
  /** The account whose plan and switch decide: the firm owner for a firm client. */
  controlling_user_id: string;
}

/**
 * An account whose address Precog trusts (firm/vouched-email.ts): the firm
 * join's rule, so an X-only account, whose sign-in carries a made-up
 * address, receives nothing. A password sign-up that never confirmed its
 * address could have typed anyone's. The QuickBooks alert reads the same rule.
 */
export { TRUSTED_EMAIL };

/**
 * Accounts that turned the digest on (a missing settings row means off), with
 * a trusted address that has not bounced or complained, and at least one live
 * business of their own or of a firm they belong to. The firm is the one the
 * workspace shows (loadFirmFor's order: the firm the account owns, else the
 * one it joined first), read in the same query, so the digest and the
 * workspace always agree. Stop-link tokens missing on first send are minted
 * in one statement for every recipient that needs one.
 */
async function recipients(sql: Sql): Promise<Recipient[]> {
  const rows = await sql.query<{
    id: string;
    email: string;
    digest_token: string | null;
    firm_user_id: string | null;
    firm_name: string | null;
  }>(`
    select u.id, u.email, s.digest_token, wf.firm_user_id, wf.name as firm_name
    from "user" u
    left join notification_settings s on s.user_id = u.id
    left join lateral (
      select m.firm_user_id, f.name
      from firm_members m
      join firms f on f.user_id = m.firm_user_id
      where m.member_user_id = u.id
      order by (m.firm_user_id = u.id) desc, m.joined_at asc
      limit 1
    ) wf on true
    where coalesce(s.weekly_digest, false)
      and position('@' in u.email) > 0
      and ${TRUSTED_EMAIL("u")}
      and ${NOT_SUPPRESSED("u.email")}
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
  const tokens = await mintDigestTokens(
    sql,
    rows.filter((r) => !r.digest_token).map((r) => r.id),
  );
  const out: Recipient[] = [];
  for (const row of rows) {
    out.push({
      userId: row.id,
      email: row.email,
      firmName: row.firm_name ?? null,
      firmUserId: row.firm_user_id ?? null,
      digestToken: row.digest_token ?? tokens.get(row.id) ?? (await digestTokenFor(sql, row.id)),
    });
  }
  return out;
}

/**
 * Mints the digest's stop-link token (digestTokenFor's format) for each
 * account that has none, in one statement. An account that gained a token
 * meanwhile keeps it and is absent from the answer; the caller then reads it
 * with digestTokenFor.
 */
async function mintDigestTokens(sql: Sql, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const minted = await sql<{ user_id: string; digest_token: string }>`
    update notification_settings s set digest_token = t.token, updated_at = now()
    from unnest(${userIds}::text[], ${userIds.map(() => randomHex(24))}::text[]) as t(user_id, token)
    where s.user_id = t.user_id and s.digest_token is null
    returning s.user_id, s.digest_token
  `;
  return new Map(minted.map((r) => [r.user_id, r.digest_token]));
}

async function businessesFor(sql: Sql, recipient: Recipient): Promise<BusinessRow[]> {
  return sql<BusinessRow>`
    select b.user_id, b.id, b.name, b.firm_user_id
    from businesses b
    where b.deleted_at is null
      and (b.user_id = ${recipient.userId}
        or (${recipient.firmUserId}::text is not null and b.firm_user_id = ${recipient.firmUserId}))
    order by b.user_id, b.id
  `;
}

/**
 * For every recipient, how many of their businesses (businessesFor) have a
 * QuickBooks connection whose last reading failed or whose permission ends
 * within the alert's warning period; the digest prints the count as one
 * line. One grouped query per run; a recipient with none is absent.
 */
async function quickBooksNeedingAttention(
  sql: Sql,
  everyone: readonly Recipient[],
): Promise<Map<string, number>> {
  if (everyone.length === 0) return new Map();
  const rows = await sql<{ user_id: string; n: number }>`
    select r.user_id, count(*)::int as n
    from unnest(
      ${everyone.map((r) => r.userId)}::text[],
      ${everyone.map((r) => r.firmUserId)}::text[]
    ) as r(user_id, firm_user_id)
    join businesses b on b.deleted_at is null
      and (b.user_id = r.user_id
        or (r.firm_user_id is not null and b.firm_user_id = r.firm_user_id))
    join integration_connections c on c.user_id = b.user_id and c.business_id = b.id
    where c.provider = 'qbo'
      and (c.last_error is not null
        or c.refresh_expires_at <= now() + make_interval(days => ${EXPIRY_WARNING_DAYS}::int))
    group by r.user_id
  `;
  return new Map(rows.map((r) => [r.user_id, Number(r.n)]));
}

/**
 * For every recipient, how many locked versions of their firm's live clients
 * await their review for issuance: requested, neither reviewed nor returned,
 * not prepared by them, while they are the firm's owner or a reviewer; and
 * requested from them, or from nobody in particular, or from someone who is
 * no longer an owner or reviewer of the firm (so a request never waits on a
 * person who cannot act). One grouped query per run; a recipient with none
 * is absent. The line rides on a digest that goes anyway.
 */
async function versionsAwaitingReview(
  sql: Sql,
  everyone: readonly Recipient[],
): Promise<Map<string, number>> {
  const members = everyone.filter((r) => r.firmUserId !== null);
  if (members.length === 0) return new Map();
  const rows = await sql<{ user_id: string; n: number }>`
    select r.user_id, count(*)::int as n
    from unnest(
      ${members.map((r) => r.userId)}::text[],
      ${members.map((r) => r.firmUserId)}::text[]
    ) as r(user_id, firm_user_id)
    join firm_members m on m.firm_user_id = r.firm_user_id
      and m.member_user_id = r.user_id and m.role in ('owner', 'reviewer')
    join businesses b on b.deleted_at is null and b.firm_user_id = r.firm_user_id
    join report_versions v on v.user_id = b.user_id and v.business_id = b.id
    where v.review_requested_at is not null
      and v.reviewed_at is null
      and v.returned_at is null
      and v.prepared_by is distinct from r.user_id
      and (v.review_requested_from = r.user_id
        or v.review_requested_from is null
        or not exists (
          select 1 from firm_members f
          where f.firm_user_id = r.firm_user_id
            and f.member_user_id = v.review_requested_from
            and f.role in ('owner', 'reviewer')
        ))
    group by r.user_id
  `;
  return new Map(rows.map((r) => [r.user_id, Number(r.n)]));
}

/**
 * Live businesses whose owner confirmed their address, has not stopped the
 * reminders and whose address has not bounced or complained, where the
 * controlling account (the firm owner for a firm client) has owner reminders on.
 */
async function ownerNoteTargets(sql: Sql): Promise<OwnerNoteRow[]> {
  return sql.query<OwnerNoteRow>(`
    select b.user_id, b.id, b.name, b.firm_user_id, e.owner_email, e.owner_email_token,
      f.name as firm_name,
      case when ${TRUSTED_EMAIL("cu")} then cu.email end as reply_to,
      coalesce(b.firm_user_id, b.user_id) as controlling_user_id
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
      and ${NOT_SUPPRESSED("e.owner_email")}
      and coalesce(ns.owner_reminders, true)
    order by b.user_id, b.id
  `);
}

/**
 * The profile fields the digest leaves out: the map's saved versions, saved
 * blocks, health history and layout. What is due (dueItemsFor) never reads
 * them, and they are most of a large profile. A due item that needs one of
 * them must come off this list; reminders.test.ts compares the items.
 */
export const DIGEST_OMITTED_PROFILE_KEYS = [
  "mapVersions",
  "savedProcessBlocks",
  "mapHealthHistory",
  "mapCompletenessHistory",
  "mapLayout",
] as const satisfies readonly (keyof PracticeProfile)[];

/**
 * One live business's profile without DIGEST_OMITTED_PROFILE_KEYS. Null when
 * the business is gone.
 */
async function profileFor(
  sql: Sql,
  business: Pick<BusinessRow, "user_id" | "id">,
): Promise<Partial<PracticeProfile> | null> {
  const rows = await sql<{ profile: Partial<PracticeProfile> }>`
    select case when jsonb_typeof(profile) = 'object'
        then profile - ${[...DIGEST_OMITTED_PROFILE_KEYS]}::text[]
        else profile end as profile
    from businesses
    where user_id = ${business.user_id} and id = ${business.id} and deleted_at is null
  `;
  return rows[0]?.profile ?? null;
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
