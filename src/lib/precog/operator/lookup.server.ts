import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import { isHandMarked, loadBillingAccount, subscriptionStatusLabel } from "../firm/billing-store";
import { loadEntitlements } from "../firm/entitlements.server";
import { loadFirmFor } from "../firm/store";
import { userDailyLimits, userScope } from "../llm/daily-usage";
import { operatorPlanLabel, type OperatorAccount } from "./texts";

export interface OperatorUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

/** The account using exactly this address (compared lower-cased), or null. Never a list. */
export async function findUserByEmail(sql: Sql, email: string): Promise<OperatorUser | null> {
  const rows = await sql<{
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  }>`
    select id, name, email, "emailVerified", "createdAt" from "user"
    where lower(email) = lower(${email})
    order by "createdAt" asc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email,
    emailVerified: Boolean(row.emailVerified),
    createdAt: toIsoTimestamp(row.createdAt),
  };
}

/** The account with this id, or null. */
export async function findUserById(
  sql: Sql,
  userId: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const rows = await sql<{ id: string; name: string | null; email: string }>`
    select id, name, email from "user" where id = ${userId}
  `;
  const row = rows[0];
  return row ? { id: row.id, name: row.name ?? "", email: row.email } : null;
}

/** The plan label the operator page prints for an account (operatorPlanLabel). */
export async function planLabelFor(sql: Sql, userId: string): Promise<string> {
  const firm = await loadFirmFor(sql, userId);
  const [e, handMarked] = await Promise.all([
    loadEntitlements(sql, userId),
    isHandMarked(sql, firm?.firmUserId ?? userId),
  ]);
  return operatorPlanLabel(e, handMarked);
}

/**
 * One account's support facts: sign-in, firm and role, business counts, the
 * billing row and plan, the last digest, an email stop, the newest QuickBooks
 * failure, today's model calls against the plan's limit, and the first-step
 * milestones. Reads only.
 */
export async function loadOperatorAccount(sql: Sql, user: OperatorUser): Promise<OperatorAccount> {
  const firm = await loadFirmFor(sql, user.id);
  const [
    providers,
    businesses,
    billing,
    entitlements,
    handMarked,
    digests,
    suppressions,
    failures,
    usage,
    milestones,
  ] = await Promise.all([
    sql<{ providerId: string }>`
      select distinct "providerId" from account where "userId" = ${user.id} order by 1
    `,
    sql<{ live: number; deleted: number }>`
      select count(*) filter (where deleted_at is null)::int as live,
        count(*) filter (where deleted_at is not null)::int as deleted
      from businesses where user_id = ${user.id} or firm_user_id = ${user.id}
    `,
    // The plan reads the firm owner's row; the customer shown is the account's own.
    loadBillingAccount(sql, user.id),
    loadEntitlements(sql, user.id),
    isHandMarked(sql, firm?.firmUserId ?? user.id),
    sql<{ sent_at: string; recipient: string }>`
      select sent_at, recipient from reminder_log where recipient = ${user.email}
      order by sent_at desc limit 1
    `,
    sql<{ reason: string }>`
      select reason from email_suppressions where email = lower(trim(${user.email}))
    `,
    sql<{ last_error: string; last_error_at: string | null }>`
      select c.last_error, c.last_error_at from integration_connections c
      join businesses b on b.user_id = c.user_id and b.id = c.business_id
      where (c.user_id = ${user.id} or b.firm_user_id = ${user.id})
        and c.last_error is not null
      order by c.last_error_at desc nulls last
      limit 1
    `,
    sql<{ calls: number }>`
      select calls from llm_daily_usage
      where scope = ${userScope(user.id)} and day = current_date
    `,
    sql<{ event: string; occurred_at: string }>`
      select event, occurred_at from product_events where user_id = ${user.id}
      order by occurred_at asc
    `,
  ]);
  const failure = failures[0];
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    providers: providers.map((p) => p.providerId),
    createdAt: user.createdAt,
    firm: firm ? { firmUserId: firm.firmUserId, name: firm.name, role: firm.role } : null,
    businesses: {
      live: Number(businesses[0]?.live ?? 0),
      deleted: Number(businesses[0]?.deleted ?? 0),
    },
    stripeCustomerId: billing?.stripeCustomerId ?? null,
    subscriptionLabel: subscriptionStatusLabel(billing?.subscriptionStatus ?? null),
    planLabel: operatorPlanLabel(entitlements, handMarked),
    lastDigest: digests[0]
      ? { sentAt: toIsoTimestamp(digests[0].sent_at), recipient: digests[0].recipient }
      : null,
    suppression: suppressions[0]?.reason ?? null,
    quickBooksFailure: failure
      ? { at: toIsoTimestampOrNull(failure.last_error_at), error: failure.last_error }
      : null,
    modelCalls: {
      today: Number(usage[0]?.calls ?? 0),
      limit: userDailyLimits(entitlements.aiPlan).limit,
    },
    milestones: milestones.map((m) => ({
      event: m.event,
      occurredAt: toIsoTimestamp(m.occurred_at),
    })),
  };
}
