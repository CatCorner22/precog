import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";

/**
 * What the payment provider last said about an account. Rows are written by
 * the Stripe webhook alone; the firm workspace reads them.
 */
export interface BillingAccount {
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  assessmentPaidAt: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function loadBillingAccount(sql: Sql, userId: string): Promise<BillingAccount | null> {
  const rows = await sql<{
    stripe_customer_id: string | null;
    subscription_id: string | null;
    subscription_status: string | null;
    assessment_paid_at: string | null;
    current_period_end: string | null;
    updated_at: string;
  }>`
    select stripe_customer_id, subscription_id, subscription_status, assessment_paid_at,
      current_period_end, updated_at
    from billing_accounts where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    stripeCustomerId: row.stripe_customer_id,
    subscriptionId: row.subscription_id,
    subscriptionStatus: row.subscription_status,
    assessmentPaidAt: toIsoTimestampOrNull(row.assessment_paid_at),
    currentPeriodEnd: toIsoTimestampOrNull(row.current_period_end),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export async function recordAssessmentPayment(
  sql: Sql,
  userId: string,
  stripeCustomerId: string | null,
): Promise<void> {
  await sql`
    insert into billing_accounts (user_id, stripe_customer_id, assessment_paid_at, updated_at)
    values (${userId}, ${stripeCustomerId}, now(), now())
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_accounts.stripe_customer_id),
      assessment_paid_at = coalesce(billing_accounts.assessment_paid_at, now()),
      updated_at = now()
  `;
}

export async function recordSubscription(
  sql: Sql,
  input: {
    userId: string;
    stripeCustomerId: string | null;
    subscriptionId: string;
    status: string;
    currentPeriodEnd: string | null;
  },
): Promise<void> {
  await sql`
    insert into billing_accounts
      (user_id, stripe_customer_id, subscription_id, subscription_status, current_period_end, updated_at)
    values (
      ${input.userId}, ${input.stripeCustomerId}, ${input.subscriptionId}, ${input.status},
      ${input.currentPeriodEnd}, now()
    )
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_accounts.stripe_customer_id),
      subscription_id = excluded.subscription_id,
      subscription_status = excluded.subscription_status,
      current_period_end = excluded.current_period_end,
      updated_at = now()
  `;
}

/** The account a Stripe customer id belongs to, or null. */
export async function userForCustomer(sql: Sql, stripeCustomerId: string): Promise<string | null> {
  const rows = await sql<{ user_id: string }>`
    select user_id from billing_accounts where stripe_customer_id = ${stripeCustomerId}
  `;
  return rows[0]?.user_id ?? null;
}

/** True the first time an event id is seen; false for a redelivery. */
export async function claimBillingEvent(sql: Sql, id: string, type: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    insert into billing_events (id, type) values (${id}, ${type})
    on conflict (id) do nothing
    returning id
  `;
  return rows.length > 0;
}
