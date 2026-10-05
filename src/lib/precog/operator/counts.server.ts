import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { serverUtcDay, shiftDay } from "../dates";
import { weeklyActivation } from "../telemetry/events.server";
import { OPERATOR_COUNTS, type OperatorCountName, type OperatorCountResult } from "./texts";

type Row = Record<string, string | number | boolean | null>;

/**
 * The standing counts: fixed, read-only queries by name, with no parameters,
 * so the operator page can run them and nothing else. The SQL is the batch
 * plan's Integration 6, which the owner also runs in the Neon editor.
 */
const QUERIES: Record<OperatorCountName, (sql: Sql) => Promise<Row[]>> = {
  "running-subscriptions": (sql) => sql<Row>`
    select ba.user_id, ba.subscription_id, count(b.id)::int as clients
    from billing_accounts ba
    left join businesses b on b.firm_user_id = ba.user_id and b.deleted_at is null
    where ba.subscription_status in ('active', 'trialing', 'past_due')
    group by 1, 2 order by 3 desc
  `,
  "hand-marked": (sql) => sql<Row>`
    select f.user_id, f.name from firms f
    left join billing_accounts ba on ba.user_id = f.user_id
    where ba.user_id is null and f.plan = 'monthly'
    order by f.name
  `,
  "x-only-digest": (sql) => sql<Row>`
    select count(*)::int as accounts from notification_settings s
    join "user" u on u.id = s.user_id
    where s.weekly_digest
      and not exists (select 1 from account a where a."userId" = u.id
        and a."providerId" in ('credential', 'grok-google'))
      and exists (select 1 from account a where a."userId" = u.id and a."providerId" = 'grok-x')
  `,
  "google-unconfirmed-digest": (sql) => sql<Row>`
    select count(*)::int as accounts from notification_settings s
    join "user" u on u.id = s.user_id
    where s.weekly_digest and not u."emailVerified"
      and exists (select 1 from account a where a."userId" = u.id and a."providerId" = 'grok-google')
  `,
  "google-digest": (sql) => sql<Row>`
    select count(*)::int as accounts from notification_settings s
    join "user" u on u.id = s.user_id
    where s.weekly_digest
      and exists (select 1 from account a where a."userId" = u.id and a."providerId" = 'grok-google')
  `,
  "past-due": (sql) => sql<Row>`
    select count(*)::int as subscriptions from billing_accounts
    where subscription_status = 'past_due'
  `,
  "quickbooks-attention": (sql) => sql<Row>`
    select
      (count(*) filter (where last_error is not null
        or refresh_expires_at <= now() + interval '30 days'))::int as failing_or_lapsing,
      count(*)::int as connections
    from integration_connections
  `,
  "multi-member-firms": (sql) => sql<Row>`
    select count(*)::int as firms from (
      select firm_user_id from firm_members group by 1 having count(*) > 1
    ) t
  `,
  "retained-clients": (sql) => sql<Row>`
    select count(*)::int as businesses from businesses b
    where b.deleted_at is not null and b.firm_user_id is not null and b.granted_at is null
      and exists (select 1 from report_versions v
        where v.user_id = b.user_id and v.business_id = b.id)
  `,
  "no-price-yet": (sql) => sql<Row>`
    select count(*)::int as subscriptions from billing_accounts
    where subscription_status in ('active', 'trialing', 'past_due')
      and subscription_price_id is null
  `,
  "picture-storage": (sql) => sql<Row>`
    select pg_size_pretty(pg_total_relation_size('procedure_images')) as size
  `,
  "weekly-activation": async (sql) => {
    const today = serverUtcDay();
    const weeks = [];
    for (let i = 0; i < 8; i += 1) weeks.push(await weeklyActivation(sql, shiftDay(today, -7 * i)));
    return weeks.map((w) => ({
      week_ending: w.weekEnding,
      signed_up: w.signedUp,
      first_business: w.firstBusiness,
      first_locked_version: w.firstLockedVersion,
      first_report_sent: w.firstReportSent,
      first_monthly_review: w.firstMonthlyReview,
    }));
  },
};

/** True for a name the page offers. */
export function isOperatorCountName(name: unknown): name is OperatorCountName {
  return typeof name === "string" && OPERATOR_COUNTS.some((c) => c.name === name);
}

/**
 * Runs one standing count by name; any other name answers 404. Returns the
 * columns and rows as read; the page prints a single cell as a figure.
 */
export async function runCount(sql: Sql, name: unknown): Promise<OperatorCountResult> {
  if (!isOperatorCountName(name)) throw new RequestError(404, "Not found");
  const entry = OPERATOR_COUNTS.find((c) => c.name === name)!;
  const rows = await QUERIES[name](sql);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return {
    name,
    label: entry.label,
    columns,
    rows: rows.map((r) => columns.map((c) => r[c] ?? null)),
  };
}
